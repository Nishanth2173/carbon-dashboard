"""
Corporate Travel CSV Parser - Concur/Navan export format.

Real-world format (researched from Concur SAE/Standard Accounting Extract):
Fields: expense_type, transaction_date, employee_id, cost_center,
        origin, destination, distance_km, class_of_service,
        hotel_nights, hotel_name, amount, currency

Flight emission factors from DEFRA 2024 (kg CO2e per passenger-km incl. RFI):
  - Domestic (< 463 km): 0.25527
  - Short-haul (<= 3700 km): 0.15353
  - Long-haul (> 3700 km): 0.19085

Hotel: 0.0671 kg CO2e per room-night (Scope 3 default, DEFRA)
Ground (taxi/rideshare): 0.14853 kg CO2e per km
Ground (rail): 0.03549 kg CO2e per km
"""

import pandas as pd
import hashlib
import math
from datetime import datetime
from typing import Tuple, Optional

# Airport coordinates (IATA code -> (lat, lon)) for distance estimation
AIRPORT_COORDS = {
    'DEL': (28.5665, 77.1031), 'BOM': (19.0896, 72.8656),
    'BLR': (13.1986, 77.7066), 'HYD': (17.2403, 78.4294),
    'MAA': (12.9941, 80.1709), 'CCU': (22.6542, 88.4467),
    'AMD': (23.0771, 72.6347), 'COK': (10.1520, 76.3975),
    'LHR': (51.4775, -0.4614), 'CDG': (49.0097, 2.5478),
    'FRA': (50.0379, 8.5622), 'AMS': (52.3105, 4.7683),
    'JFK': (40.6413, -73.7781), 'LAX': (33.9425, -118.4081),
    'ORD': (41.9742, -87.9073), 'SFO': (37.6213, -122.3790),
    'SIN': (1.3644, 103.9915), 'DXB': (25.2528, 55.3644),
    'NRT': (35.7647, 140.3864), 'SYD': (-33.9399, 151.1753),
    'DUB': (53.4264, -6.2499), 'IST': (41.2753, 28.7519),
}

FLIGHT_FACTORS = {
    'domestic':   {'threshold_km': 463,  'factor': 0.25527},
    'shorthaul':  {'threshold_km': 3700, 'factor': 0.15353},
    'longhaul':   {'threshold_km': 99999,'factor': 0.19085},
}

GROUND_FACTORS = {
    'taxi':   0.14853,
    'rail':   0.03549,
    'rental': 0.16844,
}

HOTEL_FACTOR = 0.0671  # per room-night


def haversine_km(lat1, lon1, lat2, lon2) -> float:
    R = 6371
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def get_flight_distance(origin: str, dest: str, provided_km: Optional[float]) -> float:
    if provided_km and provided_km > 0:
        return provided_km
    o = origin.upper().strip()
    d = dest.upper().strip()
    if o in AIRPORT_COORDS and d in AIRPORT_COORDS:
        lat1, lon1 = AIRPORT_COORDS[o]
        lat2, lon2 = AIRPORT_COORDS[d]
        return haversine_km(lat1, lon1, lat2, lon2)
    return 1500  # fallback median short-haul


def classify_flight(distance_km: float) -> str:
    if distance_km <= 463:
        return 'flight_domestic'
    elif distance_km <= 3700:
        return 'flight_shorthaul'
    return 'flight_longhaul'


def get_flight_factor(distance_km: float) -> float:
    if distance_km <= 463:
        return FLIGHT_FACTORS['domestic']['factor']
    elif distance_km <= 3700:
        return FLIGHT_FACTORS['shorthaul']['factor']
    return FLIGHT_FACTORS['longhaul']['factor']


def parse_travel_date(date_str: str) -> datetime:
    date_str = str(date_str).strip()
    for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%m/%d/%Y', '%d-%m-%Y', '%d.%m.%Y'):
        try:
            return datetime.strptime(date_str, fmt)
        except ValueError:
            continue
    raise ValueError(f"Cannot parse travel date: {date_str}")


def detect_expense_type(row: dict) -> str:
    """Map Concur expense type codes to our categories."""
    exp = str(row.get('expense_type', row.get('type', row.get('category', '')))).lower().strip()
    if any(x in exp for x in ['flight', 'air', 'airline', 'airfare']):
        return 'flight'
    if any(x in exp for x in ['hotel', 'lodging', 'accommodation', 'motel']):
        return 'hotel'
    if any(x in exp for x in ['taxi', 'uber', 'ola', 'lyft', 'rideshare', 'cab']):
        return 'taxi'
    if any(x in exp for x in ['train', 'rail', 'metro', 'subway', 'amtrak']):
        return 'rail'
    if any(x in exp for x in ['car', 'rental', 'hire', 'vehicle']):
        return 'rental'
    return 'taxi'  # default


def parse_travel_file(file_obj, job, organization) -> Tuple[list, list]:
    records = []
    failures = []

    try:
        df = pd.read_csv(file_obj, dtype=str)
        df.columns = [c.strip().lower().replace(' ', '_') for c in df.columns]
        df = df.fillna('')
    except Exception as e:
        return [], [{'row_index': 0, 'raw_row': {}, 'failure_reason': str(e), 'failure_type': 'parse_error'}]

    for idx, row in df.iterrows():
        raw = row.to_dict()
        row_num = idx + 2

        try:
            date_str = row.get('transaction_date', row.get('date', row.get('travel_date', '')))
            if not date_str:
                raise ValueError("Missing date")
            activity_date = parse_travel_date(date_str).date()

            exp_type = detect_expense_type(raw)
            employee = str(row.get('employee_id', row.get('employee', ''))).strip()
            cost_center = str(row.get('cost_center', row.get('department', ''))).strip()
            currency = str(row.get('currency', 'USD')).strip().upper()

            amount_str = str(row.get('amount', row.get('total', '0'))).replace(',', '').strip()
            try:
                spend_amount = float(amount_str) if amount_str else None
            except ValueError:
                spend_amount = None

            if exp_type == 'flight':
                origin = str(row.get('origin', row.get('from', row.get('departure', '')))).strip().upper()
                dest = str(row.get('destination', row.get('to', row.get('arrival', '')))).strip().upper()
                dist_str = str(row.get('distance_km', row.get('distance', ''))).replace(',', '').strip()
                provided_km = float(dist_str) if dist_str and dist_str != '' else None

                dist_km = get_flight_distance(origin, dest, provided_km)
                category = classify_flight(dist_km)
                ef = get_flight_factor(dist_km)
                activity_value = dist_km
                activity_unit = 'km'
                site_label = f"{origin} → {dest} | {employee}"

            elif exp_type == 'hotel':
                nights_str = str(row.get('hotel_nights', row.get('nights', '1'))).strip()
                try:
                    nights = float(nights_str) if nights_str else 1.0
                except ValueError:
                    nights = 1.0
                category = 'hotel'
                ef = HOTEL_FACTOR
                activity_value = nights
                activity_unit = 'nights'
                hotel_name = str(row.get('hotel_name', row.get('vendor', ''))).strip()
                site_label = f"{hotel_name} | {employee}"

            elif exp_type in ('taxi', 'rental'):
                dist_str = str(row.get('distance_km', row.get('distance', '20'))).replace(',', '').strip()
                try:
                    dist_km = float(dist_str) if dist_str else 20.0
                except ValueError:
                    dist_km = 20.0
                category = 'ground_taxi' if exp_type == 'taxi' else 'ground_rental'
                ef = GROUND_FACTORS.get(exp_type, 0.14853)
                activity_value = dist_km
                activity_unit = 'km'
                site_label = f"Ground ({exp_type}) | {employee}"

            else:  # rail
                dist_str = str(row.get('distance_km', row.get('distance', '100'))).replace(',', '').strip()
                try:
                    dist_km = float(dist_str) if dist_str else 100.0
                except ValueError:
                    dist_km = 100.0
                category = 'ground_rail'
                ef = GROUND_FACTORS['rail']
                activity_value = dist_km
                activity_unit = 'km'
                site_label = f"Rail | {employee}"

            hash_str = f"{activity_date}{activity_value}{category}{employee}"
            source_hash = hashlib.sha256(hash_str.encode()).hexdigest()

            record_data = {
                'organization': organization,
                'ingestion_job': job,
                'scope': 'scope3',
                'category': category,
                'activity_value': activity_value,
                'activity_unit': activity_unit,
                'activity_date': activity_date,
                'emission_factor': ef,
                'emission_factor_source': 'DEFRA 2024 - Business Travel',
                'co2e_kg': activity_value * ef,
                'site_or_cost_center': site_label,
                'country': str(row.get('country', '')).strip(),
                'currency': currency,
                'spend_amount': spend_amount,
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
