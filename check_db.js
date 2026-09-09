const Database = require('better-sqlite3');
const db = new Database('scheduler.db');
const users = db.prepare('SELECT * FROM users').all();
console.log("Users:", users);
const count = db.prepare('SELECT COUNT(*) as count FROM activities WHERE user_id = 1').get();
console.log("Activities for user 1:", count.count);
const total = db.prepare('SELECT COUNT(*) as count FROM activities').get();
console.log("Total Activities:", total.count);
