# Lab Component Inventory Manager

**Purpose**: Lab parts tracking system with usage tracking, real-count reconciliation, and suggested parts workflow.

## AI-Assisted Development

Offload self-contained generation to local Ollama (`qwen2.5-coder:7b`). Use the HTTP API,
not `ollama run` — the CLI emits TTY escape codes on a pipe, and cleaning them out of the
transcript costs more context than the answer is worth.

```powershell
(Invoke-RestMethod -Uri "http://localhost:11434/api/generate" -Method Post -ContentType "application/json" `
  -Body '{"model":"qwen2.5-coder:7b","prompt":"<prompt>","stream":false}').response
```

**Delegate to Ollama** when the task needs no knowledge of this codebase: a standalone
snippet, a regex, a format conversion, boilerplate.

**Keep on Claude** when the task depends on what's already here — file edits, debugging,
multi-file changes, and anything touching the take/return deltas, report-matching, or the
audit log. Briefing Ollama on that context costs more than doing the work.

Rule of thumb: if explaining the task to Ollama is longer than the answer, don't delegate it.

Prefer Ponytail principles throughout: minimal code, stdlib, no over-engineering.


## Stack
- **Frontend**: React 19, Vite (port 5173)
- **Backend**: Express 5, better-sqlite3 (port 3001)
- **Database**: SQLite (components.db)

## Database Schema
```
components: inventory_key (PK), name, category, package, in_stock, location, manufacturer_nr
categories: id, name (UNIQUE)
packages: id, name (UNIQUE)
suggested_components: inventory_key (PK), name, category, package, in_stock, location, manufacturer_nr, created_at
real_number_reports: id, inventory_key (FK), reported_number, timestamp
reports: id, inventory_key (FK), report_type, timestamp
```

## Features

### 1. Component Management
- Add components (auto-generates 9-char inventory key via Math.random().toString(36).substr(2,9))
- View/search components, filter by category
- Toggle zero-stock visibility

### 2. Usage Tracking (Take/Return)
- "Use" button → modal for amount
- Take: subtracts from in_stock (min 0), also updates ALL real_number_reports for this key by -amount
- Return: adds to in_stock, also updates ALL real_number_reports for this key by +amount

### 3. Real Number Reporting
- "Report Real Number" in Report dropdown
- Matching logic: COUNT real_number_reports WHERE inventory_key=X AND reported_number=new_value
  - If count ≥ 1 (2nd+ report of same value): UPDATE in_stock=value, DELETE all reports for key, log REPORT_REAL_MATCH
  - Else: INSERT new report, log REPORT_REAL_NEW

### 4. Auto-Zero on Missing Reports
- 2+ "Not in stock" reports for same component → set in_stock=0, log AUTO_ZERO

### 5. Suggested Parts
- Suggest button → saves to suggested_components
- Save button requires password (123456789)
- Toggle "Show Suggested Parts" checkbox to display (yellow highlight)

### 6. Audit Logging
- All DB changes logged to /logs/database.log
- Format: YYYY-MM-DD HH:MM:SS | EVENT_TYPE | key=val | key=val | ...
- Events: USE_ACTION, REPORT_REAL_NEW, REPORT_REAL_MATCH, AUTO_ZERO, REPORT_ADDED

## API (all HTTP)

Routes marked 🔒 require header `x-admin-password`. The password comes from
`ADMIN_PASSWORD` (default `123456789`). Everyday lab actions — use/take/return,
reporting, suggesting, adding categories and packages — are deliberately open;
gating them would defeat the point of the tool.

| Method | Endpoint | Params/Body | Response |
|--------|----------|------------|----------|
| GET | /api/components | search, category | [{inventory_key, name, ...}] |
| GET | /api/admin/check | 🔒 — | {ok: true} \| 401 |
| GET | /api/reports | 🔒 — | [{id, inventory_key, name, report_type, timestamp}] |
| POST | /api/components | 🔒 {inventory_key, name, category, package, in_stock, location, manufacturer_nr} | {success: true} |
| DELETE | /api/components/:key | 🔒 — | {success: true} |
| POST | /api/components/:key/use | {amount, action: "take"\|"return"} | {success: true, in_stock: N} |
| POST | /api/components/:key/report-real | {reported_number: INT} | {success: true} |
| GET | /api/categories | — | [{id, name}] |
| POST | /api/categories | {name} | {success: true} |
| GET | /api/packages | — | [{id, name}] |
| POST | /api/packages | {name} | {success: true} |
| GET | /api/suggested_components | — | [{inventory_key, name, ...}] |
| POST | /api/suggested_components | {inventory_key, name, ...} | {success: true} |
| DELETE | /api/suggested_components/:key | 🔒 — | {success: true} |
| POST | /api/suggested_components/:key/approve | 🔒 — | {success: true} \| 404 |
| POST | /api/reports | {inventory_key, report_type} | {success: true} |

## Run
```bash
npm install
npm run server    # port 3001
npm run dev       # port 5173
```

## Tests
```bash
node test_admin.js   # admin gate, approve flow, reports endpoint, delete cascade
node test_views.js   # admin view filters (out / low threshold / suggested / all)
```

## Critical Logic

**Deleting a component** cascades: `reports` and `real_number_reports` both hold a
FK to `components`, so those rows are removed in the same transaction. Without
this the delete fails with `FOREIGN KEY constraint failed` for any part that was
ever reported. The permanent history stays in `logs/database.log`.

**Real Number Matching**: When report arrives with value V for key K:
1. Count existing reports: `SELECT COUNT(*) WHERE key=K AND value=V`
2. If count ≥ 1: UPDATE in_stock to V, DELETE all reports for K, clear tracking
3. Else: INSERT new report

**Take/Return**: Affects BOTH in_stock AND real_number_reports.reported_number by same delta
- Example: in_stock=20, reported_number=23, take 3 → in_stock=17, reported_number=20

**Auto-Zero**: If 2+ "Not in stock" reports exist for component, set in_stock=0

## Files
- server.js: Express backend (all endpoints, logging, DB logic)
- src/App.jsx: React frontend (all UI features)
- components.db: SQLite database
- logs/database.log: Audit trail
