import Database from 'better-sqlite3';

const db = new Database('components.db');
console.log('Tables:', db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name));
console.log('Categories:', db.prepare('SELECT * FROM categories').all());
console.log('Packages:', db.prepare('SELECT * FROM packages').all());
