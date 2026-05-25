# CarbonLens — Carbon Emissions Data Pipeline & Review Dashboard

A full-stack Django REST + React application that ingests emissions data from SAP, utility providers, and corporate travel platforms, normalizes it to kgCO₂e, and surfaces an analyst review workflow.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Django 4.2 + Django REST Framework |
| Auth | JWT via `djangorestframework-simplejwt` |
| Database | SQLite (dev) / PostgreSQL (production) |
| File parsing | pandas, openpyxl |
| Frontend | React 18 + Vite |
| Styling | Tailwind CSS |
| Charts | Recharts |
| State / Fetching | TanStack React Query + Axios |
| Deployment | Render / Railway / Fly.io |

---

## Local Setup

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

Backend runs at: http://localhost:8000

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at: http://localhost:5173

---

## Environment Variables (Backend)

Create `backend/.env`:

```
SECRET_KEY=your-secret-key-here
DEBUG=True
DATABASE_URL=postgresql://user:pass@host:5432/dbname   # optional, SQLite used if absent
```

---

## Deployment (Render)

### Backend Web Service
- **Build command**: `pip install -r requirements.txt && python manage.py collectstatic --noinput && python manage.py migrate`
- **Start command**: `gunicorn config.wsgi:application`
- **Environment**: Add `SECRET_KEY`, `DATABASE_URL`, `DEBUG=False`

### Frontend Static Site
- **Build command**: `npm install && npm run build`
- **Publish directory**: `dist`
- **Environment**: `VITE_API_URL=https://your-backend.onrender.com`

Update `frontend/src/utils/api.js` baseURL to use `import.meta.env.VITE_API_URL` for production.

---

## Sample Data

Three ready-to-upload test files in `backend/sample_data/`:

| File | Source Type | Rows | Notes |
|---|---|---|---|
| `sap_fuel_export.txt` | SAP | 15 | Tab-delimited, German dates, mixed fuel types |
| `utility_electricity.csv` | Utility | 18 | Multi-site, irregular billing periods |
| `travel_concur_export.csv` | Travel | 32 | Flights, hotels, taxis, trains |

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/register/` | Create account + org |
| POST | `/api/token/` | Login (JWT) |
| POST | `/api/token/refresh/` | Refresh JWT |
| GET | `/api/me/` | Current user + org |
| GET | `/api/dashboard/` | Aggregated stats + trend |
| POST | `/api/upload/` | Upload file for ingestion |
| GET | `/api/jobs/` | List ingestion jobs |
| GET | `/api/records/` | List emission records (paginated, filterable) |
| PATCH | `/api/records/{id}/` | Update status/note |
| POST | `/api/records/bulk-review/` | Bulk approve/reject |
| POST | `/api/records/lock/` | Lock approved records |
| GET | `/api/jobs/{id}/failures/` | Parse failures for a job |
| GET | `/api/records/{id}/audit/` | Audit trail for a record |

---

## Documentation

- `MODEL.md` — Full database schema with design rationale
- `DECISIONS.md` — Ambiguity resolutions and format choices
- `TRADEOFFS.md` — Deliberate scope cuts with production paths
- `SOURCES.md` — Per-source research, format basis, production failure modes
