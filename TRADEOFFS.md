# TRADEOFFS.md — Deliberate Scope Decisions

## 1. No Celery / Async Task Queue

**Skipped**: Background task processing with Celery + Redis.

**Why skipped**: Adds significant infrastructure complexity (Redis server, worker process, task registry). For the assignment's purpose — demonstrating the pipeline logic — synchronous parsing is equivalent.

**Cost**: File uploads block the HTTP response. For a 10,000 row CSV, this could take 5–10 seconds. Users see a loading state but can't navigate away without cancelling.

**Production fix**: Wrap `parse_sap_file()` etc. in a Celery task. Return `{job_id}` on upload, poll `/api/jobs/{id}/` via React Query refetchInterval.

---

## 2. No PDF Parsing (Utility Bills)

**Skipped**: PDF parsing for scanned utility bills via `pdfplumber`.

**Why skipped**: PDF utility bills have wildly inconsistent layouts (BESCOM vs PG&E vs National Grid are completely different). Reliable extraction requires per-utility layout templates, which is weeks of work and not demonstrable with sample data.

**Cost**: Utilities that only provide PDF bills (common in India for residential, less common for commercial) can't be ingested.

**Production fix**: Build a per-utility PDF template system using `pdfplumber` + regex per known layout. Add OCR fallback via Tesseract for scanned images.

---

## 3. No Real-Time Grid Factor API

**Skipped**: Live electricity grid emission factors from an API (e.g. Electricity Maps, WattTime).

**Why skipped**: Both services require paid API keys. Real-time factors change hourly and are more relevant for Scope 2 market-based accounting, which is an advanced feature.

**Cost**: Using static IEA 2023 annual averages means the Scope 2 calculation is slightly less accurate for orgs in rapidly decarbonizing grids (e.g., UK where the factor dropped significantly 2019–2024).

**Production fix**: Integrate Electricity Maps API with caching. Allow admin to override the grid factor per meter/site.

---

## 4. No SSO / OAuth

**Skipped**: Google/Microsoft SSO via OAuth2.

**Why skipped**: Would require a registered OAuth app per environment. JWT auth covers the functional requirement.

**Production fix**: `django-allauth` with Google and Microsoft providers.

---

## 5. Simplified Multi-Tenancy (Python-Level Isolation Only)

**Skipped**: PostgreSQL Row-Level Security (RLS) for DB-level org isolation.

**Why skipped**: Requires PostgreSQL-specific migrations and adds query complexity. Python-level `filter(organization=org)` is correct and testable.

**Cost**: A bug in the Python filter could leak cross-org data. RLS would be a defense-in-depth layer.

**Production fix**: Add RLS policies on `EmissionRecord`, `IngestionJob` using `organization_id = current_setting('app.org_id')`.
