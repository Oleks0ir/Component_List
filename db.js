const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'components.db');

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) console.error(err.message);
  else console.log('Connected to SQLite database');
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS components (
      inventory_key TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      package TEXT,
      in_stock INTEGER DEFAULT 0,
      location TEXT,
      manufacturer_nr TEXT
    )
  `);
});

module.exports = db;
