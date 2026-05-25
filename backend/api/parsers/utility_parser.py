"""
Utility Electricity CSV Parser.

Real-world format (researched):
- Source: Portal CSV download (e.g. BESCOM India, PG&E USA, National Grid UK)
- Fields: meter_id, billing_period_start, billing_period_end, kwh_consumed,
          tariff_code, peak_kwh, offpeak_kwh, demand_kw, site_name
- Billing periods often span partial months (e.g. 15-Mar to 18-Apr)
- Units: kWh (standard), occasionally MWh for large industrial meters
- Grid emission factor varies by country/region

We handle: kWh consumption -> Scope 2 CO2e using grid emission factors
We ignore: reactive power (kVAR), demand charges, PDF bill parsing
"""

import pandas as pd
import hashlib
from datetime import datetime
from typing import Tuple

# Grid emission factors (kg CO2e per kWh) - IEA 2023
GRID_FACTORS = {
    'IN': 0.708,  # India
    'US': 0.386,  # USA average
    'GB': 0.207,  # UK
    'DE': 0.364,  # Germany
    'AU': 0.610,  # Australia
    'DEFAULT': 0.500,
}


def parse_utility_date(date_str: str) -> datetime:
    date_str = str(date_str).strip()
    for fmt in ('%d/%m/%Y', '%Y-%m-%d', '%m/%d/%Y', '%d-%m-%Y', '%d.%m.%Y', '%Y/%m/%d'):
        try:
            return datetime.strptime(date_str, fmt)
        except ValueError:
            continue
    raise ValueError(f"Cannot parse utility date: {date_str}")


def mwh_to_kwh(mwh: float) -> float:
    return mwh * 1000


def parse_utility_file(file_obj, job, organization) -> Tuple[list, list]:
    records = []
    failures = []

    try:
        df = pd.read_csv(file_obj, dtype=str)
        df.columns = [c.strip().lower().replace(' ', '_') for c in df.columns]
        df = df.fillna('')
    except Exception as e:
        return [], [{'row_index': 0, 'raw_row': {}, 'failure_reason': str(e), 'failure_type': 'parse_error'}]

    # Column detection - utilities use varying header names
    col_map = {
        'kwh': None,
        'start': None,
        'end': None,
        'meter': None,
        'site': None,
        'country': None,
    }

    for c in df.columns:
        if any(x in c for x in ['kwh', 'consumption', 'energy', 'units', 'kwh_consumed']):
            col_map['kwh'] = c
        elif any(x in c for x in ['start', 'from', 'period_start', 'billing_start', 'read_date_from']):
            col_map['start'] = c
        elif any(x in c for x in ['end', 'to', 'period_end', 'billing_end', 'read_date_to']):
            col_map['end'] = c
        elif any(x in c for x in ['meter', 'meter_id', 'meter_number', 'account']):
            col_map['meter'] = c
        elif any(x in c for x in ['site', 'location', 'facility', 'building', 'premise']):
            col_map['site'] = c
        elif any(x in c for x in ['country', 'region', 'state']):
            col_map['country'] = c

    if not col_map['kwh']:
        return [], [{'row_index': 0, 'raw_row': {}, 'failure_reason': 'Cannot find kWh column', 'failure_type': 'missing_field'}]

    for idx, row in df.iterrows():
        raw = row.to_dict()
        row_num = idx + 2

        try:
            kwh_str = str(row.get(col_map['kwh'], '')).replace(',', '').strip()
            if not kwh_str:
                raise ValueError("Missing kWh value")
            kwh = float(kwh_str)

            # Handle MWh if unit column exists
            unit_col = next((c for c in df.columns if 'unit' in c), None)
            if unit_col and 'mwh' in str(row.get(unit_col, '')).lower():
                kwh = mwh_to_kwh(kwh)

            if kwh < 0:
                raise ValueError(f"Negative kWh: {kwh}")

            # Dates
            start_str = row.get(col_map['start'], '') if col_map['start'] else ''
            end_str = row.get(col_map['end'], '') if col_map['end'] else ''

            period_start = parse_utility_date(start_str) if start_str else None
            period_end = parse_utility_date(end_str) if end_str else None

            if period_end:
                activity_date = period_end.date()
            elif period_start:
                activity_date = period_start.date()
            else:
                raise ValueError("No date found in row")

            # Site and country
            site = str(row.get(col_map['site'], '') if col_map['site'] else '').strip()
            meter_id = str(row.get(col_map['meter'], '') if col_map['meter'] else '').strip()
            site_label = f"{site} | Meter: {meter_id}" if meter_id else site

            country = str(row.get(col_map['country'], '') if col_map['country'] else 'IN').strip().upper()
            if len(country) > 2:
                country = 'IN'  # default to India for this deployment

            ef = GRID_FACTORS.get(country, GRID_FACTORS['DEFAULT'])

            # Source hash
            hash_str = f"{activity_date}{kwh}{meter_id}{site}"
            source_hash = hashlib.sha256(hash_str.encode()).hexdigest()

            record_data = {
                'organization': organization,
                'ingestion_job': job,
                'scope': 'scope2',
                'category': 'electricity',
                'activity_value': kwh,
                'activity_unit': 'kWh',
                'activity_date': activity_date,
                'billing_period_start': period_start.date() if period_start else None,
                'billing_period_end': period_end.date() if period_end else None,
                'emission_factor': ef,
                'emission_factor_source': f'IEA 2023 Grid Factor - {country}',
                'co2e_kg': kwh * ef,
                'site_or_cost_center': site_label,
                'country': country,
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
                'failure_type': 'invalid_date' if 'date' in str(e).lower() else 'parse_error',
            })

    return records, failures
