const Database = require('better-sqlite3');
const db = new Database('scheduler.db');
const fs = require('fs');

let sql = '';
const tables = ['users', 'activities', 'completions', 'subtasks'];
for (const table of tables) {
  const rows = db.prepare(`SELECT * FROM ${table}`).all();
  if (rows.length === 0) continue;
  
  const cols = Object.keys(rows[0]);
  for (const row of rows) {
    const vals = cols.map(c => {
      const v = row[c];
      if (v === null) return 'NULL';
      if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`;
      return v;
    });
    sql += `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${vals.join(', ')});\n`;
  }
}
fs.writeFileSync('dump.sql', sql);
db.close();
