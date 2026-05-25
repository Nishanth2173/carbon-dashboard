# DECISIONS.md — Ambiguity Resolutions & Design Choices

## Source Format Decisions

### SAP — Why Tab-Delimited Flat File?

**Ambiguity**: SAP has many export formats (IDoc, OData, BAPI, flat file).

**Decision**: Tab-delimited flat file from transaction SM35/SXDA.

**Reasoning**: 
- Most enterprise SAP deployments restrict OData/BAPI to internal network — a flat file export is the realistic cross-system handoff
- IDoc XML is complex to parse without SAP-specific libraries
- Tab-delimited from SM35 is what a procurement analyst would actually email over
- Field names like `MENGE`, `MEINS`, `BLDAT` match real SAP column names from MM60/MB51 reports

**What I'd ask the PM**: Do they use BAPI MB_CREATE_GOODS_MOVEMENT or standard SM35? Are they on SAP S/4HANA (Fiori) or ECC 6.0? S/4HANA can export directly to CSV with English field names.

---

### Utility — Why Portal CSV Instead of API?

**Ambiguity**: Some utility portals have APIs (PG&E Green Button, some ESAPI providers).

**Decision**: CSV download from utility portal.

**Reasoning**:
- Green Button API requires OAuth setup with each utility — not feasible without real credentials
- CSV is what a facilities manager would actually download and email monthly
- Billing periods are irregular (15-Mar to 18-Apr) — handled by storing `billing_period_start` and `billing_period_end` separately

**What I'd ask the PM**: Do any of their sites use Green Button Connect? If so, we could add an automated pull. Also: do they have multi-tenant meters (one account per floor) or one master account per building?

---

### Travel — Why Concur SAE CSV?

**Ambiguity**: Travel data could come from Concur, Navan, Egencia, or manual expense reports.

**Decision**: Concur Standard Accounting Extract (SAE) CSV format.

**Reasoning**:
- Concur has ~70% enterprise market share globally
- The SAE CSV is a standard export any Concur admin can generate without custom config
- Fields (`expense_type`, `origin`, `destination`, `hotel_nights`) match real Concur column names
- Navan exports are structurally similar

**What I'd ask the PM**: Does the company use Concur or Navan? Are flight segments booked separately or as round-trips in a single row? (This affects distance calculation.)

---

## Emission Factor Decisions

### Sources Used
- **Fuel (Scope 1)**: DEFRA 2024 UK GHG Conversion Factors (kg CO2e per liter)
- **Electricity (Scope 2)**: IEA 2023 Country-level grid factors (kg CO2e per kWh)
- **Travel (Scope 3)**: DEFRA 2024 Business Travel factors (includes Radiative Forcing Index for flights)

**Why DEFRA?** It's the most widely cited, freely available, annually updated emission factor database. GHG Protocol references it. Alternatives (EPA, IPCC AR6) are also valid.

**What I'd ask the PM**: Does the company have custom emission factor agreements (e.g. from a renewable energy certificate)? Some orgs use market-based Scope 2 factors instead of location-based.

---

## Duplicate Detection Strategy

**Approach**: SHA256 hash of `(activity_date, normalized_quantity, fuel_type/category, site)`.

**Why not**: Checking all fields would be too strict (rounding differences would miss duplicates). Using only date+site would be too loose.

**Limitation**: Won't catch duplicates across slightly different dates (e.g., same fuel delivery billed twice with different dates).

**What I'd ask the PM**: Should duplicates be auto-rejected or just flagged for analyst review? Current behavior: flagged.

---

## Outlier Detection Strategy

**Approach**: Statistical — flag records where `co2e_kg > mean + 3×stdev` within the same scope.

**Limitation**: Requires ≥10 records in a scope to run. Won't fire on first upload.

**Alternative considered**: IQR method (1.5×IQR). Chose stdev because emissions data is often right-skewed and IQR would flag too many seasonal variations.

---

## Synchronous Ingestion (No Celery)

**Decision**: File parsing runs synchronously in the HTTP request.

**Reasoning**: Scope of this assignment. For files under 10MB/~5000 rows, response time is acceptable (<3s).

**Production plan**: Move to Celery + Redis. Return `job_id` immediately, poll `/jobs/{id}/` for status.
