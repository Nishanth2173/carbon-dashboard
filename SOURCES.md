# SOURCES.md — Data Source Research

## SAP Fuel & Procurement

**Format chosen**: Tab-delimited flat file (SM35/MB51 export)

**Real-world basis**: SAP ECC 6.0 and S/4HANA both support flat file export from MB51 (Material Document List). The fields used (`BLDAT`, `BUDAT`, `MATNR`, `MAKTX`, `MENGE`, `MEINS`, `WERKS`, `KOSTL`, `WAERS`, `WRBTR`, `LAND1`) are standard MM module fields documented in SAP's own field catalog.

**Sample data notes** (`sap_fuel_export.txt`):
- Date format: DD.MM.YYYY (German locale, standard SAP default)
- Plant codes: `1001`, `1002`, `1003`, `1004` (fictional but realistic 4-digit Werks codes)
- Material numbers: 10-digit MATNR with prefix encoding fuel type
- German field names: `MENGE` (Menge = quantity), `MEINS` (Mengeneinheit = unit of measure)
- Units: L (liters), M3 (cubic meters) — standard SAP unit codes

**What would break in production**:
- SAP instances with custom unit codes (e.g., `L60` for temperature-corrected liters at fuel depots)
- Material numbers not following the prefix convention — would default to diesel
- Multi-currency documents (WAERS ≠ INR) — currency conversion not implemented
- IDoc format (XML segments) instead of flat file

---

## Utility Electricity

**Format chosen**: Portal CSV download (BESCOM/PG&E style)

**Real-world basis**: BESCOM (Bangalore Electricity Supply Company) provides downloadable CSV from their consumer portal. Fields match the BESCOM "Consumption History" export. PG&E (USA) uses similar fields via their Green Button CSV format.

**Sample data notes** (`utility_electricity.csv`):
- Meters: MTR-HYD-001 through MTR-MUM-001 (fictional but realistic naming)
- Billing periods deliberately span irregular dates (15th to 18th of following month) — matches real BESCOM billing cycle
- Sites: Hyderabad Office, Bangalore R&D, Mumbai Sales — realistic multi-site org
- Tariff codes: HT-2A, HT-2B, HT-4, LT-2, LT-5 — real BESCOM tariff categories
- Grid factor used: 0.708 kgCO₂e/kWh (India, IEA 2023)

**What would break in production**:
- Utilities with interval data (15-minute reads) instead of billing period totals — would create thousands of rows
- Power factor correction charges included in kWh column
- Multi-rate meters (peak/off-peak) where only total is exported — we handle both
- kVAh metering instead of kWh (common in India for industrial consumers above 100kVA)

---

## Corporate Travel

**Format chosen**: Concur Standard Accounting Extract (SAE) CSV

**Real-world basis**: Concur SAP's standard export documented at https://www.concurtraining.com — fields like `expense_type`, `employee_id`, `cost_center` are standard SAE column names. The `origin`/`destination` with IATA airport codes is the standard Concur Air expense representation.

**Sample data notes** (`travel_concur_export.csv`):
- Airport codes: HYD, BLR, BOM, DEL, LHR, DXB, NRT, SIN — all in our coordinate lookup table
- Expense types: Flight, Hotel, Taxi, Train, Car Rental — covers all Concur categories
- Employee IDs: EMP-XXXX format (fictional but realistic)
- Both domestic (HYD-DEL) and international (HYD-LHR, HYD-NRT) routes included
- Business class vs Economy class in `class_of_service` — not yet used in factor selection (would increase factor ~2×)

**What would break in production**:
- Airport codes not in our coordinate lookup table (we have ~20; IATA has 9,000+) — fallback to 1500km median
- Multi-leg itineraries booked as one expense row (HYD→FRA→JFK) — we only parse origin/destination
- Hotel stays without night count (just a per-diem amount) — we default to 1 night
- Ground transport without distance (just fare amount) — we default to 20km

---

## Emission Factors

| Source | Coverage | Version | URL |
|---|---|---|---|
| DEFRA GHG Conversion Factors | Fuel, Travel | 2024 | https://www.gov.uk/government/collections/government-conversion-factors-for-company-reporting |
| IEA World Energy Outlook | Grid electricity by country | 2023 | https://www.iea.org/data-and-statistics |
| IPCC AR6 | Reference only | 2021 | https://www.ipcc.ch/report/ar6/wg1/ |
