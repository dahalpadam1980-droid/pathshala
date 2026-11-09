# Pathshala ERP

A complete, multi-school **School Management System** for Nepalese private and community schools — full-stack web app + PWA with real CRUD, role-based access, exams & configurable grading, accounting & payroll, and full Nepali localization (BS/AD dates, Unicode, NPR, Nepali addresses).

> **No dummy UI.** Every screen reads and writes the database. Every button works.

---

## Quick start

```bash
npm install          # installs server + web workspaces
npm run db:migrate   # creates tables (runs automatically on first server start)
npm run db:seed      # demo school + demo accounts (optional)
npm run dev          # starts API on :4000 and web on :5173
```

Open **http://localhost:5173** and sign in:

| Role | Username | Password |
|---|---|---|
| School admin | `admin` | `Demo@12345` |
| Accountant | `accountant` | `Demo@12345` |
| Office | `office1` | `Demo@12345` |
| Teacher | `teacher1` | `Demo@12345` |
| Student | `student1` | `Demo@12345` |
| Parent | `parent1` | `Demo@12345` |
| Platform admin | `superadmin` | `Super@12345` |

The login page has one-click demo chips that fill these credentials.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Run API (:4000) + web (:5173) together |
| `npm run build` | Build server (`server/dist`) and web (`web/dist`, PWA) |
| `npm run typecheck` | Type-check both workspaces (must be 0 errors) |
| `npm run db:generate` | Generate a migration after editing the Drizzle schema |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:seed` | Seed demo school, users and sample data |
| `npm start` | Run the built server from `server/dist` (production) |

---

## Architecture

```
pathshala-school-erp/
├── server/          Express 5 + TypeScript (ESM) + Drizzle ORM
│   ├── src/modules/ academics, students, staff, attendance, exams,
│   │                finance, payroll, library, inventory, lms,
│   │                communication, certificates, governance,
│   │                transport, hostel, website, reports, ai, settings…
│   ├── src/db/      schema (Drizzle), migrations, seed
│   └── src/middleware/  auth (JWT), RBAC, validation (zod), upload
└── web/             Vite + React 19 + TypeScript + Tailwind v4
    ├── src/pages/   25 routes (dashboard, module pages, reports, AI…)
    ├── src/components/  CrudPage (config-driven CRUD engine), layout, page chrome
    └── src/lib/     api client, i18n (en/ne), auth, lookups, BS/AD dates
```

**Key decisions**

- **Database** — PGlite (embedded Postgres, zero setup) in development with data in `./data`. Set `DB_DRIVER=postgres` + `DATABASE_URL` for production PostgreSQL; migrations run automatically on startup.
- **Multi-tenancy** — shared schema + `school_id` column on every table; every query is scoped to the caller's school.
- **Auth** — JWT access tokens (15 min) + rotating SHA-256 refresh tokens (30 days), scrypt-hashed at rest, in-memory rate limiting on login.
- **API** — all endpoints under `/api/v1` return the envelope `{ ok, data, meta? }`; request bodies are validated with zod (unknown keys stripped).
- **RBAC** — roles `super_admin`, `school_admin`, `accountant`, `office`, `teacher`, `student`, `parent`; route guards on the server *and* the router.
- **PWA** — installable, offline app-shell caching (API and uploads are never cached).
- **i18n** — full English / नेपाली UI, Nepali digits, BS ⇄ AD conversion via `nepali-date-converter`, NPR formatting.

---

## Configuration

All optional in development; see `server/src/config.ts`.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4000` | API port |
| `JWT_SECRET` | dev value | **Required** strong value in production |
| `ACCESS_TOKEN_TTL` | `900` | Access token lifetime (seconds) |
| `REFRESH_TOKEN_TTL` | `2592000` | Refresh token lifetime (seconds) |
| `DB_DRIVER` | `pglite` | `pglite` or `postgres` |
| `DATABASE_URL` | — | PostgreSQL connection string (when `DB_DRIVER=postgres`) |
| `DB_DIR` | `./data` | PGlite data directory |
| `UPLOAD_DIR` | `./uploads` | File uploads directory |
| `PUBLIC_URL` | `http://localhost:4000` | Absolute URL used in generated links |
| `SMS_API_URL` / `SMS_API_KEY` | — | SMS gateway (enables SMS channel) |
| `AI_API_KEY` / `AI_API_MODEL` | — | Optional LLM for the AI assistant (rules-based answers work without it) |

---

## Modules

| Area | Features |
|---|---|
| **Students** | Admission, profiles, promote/transfer, import/export, guardians |
| **Staff & users** | Service records, roles, approvals, per-school user management |
| **Academics** | Classes, sections, subjects, routines, events, academic years |
| **Attendance** | Daily marking with present/absent/late/leave, notify-absent, monthly reports |
| **Exams & grading** | Exam setup, subject marks entry, results, **configurable grading scales** (NEB GPA/percentage/custom — no hardcoded thresholds) |
| **Finance** | Fee heads/structures, dues generation, payments with receipts, scholarships, ledger accounts, transactions, cash book, trial balance, outstanding fees |
| **Payroll** | Salary structures, monthly runs, salary slips, bank payment sheets |
| **Library** | Catalogue with copies, issue/return register, overdue fines |
| **Inventory** | Assets, condition, movement history, stock value |
| **LMS** | Learning content, assignments, quizzes |
| **Notices** | Bilingual notices with audience targeting, broadcasts (in-app/SMS/email/push), delivery inbox |
| **Certificates** | Generated certificates from templates |
| **Governance** | SMC/PTA committees, members, meetings, minutes |
| **Transport** | Vehicles with insurance/fitness expiry, routes/stops/fares, allocations, expenses |
| **Hostel** | Hostels, rooms, bed allocations, complaint register |
| **Public website** | Managed pages/gallery with live preview by school code |
| **Reports** | Overview, attendance, exam performance, fee collection, library, inventory — all computed from live data |
| **AI assistant** | Answers school-data questions grounded in the database (works without an API key via built-in rules) |
| **Settings** | School profile, academic years, BS/AD date tools, system defaults, statistics |

---

## Production deployment

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** for the full guide (PostgreSQL, reverse proxy, TLS, systemd).

---

## User manuals

- [English — docs/USER-MANUAL-EN.md](docs/USER-MANUAL-EN.md)
- [नेपाली — docs/USER-MANUAL-NE.md](docs/USER-MANUAL-NE.md)
