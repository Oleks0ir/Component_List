import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);
const dbLog = (event, data) => {
  const ts = new Date().toISOString().split('T')[0] + ' ' + new Date().toISOString().split('T')[1].slice(0, 8);
  const pairs = Object.entries(data).map(([k, v]) => `${k}=${v}`).join(' | ');
  fs.appendFileSync(path.join(logsDir, 'database.log'), `${ts} | ${event} | ${pairs}\n`);
};
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'components.db');
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
  );
  CREATE TABLE IF NOT EXISTS packages (
    id INTEGER PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
  );
  CREATE TABLE IF NOT EXISTS components (
    inventory_key TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    package TEXT,
    in_stock INTEGER DEFAULT 0,
    location TEXT,
    manufacturer_nr TEXT
  );
  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY,
    inventory_key TEXT NOT NULL,
    report_type TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(inventory_key) REFERENCES components(inventory_key)
  );
  CREATE TABLE IF NOT EXISTS suggested_components (
    inventory_key TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    package TEXT,
    in_stock INTEGER DEFAULT 0,
    location TEXT,
    manufacturer_nr TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS real_number_reports (
    id INTEGER PRIMARY KEY,
    inventory_key TEXT NOT NULL,
    reported_number INTEGER NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(inventory_key) REFERENCES components(inventory_key)
  )
`);

const app = express();
app.use(cors());
app.use(express.json());

// Admin gate. Hashing both sides gives timingSafeEqual the equal lengths it requires.
// ponytail: one shared password, sent cleartext over LAN HTTP. Fine for a lab box;
// move to accounts + TLS if this ever leaves the local network.
const ADMIN_PW = process.env.ADMIN_PASSWORD || '123456789';
const pwHash = (s) => crypto.createHash('sha256').update(String(s)).digest();
const requireAdmin = (req, res, next) =>
  crypto.timingSafeEqual(pwHash(req.get('x-admin-password')), pwHash(ADMIN_PW))
    ? next()
    : res.status(401).json({ error: 'Unauthorized' });

app.get('/api/admin/check', requireAdmin, (req, res) => res.json({ ok: true }));

app.get('/api/categories', (req, res) => {
  try {
    const rows = db.prepare(`SELECT * FROM categories ORDER BY name`).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/categories', (req, res) => {
  try {
    db.prepare(`INSERT OR IGNORE INTO categories (name) VALUES (?)`).run(req.body.name);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/packages', (req, res) => {
  try {
    const rows = db.prepare(`SELECT * FROM packages ORDER BY name`).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/packages', (req, res) => {
  try {
    db.prepare(`INSERT OR IGNORE INTO packages (name) VALUES (?)`).run(req.body.name);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/components', (req, res) => {
  const search = req.query.search || '';
  const category = req.query.category || '';
  let query = `SELECT * FROM components WHERE 1=1`;
  const params = [];

  if (search) {
    query += ` AND (name LIKE ? OR inventory_key LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }
  if (category) {
    query += ` AND category = ?`;
    params.push(category);
  }

  try {
    const rows = db.prepare(query).all(...params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/components', requireAdmin, (req, res) => {
  const { inventory_key, name, category, package: pkg, in_stock, location, manufacturer_nr } = req.body;
  try {
    db.prepare(
      `INSERT INTO components VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(inventory_key, name, category, pkg, in_stock, location, manufacturer_nr);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// reports and real_number_reports both hold a FK to components, so the part cannot
// go until its dependents do. The file audit log in logs/ keeps the permanent history.
app.delete('/api/components/:key', requireAdmin, (req, res) => {
  try {
    const removed = db.transaction((key) => {
      db.prepare(`DELETE FROM reports WHERE inventory_key=?`).run(key);
      db.prepare(`DELETE FROM real_number_reports WHERE inventory_key=?`).run(key);
      return db.prepare(`DELETE FROM components WHERE inventory_key=?`).run(key).changes;
    })(req.params.key);
    dbLog('COMPONENT_DELETED', { key: req.params.key, existed: removed > 0 });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/suggested_components', (req, res) => {
  try {
    const rows = db.prepare(`SELECT * FROM suggested_components ORDER BY created_at DESC`).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/suggested_components', (req, res) => {
  const { inventory_key, name, category, package: pkg, in_stock, location, manufacturer_nr } = req.body;
  try {
    db.prepare(
      `INSERT INTO suggested_components (inventory_key, name, category, package, in_stock, location, manufacturer_nr) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(inventory_key, name, category, pkg, in_stock, location, manufacturer_nr);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/suggested_components/:key', requireAdmin, (req, res) => {
  try {
    db.prepare(`DELETE FROM suggested_components WHERE inventory_key=?`).run(req.params.key);
    dbLog('SUGGESTION_REJECTED', { key: req.params.key });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/suggested_components/:key/approve', requireAdmin, (req, res) => {
  try {
    const s = db.prepare(`SELECT * FROM suggested_components WHERE inventory_key=?`).get(req.params.key);
    if (!s) return res.status(404).json({ error: 'No such suggestion' });
    db.transaction(() => {
      db.prepare(`INSERT INTO components VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(s.inventory_key, s.name, s.category, s.package, s.in_stock, s.location, s.manufacturer_nr);
      db.prepare(`DELETE FROM suggested_components WHERE inventory_key=?`).run(req.params.key);
    })();
    dbLog('SUGGESTION_APPROVED', { key: s.inventory_key, name: s.name });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// LEFT JOIN is defensive: deleting a part now clears its reports, so a null name
// would mean a row got orphaned some other way. Better to show it than to hide it.
app.get('/api/reports', requireAdmin, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT r.id, r.inventory_key, r.report_type, r.timestamp, c.name
      FROM reports r
      LEFT JOIN components c ON c.inventory_key = r.inventory_key
      ORDER BY r.timestamp DESC, r.id DESC
    `).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/reports', (req, res) => {
  const { inventory_key, report_type } = req.body;
  try {
    db.prepare(`INSERT INTO reports (inventory_key, report_type) VALUES (?, ?)`).run(inventory_key, report_type);
    dbLog('REPORT_ADDED', { key: inventory_key, type: report_type });
    if (report_type === 'Not in stock') {
      const count = db.prepare(`SELECT COUNT(*) as cnt FROM reports WHERE inventory_key = ? AND report_type = 'Not in stock'`).get(inventory_key).cnt;
      if (count >= 2) {
        db.prepare(`UPDATE components SET in_stock = 0 WHERE inventory_key = ?`).run(inventory_key);
        dbLog('AUTO_ZERO', { key: inventory_key, count, in_stock_set_to: 0 });
      }
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/components/:key/use', (req, res) => {
  const { amount, action } = req.body;
  try {
    const comp = db.prepare(`SELECT in_stock FROM components WHERE inventory_key = ?`).get(req.params.key);
    const delta = action === 'take' ? -amount : amount;
    const newStock = Math.max(0, comp.in_stock + delta);
    db.prepare(`UPDATE components SET in_stock = ? WHERE inventory_key = ?`).run(newStock, req.params.key);
    db.prepare(`UPDATE real_number_reports SET reported_number = reported_number + ? WHERE inventory_key = ?`).run(delta, req.params.key);
    dbLog('USE_ACTION', { key: req.params.key, action, amount, delta, new_in_stock: newStock });
    res.json({ success: true, in_stock: newStock });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/components/:key/report-real', (req, res) => {
  const { reported_number } = req.body;
  try {
    const count = db.prepare(`SELECT COUNT(*) as cnt FROM real_number_reports WHERE inventory_key = ? AND reported_number = ?`).get(req.params.key, reported_number).cnt;
    if (count >= 1) {
      db.prepare(`UPDATE components SET in_stock = ? WHERE inventory_key = ?`).run(reported_number, req.params.key);
      db.prepare(`DELETE FROM real_number_reports WHERE inventory_key = ?`).run(req.params.key);
      dbLog('REPORT_REAL_MATCH', { key: req.params.key, reported_number, in_stock_updated: reported_number });
    } else {
      db.prepare(`INSERT INTO real_number_reports (inventory_key, reported_number) VALUES (?, ?)`).run(req.params.key, reported_number);
      dbLog('REPORT_REAL_NEW', { key: req.params.key, reported_number });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
