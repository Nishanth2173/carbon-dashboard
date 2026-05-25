# MODEL.md — Database Schema Design

## Overview

The schema is built around four concerns:
1. **Multi-tenancy** — all data scoped to an Organization
2. **Source provenance** — every record traces back to a raw file row
3. **Review workflow** — pending → approved/rejected → locked
4. **Audit immutability** — no change ever disappears

---

## Entity Relationship Summary

```
User ──< OrganizationMembership >── Organization
Organization ──< IngestionJob ──< EmissionRecord ──< AuditTrail
IngestionJob ──< IngestionFailure
```

---

## Tables

### `Organization`
Multi-tenancy root. Every other table has a FK to this.

| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | varchar(255) | Display name |
| slug | slug unique | URL-safe identifier |
| created_at | datetime | |

**Design note**: UUID primary keys used throughout to prevent enumeration attacks and support future cross-org data sharing.

---

### `OrganizationMembership`
Many-to-many between User and Organization, with a role.

| Field | Type | Notes |
|---|---|---|
| user | FK User | |
| organization | FK Organization | |
| role | enum | admin / analyst / viewer |

**Design note**: Role-based access enforced at view layer. `admin` can lock records, `analyst` can approve/reject, `viewer` read-only.

---

### `IngestionJob`
Tracks every file upload. Acts as a container for all records parsed from that file.

| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| organization | FK | Multi-tenancy |
| uploaded_by | FK User | Nullable (SET_NULL on delete) |
| source_type | enum | sap / utility / travel |
| original_filename | varchar(500) | |
| file | FileField | Stored in media/uploads/%Y/%m/ |
| status | enum | pending / processing / completed / failed |
| total_rows | int | |
| successful_rows | int | |
| failed_rows | int | |
| flagged_rows | int | Duplicates or outliers |
| error_message | text | Populated only on status=failed |
| started_at | datetime | auto_now_add |
| completed_at | datetime | nullable |

---

### `EmissionRecord` — Core table

The normalized, source-agnostic emission row. Every SAP, utility, and travel row maps to exactly one `EmissionRecord`.

#### Scope & Category

| Field | Type | Notes |
|---|---|---|
| scope | enum | scope1 / scope2 / scope3 |
| category | enum | 13 categories (diesel, petrol, gas, electricity, flight types, hotel, ground) |

**Scope definitions:**
- **Scope 1** — Direct emissions from owned/controlled sources (fuel combustion from SAP)
- **Scope 2** — Indirect from purchased electricity (utility CSV)
- **Scope 3** — Other indirect (business travel, supply chain — we cover travel here)

#### Activity Data (normalized)

| Field | Type | Notes |
|---|---|---|
| activity_value | float | Quantity in canonical unit |
| activity_unit | varchar(20) | liters / kWh / km / nights |
| activity_date | date | Representative date of activity |
| billing_period_start | date | nullable — for utility |
| billing_period_end | date | nullable — for utility |

**Design note**: Raw SAP data may come in liters, gallons, or kg. All are normalized to liters (fuel) or m³ (gas) before storage. Utility MWh → kWh. This means `activity_value` is always in a consistent, calculable unit.

#### Emission Calculation

| Field | Type | Notes |
|---|---|---|
| emission_factor | float | kgCO2e per activity unit |
| emission_factor_source | varchar(200) | e.g. DEFRA 2024 |
| co2e_kg | float | Computed: activity_value × emission_factor |

**Design note**: `co2e_kg` is stored (not computed at query time) for performance and audit consistency. The `save()` override recomputes it automatically when values change, but is blocked on locked records.

#### Location & Context

| Field | Type | Notes |
|---|---|---|
| site_or_cost_center | varchar(255) | SAP plant/Werks, utility meter+site, or Concur cost center |
| country | varchar(100) | ISO 2-letter where possible |
| currency | varchar(10) | From source data |
| spend_amount | float | nullable — cost of the activity |

#### Source Provenance

| Field | Type | Notes |
|---|---|---|
| source_row_index | int | Row number in original file (1-indexed with header) |
| raw_data | JSONField | Original unparsed row stored verbatim |
| source_hash | varchar(64) | SHA256 of (date + qty + fuel_type + site) — for duplicate detection |

**Design note**: `raw_data` stores the entire original CSV row as JSON. This is critical for the analyst to trace any data issue back to its source without looking up the original file. Storage overhead is acceptable (~500 bytes/row).

#### Review Workflow

| Field | Type | Notes |
|---|---|---|
| status | enum | pending / approved / rejected / flagged |
| reviewed_by | FK User | nullable |
| reviewed_at | datetime | nullable |
| review_note | text | Analyst's justification |
| is_duplicate | bool | Set during ingestion |
| is_outlier | bool | Set post-ingestion by IQR detection |
| flag_reason | text | Human-readable reason for flagging |
| is_locked | bool | Once true, save() raises ValueError |

**State machine:**
```
pending → approved → locked (immutable)
pending → rejected
pending → flagged
flagged → approved (analyst clears flag)
flagged → rejected
```

#### Indexes

```python
Index(fields=['organization', 'scope'])       # scope summary queries
Index(fields=['organization', 'status'])       # review queue filter
Index(fields=['source_hash'])                  # duplicate detection
Index(fields=['activity_date'])                # time series queries
```

---

### `IngestionFailure`
Rows that could not be parsed. Stored separately so they don't pollute the main emission table.

| Field | Type | Notes |
|---|---|---|
| ingestion_job | FK | |
| row_index | int | Row number in source file |
| raw_row | JSONField | Original data |
| failure_reason | text | Human-readable error |
| failure_type | enum | parse_error / missing_field / invalid_unit / invalid_date / unknown_code / validation |

---

### `AuditTrail`
**Append-only.** Never deleted or updated.

| Field | Type | Notes |
|---|---|---|
| record | FK EmissionRecord | |
| performed_by | FK User | SET_NULL |
| action | enum | created / edited / approved / rejected / locked / flagged / unflagged |
| before_state | JSONField | Snapshot of relevant fields before change |
| after_state | JSONField | Snapshot after change |
| note | text | Optional analyst note |
| timestamp | datetime | auto_now_add |

**Design note**: `before_state` and `after_state` store only the changed fields (status, review_note) — not the full record. Full record state is reconstructable from the sequence of audit events.

---

## Multi-Tenancy Strategy

All data access goes through `get_user_org(request)` which returns the organization from `OrganizationMembership`. Every queryset is filtered by `organization=org`. This means:

- Users from Org A cannot see Org B's data, even with a valid JWT
- Org isolation is enforced in Python, not at the DB level (pragmatic for a single-DB deployment)
- Future: row-level security via PostgreSQL RLS if scaling to 1000+ orgs

## What We'd Add in Production

1. **Celery + Redis** — async file parsing (currently synchronous, blocks the HTTP request for large files)
2. **PostgreSQL RLS** — DB-level row isolation per org
3. **S3 file storage** — replace local `FileField` with `django-storages`
4. **GFI (Grid Factor API)** — live grid emission factors instead of hardcoded IEA 2023
5. **Reporting table** — pre-aggregated monthly scope totals for fast dashboard queries
