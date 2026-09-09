const Database = require('better-sqlite3');
const db = new Database('scheduler.db');
db.pragma('wal_checkpoint(TRUNCATE)');
const users = db.prepare('SELECT * FROM users').all();
console.log("Users:", users);
const total = db.prepare('SELECT COUNT(*) as count FROM activities').get();
console.log("Total Activities:", total.count);
db.close();
