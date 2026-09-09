const Database = require('better-sqlite3');
const db = new Database('/home/ubuntu/teman/life-scheduler/scheduler.db');
try {
  db.exec('ALTER TABLE users ADD COLUMN categories TEXT DEFAULT null;');
  console.log("Success adding categories column");
} catch(e) {
  console.log("Error or already exists:", e.message);
}
db.close();
