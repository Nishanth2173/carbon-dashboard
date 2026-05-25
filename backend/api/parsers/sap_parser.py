"""
SAP Flat File Parser - handles tab-delimited IDoc/SM35 exports.

Real-world SAP exports (researched):
- Format: Tab-delimited flat file from transaction SM35 or SXDA
- Date format: DD.MM.YYYY (German locale default)
- Quantity field: MENGE, unit: MEINS (German)
- Plant codes: e.g. 1001, WERK_HH - need lookup
- Material numbers: 18-digit MATNR
- Document currency: WAERS

We handle: fuel purchases (diesel, petrol, LPG, natural gas)
We ignore: complex IDoc segments, multi-level BOMs, SD module data
"""

import pandas as pd
import hashlib
import json
from datetime import datetime
from typing import Tuple

# Emission factors (kg CO2e per liter or per m3/kg) - DEFRA 2024
FUEL_EMISSION_FACTORS = {
    'diesel':       {'factor': 2.5390, 'unit': 'liters', 'category': 'diesel'},
    'petrol':       {'factor': 2.3141, 'unit': 'liters', 'category': 'petrol'},
    'natural_gas':  {'factor': 2.0427, 'unit': 'cubic_meters', 'category': 'natural_gas'},
    'lpg':          {'factor': 1.5551, 'unit': 'liters', 'category': 'lpg'},
}

# SAP unit code -> canonical unit + fuel type mapping
UNIT_MAPPING = {
    'L':    ('liters', None),   # liters, fuel type from material
    'LTR':  ('liters', None),
    'M3':   ('cubic_meters', 'natural_gas'),
    'KG':   ('kg', None),
    'GAL':  ('gallons_us', None),
}

# Material number prefix -> fuel type
MATERIAL_FUEL_MAP = {
    '1000': 'diesel',
    '1001': 'diesel',
    '1002': 'petrol',
    '1003': 'natural_gas',
    '1004': 'lpg',
    '2000': 'diesel',
    '3000': 'natural_gas',
}

GERMAN_MONTH_MAP = {
    'Jan': '01', 'Feb': '02', 'Mrz': '03', 'Apr': '04',
    'Mai': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
    'Sep': '09', 'Okt': '10', 'Nov': '11', 'Dez': '12',
}


def parse_sap_date(date_str: str) -> datetime:
    """Parse SAP date formats: DD.MM.YYYY, YYYYMMDD, DD/MM/YYYY"""
    date_str = str(date_str).strip()
    for fmt in ('%d.%m.%Y', '%Y%m%d', '%d/%m/%Y', '%Y-%m-%d', '%m/%d/%Y'):
        try:
            return datetime.strptime(date_str, fmt)
        except ValueError:
            continue
    raise ValueError(f"Cannot parse SAP date: {date_str}")


def gallons_to_liters(gallons: float) -> float:
    return gallons * 3.78541


def kg_to_liters_diesel(kg: float) -> float:
    """Diesel density ~0.850 kg/L"""
    return kg / 0.850


def normalize_quantity(value: float, unit: str, fuel_type: str) -> Tuple[float, str]:
    """Returns (normalized_value, canonical_unit)"""
    unit = unit.upper().strip()
    if unit in ('L', 'LTR'):
        return value, 'liters'
    if unit == 'M3':
        return value, 'cubic_meters'
    if unit == 'GAL':
        return gallons_to_liters(value), 'liters'
    if unit == 'KG' and fuel_type == 'diesel':
        return kg_to_liters_diesel(value), 'liters'
    if unit == 'KG' and fuel_type == 'natural_gas':
        # 1 kg natural gas ~ 1.336 m3
        return value * 1.336, 'cubic_meters'
    return value, unit.lower()


def detect_fuel_type(row: dict) -> str:
    """Infer fuel type from material number or description."""
    matnr = str(row.get('MATNR', '')).strip()
    maktx = str(row.get('MAKTX', '')).lower()  # material description
    for prefix, fuel in MATERIAL_FUEL_MAP.items():
        if matnr.startswith(prefix):
            return fuel
    for keyword in ['diesel', 'petrol', 'gasoline', 'gas', 'natural', 'lpg', 'propane']:
        if keyword in maktx:
            if keyword in ('diesel',): return 'diesel'
            if keyword in ('petrol', 'gasoline'): return 'petrol'
            if keyword in ('natural', 'gas'): return 'natural_gas'
            if keyword in ('lpg', 'propane'): return 'lpg'
    return 'diesel'  # default assumption


def parse_sap_file(file_obj, job, organization) -> Tuple[list, list]:
    """
    Parse SAP flat file export. Returns (records, failures).
    Accepts tab-delimited or comma-delimited.
    """
    from api.models import EmissionRecord, IngestionFailure

    records = []
    failures = []

    try:
        # Try tab-delimited first (typical SAP), fall back to comma
        try:
            df = pd.read_csv(file_obj, sep='\t', encoding='utf-8', dtype=str)
        except Exception:
            file_obj.seek(0)
            df = pd.read_csv(file_obj, sep=',', encoding='utf-8', dtype=str)
        
        df.columns = [c.strip().upper() for c in df.columns]
        df = df.fillna('')
    except Exception as e:
        return [], [{'row_index': 0, 'raw_row': {}, 'failure_reason': str(e), 'failure_type': 'parse_error'}]

    required_cols_options = [
        ['BLDAT', 'MENGE', 'MEINS'],   # posting date, quantity, unit
        ['BUDAT', 'MENGE', 'MEINS'],
        ['DATE', 'QUANTITY', 'UNIT'],
    ]

    col_map = {'date': None, 'quantity': None, 'unit': None}
    for option in required_cols_options:
        if all(c in df.columns for c in option):
            col_map['date'] = option[0]
            col_map['quantity'] = option[1]
            col_map['unit'] = option[2]
            break

    if not col_map['date']:
        # Try flexible column detection
        for c in df.columns:
            if 'date' in c.lower() or 'dat' in c.lower():
                col_map['date'] = c
                break
        for c in df.columns:
            if 'menge' in c.lower() or 'qty' in c.lower() or 'quantity' in c.lower():
                col_map['quantity'] = c
                break
        for c in df.columns:
            if 'meins' in c.lower() or 'unit' in c.lower():
                col_map['unit'] = c
                break

    for idx, row in df.iterrows():
        raw = row.to_dict()
        row_num = idx + 2  # 1-indexed with header

        try:
            # Date
            date_val = row.get(col_map['date'], '')
            if not date_val:
                raise ValueError("Missing date field")
            parsed_date = parse_sap_date(date_val)

            # Quantity
            qty_str = str(row.get(col_map['quantity'], '')).replace(',', '.').strip()
            if not qty_str:
                raise ValueError("Missing quantity")
            qty = float(qty_str)
            if qty <= 0:
                raise ValueError(f"Non-positive quantity: {qty}")

            # Unit
            unit_str = str(row.get(col_map['unit'], 'L')).strip().upper()

            # Fuel type
            fuel_type = detect_fuel_type(raw)

            # Normalize quantity
            norm_qty, norm_unit = normalize_quantity(qty, unit_str, fuel_type)

            # Emission factor
            ef_data = FUEL_EMISSION_FACTORS.get(fuel_type, FUEL_EMISSION_FACTORS['diesel'])

            # Plant / site
            plant = str(row.get('WERKS', row.get('PLANT', ''))).strip()
            cost_center = str(row.get('KOSTL', row.get('COST_CENTER', ''))).strip()
            site = plant or cost_center

            # Source hash for duplicate detection
            hash_str = f"{parsed_date.date()}{norm_qty}{fuel_type}{site}"
            source_hash = hashlib.sha256(hash_str.encode()).hexdigest()

            record_data = {
                'organization': organization,
                'ingestion_job': job,
                'scope': 'scope1',
                'category': ef_data['category'],
                'activity_value': norm_qty,
                'activity_unit': norm_unit,
                'activity_date': parsed_date.date(),
                'emission_factor': ef_data['factor'],
                'emission_factor_source': 'DEFRA 2024 - UK GHG Conversion Factors',
                'co2e_kg': norm_qty * ef_data['factor'],
                'site_or_cost_center': site,
                'country': str(row.get('LAND1', row.get('COUNTRY', ''))).strip(),
                'source_row_index': row_num,
                'raw_data': {k: str(v) for k, v in raw.items()},
                'source_hash': source_hash,
                'status': 'pending',
            }
            records.append(record_data)

        except Exception as e:
            failures.append({
                'ingestion_job': job,
                'row_index': row_num,
                'raw_row': {k: str(v) for k, v in raw.items()},
                'failure_reason': str(e),
                'failure_type': classify_failure(str(e)),
            })

    return records, failures


def classify_failure(msg: str) -> str:
    msg_lower = msg.lower()
    if 'date' in msg_lower:
        return 'invalid_date'
    if 'quantity' in msg_lower or 'float' in msg_lower:
        return 'missing_field'
    if 'unit' in msg_lower:
        return 'invalid_unit'
    return 'parse_error'
