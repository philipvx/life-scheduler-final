const express = require("express");
const Database = require("better-sqlite3");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 3000;
const db = new Database(path.join(__dirname, "scheduler.db"));
const JWT_SECRET = process.env.JWT_SECRET || "super_secret_key_life_scheduler_2026";

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
db.pragma("journal_mode = WAL");

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 username TEXT UNIQUE NOT NULL,
 password TEXT NOT NULL,
 is_public INTEGER NOT NULL DEFAULT 1,
 categories TEXT DEFAULT NULL
);
CREATE TABLE IF NOT EXISTS activities (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL DEFAULT 1,
 title TEXT NOT NULL,
 category TEXT NOT NULL DEFAULT 'Personal',
 date TEXT,
 start_time TEXT NOT NULL,
 end_time TEXT NOT NULL,
 priority INTEGER NOT NULL DEFAULT 4,
 recurring TEXT NOT NULL DEFAULT 'none',
 days TEXT NOT NULL DEFAULT '[]',
 flexible INTEGER NOT NULL DEFAULT 1,
 notes TEXT DEFAULT '',
 completed INTEGER NOT NULL DEFAULT 0,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS settings (
 key TEXT PRIMARY KEY,
 value TEXT
);
CREATE TABLE IF NOT EXISTS completions (
 user_id INTEGER NOT NULL DEFAULT 1,
 activity_id INTEGER NOT NULL,
 date TEXT NOT NULL,
 PRIMARY KEY (activity_id, date)
);
CREATE TABLE IF NOT EXISTS subtasks (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL DEFAULT 1,
 activity_id INTEGER NOT NULL,
 title TEXT NOT NULL,
 done INTEGER NOT NULL DEFAULT 0,
 sort_order INTEGER NOT NULL DEFAULT 0,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

// Migration safety net
try { db.exec("ALTER TABLE activities ADD COLUMN days TEXT NOT NULL DEFAULT '[]'"); } catch (e) {}
try { db.exec("ALTER TABLE activities ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1"); } catch (e) {}
try { db.exec("ALTER TABLE completions ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1"); } catch (e) {}
try { db.exec("ALTER TABLE subtasks ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1"); } catch (e) {}

// Create default firdaus account if it doesn't exist
const userCount = db.prepare("SELECT COUNT(*) as c FROM users").get().c;
if (userCount === 0) {
  const hash = bcrypt.hashSync("firdaus123", 10);
  db.prepare("INSERT INTO users(id, username, password, is_public) VALUES(1, 'firdaus', ?, 1)").run(hash);
  console.log("Default account 'firdaus' created with password 'firdaus123'.");
}

// Disable the old seed data wipe block so we don't accidentally wipe Firdaus's data
// We retain settings table for backwards compatibility but remove the auto-wipe logic

// ---------------------------------------------------------------------------
// Auth Middleware
// ---------------------------------------------------------------------------
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Forbidden" });
    req.user = user;
    next();
  });
}

// ---------------------------------------------------------------------------
// Auth Endpoints
// ---------------------------------------------------------------------------
app.post("/api/register", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Username and password required" });
  try {
    const hash = bcrypt.hashSync(password, 10);
    const r = db.prepare("INSERT INTO users(username, password) VALUES(?, ?)").run(username, hash);
    const token = jwt.sign({ id: r.lastInsertRowid, username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, id: r.lastInsertRowid, username, is_public: 1, categories: null });
  } catch (e) {
    res.status(400).json({ error: "Username already exists" });
  }
});

app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE username=?").get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: "Invalid username or password" });
  }
  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, id: user.id, username: user.username, is_public: user.is_public, categories: user.categories });
});

app.get("/api/users", (req, res) => {
  const users = db.prepare("SELECT id, username, is_public, categories FROM users WHERE is_public = 1").all();
  res.json(users);
});

app.get("/api/users/me", authenticate, (req, res) => {
  const user = db.prepare("SELECT id, username, is_public, categories FROM users WHERE id=?").get(req.user.id);
  res.json(user);
});

app.put("/api/users/me/public", authenticate, (req, res) => {
  const { is_public } = req.body;
  db.prepare("UPDATE users SET is_public=? WHERE id=?").run(is_public ? 1 : 0, req.user.id);
  res.json({ ok: true });
});

app.put("/api/users/me/categories", authenticate, (req, res) => {
  const { categories } = req.body; // expected to be stringified JSON object
  db.prepare("UPDATE users SET categories=? WHERE id=?").run(categories, req.user.id);
  res.json({ ok: true });
});

app.put("/api/users/me/profile", authenticate, (req, res) => {
  const { username, password } = req.body;
  if (!username) return res.status(400).json({ error: "Username is required" });
  try {
    if (password) {
      const hash = bcrypt.hashSync(password, 10);
      db.prepare("UPDATE users SET username=?, password=? WHERE id=?").run(username, hash, req.user.id);
    } else {
      db.prepare("UPDATE users SET username=? WHERE id=?").run(username, req.user.id);
    }
    // Return a new token since username might have changed
    const token = jwt.sign({ id: req.user.id, username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ ok: true, token, username });
  } catch(e) {
    res.status(400).json({ error: "Username already exists or invalid." });
  }
});

// ---------------------------------------------------------------------------
// Date / time helpers
// ---------------------------------------------------------------------------
function toISO(d) { return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function parseISO(s) { return new Date(s + "T00:00:00"); }

function occursOn(a, d) {
  const wd = d.getDay();
  const base = a.date ? parseISO(a.date) : null;
  let days = [];
  try { days = JSON.parse(a.days || "[]"); } catch (e) { days = []; }
  return (
    (a.recurring === "daily") ||
    (a.recurring === "weekdays" && wd >= 1 && wd <= 5) ||
    (a.recurring === "weekend" && (wd === 0 || wd === 6)) ||
    (a.recurring === "weekly" && base && wd === base.getDay()) ||
    (a.recurring === "custom" && days.includes(wd)) ||
    (a.recurring === "none" && a.date === toISO(d))
  );
}

function expand(a, from, to) {
  const out = [];
  const d = parseISO(from), end = parseISO(to);
  while (d <= end) {
    if (occursOn(a, d)) out.push({ ...a, occurrence_date: toISO(d) });
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function mins(t) { const [h, m] = t.split(":").map(Number); return h * 60 + m; }
function hhmm(n) { n = Math.max(0, Math.min(1439, n)); return String(Math.floor(n / 60)).padStart(2, "0") + ":" + String(n % 60).padStart(2, "0"); }
function overlaps(a, b) { return mins(a.start_time) < mins(b.end_time) && mins(b.start_time) < mins(a.end_time); }

function generateDay(rows, date) {
  const doneSet = new Set(db.prepare("SELECT activity_id FROM completions WHERE date=?").all(date).map(r => r.activity_id));
  const items = rows.flatMap(a => expand(a, date, date)).map(x => ({ ...x, date: x.occurrence_date, completed: doneSet.has(x.id) ? 1 : 0 }));
  items.sort((a, b) => a.priority - b.priority || mins(a.start_time) - mins(b.start_time));
  const accepted = [], conflicts = [];
  for (const item of items) {
    const hit = accepted.filter(x => overlaps(item, x));
    if (!hit.length) { accepted.push(item); continue; }
    const stronger = hit.filter(x => x.priority <= item.priority);
    if (item.flexible && stronger.length) {
      let duration = mins(item.end_time) - mins(item.start_time), placed = null;
      const anchors = accepted.filter(x => x.priority <= item.priority).sort((a, b) => mins(a.end_time) - mins(b.end_time));
      let cursor = mins(item.start_time);
      for (const a of anchors) {
        if (cursor + duration <= mins(a.start_time)) { placed = { s: cursor, e: cursor + duration }; break; }
        cursor = Math.max(cursor, mins(a.end_time));
      }
      if (!placed && cursor + duration <= 1439) placed = { s: cursor, e: cursor + duration };
      if (placed) {
        item.original_start = item.start_time; item.original_end = item.end_time;
        item.start_time = hhmm(placed.s); item.end_time = hhmm(placed.e); item.auto_moved = true;
        accepted.push(item); continue;
      }
    }
    conflicts.push({ ...item, conflicts_with: hit.map(x => x.title) });
  }
  accepted.sort((a, b) => mins(a.start_time) - mins(b.start_time));
  return { items: accepted, conflicts };
}

// ---------------------------------------------------------------------------
// Helper: Check public access
// ---------------------------------------------------------------------------
function checkReadAccess(req, res, next) {
  const userId = req.query.userId || 1;
  const targetUser = db.prepare("SELECT * FROM users WHERE id=?").get(userId);
  if (!targetUser) return res.status(404).json({ error: "User not found" });

  if (targetUser.is_public) {
    req.targetUserId = userId;
    return next();
  }

  // Not public, require authentication and match ID
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(403).json({ error: "Private profile" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err || user.id != userId) return res.status(403).json({ error: "Private profile" });
    req.targetUserId = userId;
    next();
  });
}

function withSubtaskCounts(rows) {
  const counts = db.prepare(
    "SELECT activity_id, COUNT(*) AS total, SUM(done) AS done FROM subtasks GROUP BY activity_id"
  ).all();
  const map = new Map(counts.map(c => [c.activity_id, { total: c.total, done: c.done || 0 }]));
  return rows.map(r => {
    const c = map.get(r.id);
    return { ...r, subtask_total: c ? c.total : 0, subtask_done: c ? c.done : 0 };
  });
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

app.get("/api/activities", checkReadAccess, (req, res) => {
  const userId = req.targetUserId;
  let rows = db.prepare("SELECT * FROM activities WHERE user_id=? ORDER BY start_time,id").all(userId);
  rows = withSubtaskCounts(rows);
  if (req.query.from && req.query.to) {
    rows = rows.flatMap(a => expand(a, req.query.from, req.query.to));
    const done = new Set(
      db.prepare("SELECT activity_id, date FROM completions WHERE user_id=? AND date BETWEEN ? AND ?")
        .all(userId, req.query.from, req.query.to)
        .map(r => r.activity_id + "|" + r.date)
    );
    rows = rows.map(x => ({ ...x, completed: done.has(x.id + "|" + x.occurrence_date) ? 1 : 0 }));
  }
  res.json(rows);
});

app.post("/api/activities", authenticate, (req, res) => {
  const x = req.body;
  if (!x.title || !x.start_time || !x.end_time) return res.status(400).json({ error: "Judul, mulai, dan selesai wajib diisi." });
  if (mins(x.end_time) <= mins(x.start_time)) return res.status(400).json({ error: "Jam selesai harus setelah jam mulai." });
  const r = db.prepare(`INSERT INTO activities(user_id,title,category,date,start_time,end_time,priority,recurring,days,flexible,notes)
   VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(
    req.user.id, x.title, x.category || "Personal", x.date || null, x.start_time, x.end_time,
    +x.priority || 4, x.recurring || "none", JSON.stringify(x.days || []), x.flexible ? 1 : 0, x.notes || ""
  );
  res.json(db.prepare("SELECT * FROM activities WHERE id=?").get(r.lastInsertRowid));
});

app.put("/api/activities/:id", authenticate, (req, res) => {
  const x = req.body;
  if (mins(x.end_time) <= mins(x.start_time)) return res.status(400).json({ error: "Jam selesai harus setelah jam mulai." });
  db.prepare(`UPDATE activities SET title=?,category=?,date=?,start_time=?,end_time=?,priority=?,recurring=?,days=?,flexible=?,notes=?,completed=? WHERE id=? AND user_id=?`)
    .run(x.title, x.category, x.date || null, x.start_time, x.end_time, +x.priority || 4, x.recurring || "none",
      JSON.stringify(x.days || []), x.flexible ? 1 : 0, x.notes || "", x.completed ? 1 : 0, req.params.id, req.user.id);
  res.json({ ok: true });
});

app.delete("/api/activities/:id", authenticate, (req, res) => {
  // Only delete if it belongs to user
  const act = db.prepare("SELECT id FROM activities WHERE id=? AND user_id=?").get(req.params.id, req.user.id);
  if(!act) return res.status(403).json({ error: "Not found or not yours" });

  db.prepare("DELETE FROM subtasks WHERE activity_id=?").run(req.params.id);
  db.prepare("DELETE FROM activities WHERE id=?").run(req.params.id); 
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Subtasks
// ---------------------------------------------------------------------------
app.get("/api/activities/:id/subtasks", (req, res) => {
  const rows = db.prepare("SELECT * FROM subtasks WHERE activity_id=? ORDER BY sort_order,id").all(req.params.id);
  res.json(rows);
});

app.post("/api/activities/:id/subtasks", authenticate, (req, res) => {
  const title = (req.body.title || "").trim();
  if (!title) return res.status(400).json({ error: "Judul subtugas wajib diisi." });
  const activityId = +req.params.id;
  const exists = db.prepare("SELECT 1 FROM activities WHERE id=? AND user_id=?").get(activityId, req.user.id);
  if (!exists) return res.status(404).json({ error: "Aktivitas tidak ditemukan." });
  const next = db.prepare("SELECT COALESCE(MAX(sort_order),-1)+1 AS n FROM subtasks WHERE activity_id=?").get(activityId).n;
  const r = db.prepare("INSERT INTO subtasks(user_id,activity_id,title,sort_order) VALUES(?,?,?,?)").run(req.user.id, activityId, title, next);
  res.json(db.prepare("SELECT * FROM subtasks WHERE id=?").get(r.lastInsertRowid));
});

app.put("/api/subtasks/:id", authenticate, (req, res) => {
  const title = (req.body.title || "").trim();
  if (!title) return res.status(400).json({ error: "Judul subtugas wajib diisi." });
  db.prepare("UPDATE subtasks SET title=? WHERE id=? AND user_id=?").run(title, req.params.id, req.user.id);
  res.json({ ok: true });
});

app.patch("/api/subtasks/:id/toggle", authenticate, (req, res) => {
  const row = db.prepare("SELECT done FROM subtasks WHERE id=? AND user_id=?").get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: "Subtugas tidak ditemukan." });
  db.prepare("UPDATE subtasks SET done=? WHERE id=?").run(row.done ? 0 : 1, req.params.id);
  res.json({ ok: true, done: !row.done });
});

app.delete("/api/subtasks/:id", authenticate, (req, res) => {
  db.prepare("DELETE FROM subtasks WHERE id=? AND user_id=?").run(req.params.id, req.user.id);
  res.json({ ok: true });
});
app.patch("/api/activities/:id/toggle", authenticate, (req, res) => {
  const date = req.query.date || (req.body && req.body.date);
  if (!date) return res.status(400).json({ error: "Tanggal wajib diisi untuk menandai selesai." });
  const activityId = +req.params.id;
  // Make sure it belongs to user
  const existsAct = db.prepare("SELECT 1 FROM activities WHERE id=? AND user_id=?").get(activityId, req.user.id);
  if (!existsAct) return res.status(404).json({ error: "Not found or not yours" });

  const exists = db.prepare("SELECT 1 FROM completions WHERE activity_id=? AND date=? AND user_id=?").get(activityId, date, req.user.id);
  if (exists) db.prepare("DELETE FROM completions WHERE activity_id=? AND date=? AND user_id=?").run(activityId, date, req.user.id);
  else db.prepare("INSERT INTO completions(user_id,activity_id,date) VALUES(?,?,?)").run(req.user.id, activityId, date);
  res.json({ ok: true, completed: !exists });
});

app.get("/api/schedule", checkReadAccess, (req, res) => {
  const date = req.query.date || toISO(new Date());
  const rows = withSubtaskCounts(db.prepare("SELECT * FROM activities WHERE user_id=?").all(req.targetUserId));
  res.json({ date, ...generateDay(rows, date) });
});

app.post("/api/auto-schedule", checkReadAccess, (req, res) => {
  const date = req.body.date || toISO(new Date());
  const rows = withSubtaskCounts(db.prepare("SELECT * FROM activities WHERE user_id=?").all(req.targetUserId));
  const result = generateDay(rows, date);
  res.json(result);
});

app.get("/api/stats", checkReadAccess, (req, res) => {
  const date = req.query.date || toISO(new Date());
  const rows = db.prepare("SELECT * FROM activities WHERE user_id=?").all(req.targetUserId).flatMap(a => expand(a, date, date));
  const doneSet = new Set(db.prepare("SELECT activity_id FROM completions WHERE date=? AND user_id=?").all(date, req.targetUserId).map(r => r.activity_id));
  const total = rows.length, done = rows.filter(x => doneSet.has(x.id)).length;
  const by = {}; rows.forEach(x => by[x.category] = (by[x.category] || 0) + 1);
  res.json({ total, done, pct: total ? Math.round(done / total * 100) : 0, by });
});

const HABIT_CATEGORIES = ["Worship", "Health", "Data Analyst", "English", "Personal"];

app.get("/api/habits", checkReadAccess, (req, res) => {
  const rows = db.prepare("SELECT * FROM activities WHERE user_id=?").all(req.targetUserId)
    .filter(a => a.recurring !== "none" && HABIT_CATEGORIES.includes(a.category));

  const groups = {};
  rows.forEach(a => {
    const key = a.title + "|" + a.category;
    (groups[key] ||= { title: a.title, category: a.category, rows: [] }).rows.push(a);
  });

  const allCompletions = db.prepare("SELECT activity_id, date FROM completions WHERE user_id=?").all(req.targetUserId);
  const completedSet = new Set(allCompletions.map(r => r.activity_id + "|" + r.date));

  const today = new Date(); today.setHours(0, 0, 0, 0);

  const result = Object.values(groups).map(g => {
    const rowForDate = d => g.rows.find(r => occursOn(r, d));

    let current = 0;
    let d = new Date(today);
    for (let i = 0; i < 3650; i++) {
      const r = rowForDate(d);
      if (r) {
        const done = completedSet.has(r.id + "|" + toISO(d));
        if (done) current++;
        else if (i !== 0) break;
      }
      d.setDate(d.getDate() - 1);
    }

    const ids = g.rows.map(r => r.id);
    const groupDates = allCompletions.filter(c => ids.includes(c.activity_id)).map(c => c.date).sort();
    let best = current;
    if (groupDates.length) {
      let run = 0;
      let dd = parseISO(groupDates[0]);
      while (dd <= today) {
        const r = rowForDate(dd);
        if (r) {
          if (completedSet.has(r.id + "|" + toISO(dd))) { run++; best = Math.max(best, run); }
          else run = 0;
        }
        dd.setDate(dd.getDate() + 1);
      }
    }
    return { title: g.title, category: g.category, current, best };
  }).sort((a, b) => b.current - a.current || b.best - a.best);

  res.json(result);
});

app.listen(PORT, () => console.log(`Life Scheduler running at http://localhost:${PORT}`));
