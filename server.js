const express = require("express");
const Database = require("better-sqlite3");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 3003;
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
CREATE TABLE IF NOT EXISTS habits (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL,
 activity_id INTEGER NOT NULL,
 UNIQUE(user_id, activity_id)
);
CREATE TABLE IF NOT EXISTS friendships (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_a INTEGER NOT NULL,
 user_b INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending',
 affinity TEXT DEFAULT NULL,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(user_a, user_b)
);
CREATE TABLE IF NOT EXISTS shared_streaks (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_a INTEGER NOT NULL,
 user_b INTEGER NOT NULL,
 date TEXT NOT NULL,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(user_a, user_b, date)
);
CREATE TABLE IF NOT EXISTS shared_activities (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL,
 friend_id INTEGER NOT NULL,
 activity_id INTEGER NOT NULL,
 UNIQUE(user_id, friend_id, activity_id)
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

  // Auto-record blue fire streak with any friends whose shared schedule is now fully done.
  if (!exists) recordBlueFireForUser(req.user.id, date);

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

// GET /api/analytics — per-activity statistics (all activities), completion over last 30 days
app.get("/api/analytics", checkReadAccess, (req, res) => {
  const userId = req.targetUserId;
  const rows = db.prepare("SELECT * FROM activities WHERE user_id=?").all(userId);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const from = new Date(today); from.setDate(from.getDate() - 29);
  const fromStr = toISO(from), toStr = toISO(today);

  const doneSet = new Set(
    db.prepare("SELECT activity_id, date FROM completions WHERE user_id=? AND date BETWEEN ? AND ?")
      .all(userId, fromStr, toStr)
      .map(r => r.activity_id + "|" + r.date)
  );

  const list = rows.map(a => {
    const occ = expand(a, fromStr, toStr);
    let completed = 0;
    for (const o of occ) if (doneSet.has(a.id + "|" + o.occurrence_date)) completed++;
    return {
      id: a.id,
      title: a.title,
      category: a.category,
      priority: a.priority,
      recurring: a.recurring,
      occurrences: occ.length,
      completed,
      pct: occ.length ? Math.round(completed / occ.length * 100) : 0
    };
  });

  res.json({ from: fromStr, to: toStr, list });
});

// ---------------------------------------------------------------------------
// Habits (user-controlled streak tracking)
// ---------------------------------------------------------------------------

// GET: list of habit-tracked activities with streak data
app.get("/api/habits", checkReadAccess, (req, res) => {
  const userId = req.targetUserId;
  const habitRows = db.prepare(
    "SELECT h.activity_id, a.title, a.category, a.recurring, a.date, a.days FROM habits h JOIN activities a ON h.activity_id = a.id WHERE h.user_id=?"
  ).all(userId);

  if (!habitRows.length) return res.json([]);

  const allCompletions = db.prepare("SELECT activity_id, date FROM completions WHERE user_id=?").all(userId);
  const completedSet = new Set(allCompletions.map(r => r.activity_id + "|" + r.date));
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const result = habitRows.map(a => {
    // Count current streak: the consecutive run of completed days ending at the
    // most-recently completed day (which may be today, a past day, or even a
    // future day the user pre-checked). This lets the user "patch" a missed day
    // and have the streak reconnect, rather than permanently losing it.
    const actDates = allCompletions.filter(c => c.activity_id === a.activity_id).map(c => c.date).sort();
    let current = 0;
    if (actDates.length) {
      const latestDone = actDates[actDates.length - 1]; // ISO dates sort lexicographically
      let d = parseISO(latestDone);
      for (let i = 0; i < 3650; i++) {
        if (occursOn(a, d)) {
          if (completedSet.has(a.activity_id + "|" + toISO(d))) current++;
          else break; // scheduled day missed — streak ends
        }
        d.setDate(d.getDate() - 1);
      }
    }

    // Count best streak ever (longest consecutive run across all history)
    let best = current;
    if (actDates.length) {
      let run = 0;
      let dd = parseISO(actDates[0]);
      const maxDay = parseISO(actDates[actDates.length - 1]);
      while (dd <= maxDay) {
        if (occursOn(a, dd)) {
          if (completedSet.has(a.activity_id + "|" + toISO(dd))) { run++; best = Math.max(best, run); }
          else run = 0;
        }
        dd.setDate(dd.getDate() + 1);
      }
    }

    const todayDone = occursOn(a, today) ? completedSet.has(a.activity_id + "|" + toISO(today)) : null;

    return {
      activity_id: a.activity_id,
      title: a.title,
      category: a.category,
      current,
      best,
      today_done: todayDone,
      today_date: toISO(today)
    };
  }).sort((a, b) => b.current - a.current || b.best - a.best);

  res.json(result);
});

// POST: add activity to habit tracking
app.post("/api/habits/:activityId", authenticate, (req, res) => {
  const activityId = +req.params.activityId;
  const act = db.prepare("SELECT id FROM activities WHERE id=? AND user_id=?").get(activityId, req.user.id);
  if (!act) return res.status(404).json({ error: "Aktivitas tidak ditemukan." });
  try {
    db.prepare("INSERT OR IGNORE INTO habits(user_id, activity_id) VALUES(?,?)").run(req.user.id, activityId);
    res.json({ ok: true });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

// DELETE: remove activity from habit tracking
app.delete("/api/habits/:activityId", authenticate, (req, res) => {
  db.prepare("DELETE FROM habits WHERE user_id=? AND activity_id=?").run(req.user.id, +req.params.activityId);
  res.json({ ok: true });
});

// GET: check if a specific activity is tracked as habit (used by frontend)
app.get("/api/habits/check/:activityId", authenticate, (req, res) => {
  const row = db.prepare("SELECT 1 FROM habits WHERE user_id=? AND activity_id=?").get(req.user.id, +req.params.activityId);
  res.json({ is_habit: !!row });
});

// ===========================================================================
// FRIENDS + AFFINITY + SHARED SCHEDULE + BLUE FIRE (api biru)
// ===========================================================================

// Normalize a friendship pair so user_a is always the smaller id.
function pair(a, b) { return a < b ? [a, b] : [b, a]; }

function friendshipBetween(a, b) {
  const [x, y] = pair(a, b);
  return db.prepare("SELECT * FROM friendships WHERE user_a=? AND user_b=?").get(x, y);
}

// Is b friends with a? (returns the friendship row if accepted)
function areFriends(a, b) {
  const f = friendshipBetween(a, b);
  return (f && f.status === 'accepted') ? f : null;
}

// GET /api/friends — my accepted friends, with affinity info + incoming requests + outgoing requests
app.get("/api/friends", authenticate, (req, res) => {
  const me = req.user.id;
  const friends = db.prepare(`
    SELECT f.id AS friendship_id, f.affinity,
           u.id, u.username, u.is_public
    FROM friendships f
    JOIN users u ON u.id = CASE WHEN f.user_a = ? THEN f.user_b ELSE f.user_a END
    WHERE (f.user_a = ? OR f.user_b = ?) AND f.status = 'accepted'
    ORDER BY u.username
  `).all(me, me, me);

  const incoming = db.prepare(`
    SELECT f.id AS friendship_id, u.id, u.username, u.is_public
    FROM friendships f
    JOIN users u ON u.id = f.user_a
    WHERE f.user_b = ? AND f.status = 'pending'
    ORDER BY f.created_at
  `).all(me);

  const outgoing = db.prepare(`
    SELECT f.id AS friendship_id, u.id, u.username, u.is_public
    FROM friendships f
    JOIN users u ON u.id = f.user_b
    WHERE f.user_a = ? AND f.status = 'pending'
    ORDER BY f.created_at
  `).all(me);

  res.json({ friends, incoming, outgoing });
});

// GET /api/users/search?q= — find users to add as friend (excludes self + already-friended)
app.get("/api/users/search", authenticate, (req, res) => {
  const q = (req.query.q || "").trim();
  const me = req.user.id;
  if (!q) return res.json([]);
  const rows = db.prepare(
    "SELECT id, username, is_public FROM users WHERE username LIKE ? AND id != ? ORDER BY username LIMIT 20"
  ).all("%" + q + "%", me);

  const result = rows.map(u => {
    const f = friendshipBetween(me, u.id);
    return { ...u, status: f ? f.status : null };
  });
  res.json(result);
});

// POST /api/friends — send a friend request to userId
app.post("/api/friends", authenticate, (req, res) => {
  const targetId = +req.body.userId;
  if (!targetId) return res.status(400).json({ error: "userId wajib diisi." });
  if (targetId === req.user.id) return res.status(400).json({ error: "Tidak bisa menambah diri sendiri." });
  const target = db.prepare("SELECT id FROM users WHERE id=?").get(targetId);
  if (!target) return res.status(404).json({ error: "Pengguna tidak ditemukan." });

  const [x, y] = pair(req.user.id, targetId);
  const existing = db.prepare("SELECT * FROM friendships WHERE user_a=? AND user_b=?").get(x, y);
  if (existing) {
    if (existing.status === 'accepted') return res.status(400).json({ error: "Sudah berteman." });
    // A pending request already exists — let the other side accept/reject it.
    return res.status(400).json({ error: "Permintaan pertemanan sudah dikirim." });
  }
  db.prepare("INSERT INTO friendships(user_a, user_b, status) VALUES(?,?, 'pending')").run(x, y);
  res.json({ ok: true });
});

// POST /api/friends/:userId/accept — accept an incoming friend request
app.post("/api/friends/:userId/accept", authenticate, (req, res) => {
  const otherId = +req.params.userId;
  const [x, y] = pair(req.user.id, otherId);
  const f = db.prepare("SELECT * FROM friendships WHERE user_a=? AND user_b=?").get(x, y);
  if (!f || f.status !== 'pending') return res.status(400).json({ error: "Tidak ada permintaan pertemanan." });
  db.prepare("UPDATE friendships SET status='accepted' WHERE id=?").run(f.id);
  res.json({ ok: true });
});

// POST /api/friends/:userId/reject — reject incoming request (or cancel outgoing)
app.post("/api/friends/:userId/reject", authenticate, (req, res) => {
  const otherId = +req.params.userId;
  const [x, y] = pair(req.user.id, otherId);
  db.prepare("DELETE FROM friendships WHERE user_a=? AND user_b=?").run(x, y);
  res.json({ ok: true });
});

// DELETE /api/friends/:userId — unfriend (remove accepted friendship)
app.delete("/api/friends/:userId", authenticate, (req, res) => {
  const otherId = +req.params.userId;
  const [x, y] = pair(req.user.id, otherId);
  const f = db.prepare("SELECT * FROM friendships WHERE user_a=? AND user_b=?").get(x, y);
  if (!f) return res.status(404).json({ error: "Belum berteman." });
  db.prepare("DELETE FROM friendships WHERE id=?").run(f.id);
  // Also clear any shared streak records and shared-activity selections for this pair.
  db.prepare("DELETE FROM shared_streaks WHERE user_a=? AND user_b=?").run(x, y);
  db.prepare("DELETE FROM shared_activities WHERE (user_id=? AND friend_id=?) OR (user_id=? AND friend_id=?)").run(x, y, y, x);
  res.json({ ok: true });
});

// PUT /api/friends/:userId/affinity — set affinity (saudara / sahabat / null)
app.put("/api/friends/:userId/affinity", authenticate, (req, res) => {
  const otherId = +req.params.userId;
  const f = areFriends(req.user.id, otherId);
  if (!f) return res.status(400).json({ error: "Kalian belum berteman." });
  const affinity = req.body.affinity || null; // "saudara" | "sahabat" | null
  if (affinity && !["saudara", "sahabat"].includes(affinity)) {
    return res.status(400).json({ error: "Afinitas tidak valid." });
  }
  db.prepare("UPDATE friendships SET affinity=? WHERE id=?").run(affinity, f.id);
  res.json({ ok: true, affinity });
});

// Helper: activities occurring on a given date for a user (reuses expand/occursOn).
function activitiesOnDate(userId, date) {
  const rows = db.prepare("SELECT * FROM activities WHERE user_id=?").all(userId);
  return rows.flatMap(a => expand(a, date, date));
}

// Helper: the set of activity ids a user has explicitly chosen to share with a friend.
// Returns null if the user has not made any selection (meaning "share everything" by default).
function sharedActivityIds(userId, friendId) {
  const rows = db.prepare("SELECT activity_id FROM shared_activities WHERE user_id=? AND friend_id=?").all(userId, friendId);
  if (!rows.length) return null;
  return new Set(rows.map(r => r.activity_id));
}

// Helper: filter a user's activities down to what they share with `friendId`.
// If no explicit selection exists, all activities are shared.
function applySharedSelection(userId, friendId, items) {
  const sel = sharedActivityIds(userId, friendId);
  if (sel === null) return items;
  return items.filter(x => sel.has(x.id));
}

// Helper: compute the shared schedule state between two friends for a date,
// and (optionally) persist the blue-fire streak if everything is completed.
function computeSharedSchedule(a, b, date) {
  const my = applySharedSelection(a, b, activitiesOnDate(a, date));
  const their = applySharedSelection(b, a, activitiesOnDate(b, date));

  const doneSet = new Set(
    db.prepare("SELECT user_id, activity_id, date FROM completions WHERE date=? AND user_id IN (?,?)")
      .all(date, a, b)
      .map(r => r.user_id + "|" + r.activity_id + "|" + r.date)
  );

  const mark = (arr, uid) => arr.map(x => ({ ...x, user_id: uid, date, completed: doneSet.has(uid + "|" + x.id + "|" + date) ? 1 : 0 }));

  const myMarked = mark(my, a);
  const theirMarked = mark(their, b);

  // Blue fire: every shared activity (mine + theirs) must be completed, and there must be at least one activity.
  const all = [...myMarked, ...theirMarked];
  const allDone = all.length > 0 && all.every(x => x.completed === 1);

  return { myMarked, theirMarked, all, allDone };
}

// Persist the blue-fire streak for a friendship pair on a date (idempotent).
function recordBlueFire(a, b, date) {
  const [x, y] = pair(a, b);
  db.prepare("INSERT OR IGNORE INTO shared_streaks(user_a, user_b, date) VALUES(?,?,?)").run(x, y, date);
}

// Auto-record blue fire for every friend of `userId` whose shared schedule is
// fully completed on `date`. Called whenever an activity is toggled.
function recordBlueFireForUser(userId, date) {
  const friends = db.prepare(`
    SELECT CASE WHEN f.user_a = ? THEN f.user_b ELSE f.user_a END AS friend_id
    FROM friendships f
    WHERE (f.user_a = ? OR f.user_b = ?) AND f.status = 'accepted'
  `).all(userId, userId, userId);

  for (const fr of friends) {
    const fid = fr.friend_id;
    const { all, allDone } = computeSharedSchedule(userId, fid, date);
    if (allDone) recordBlueFire(userId, fid, date);
  }
}

// GET /api/shared-schedule/:userId?date=YYYY-MM-DD
// Combined schedule for me + a friend (must be accepted friends).
app.get("/api/shared-schedule/:userId", authenticate, (req, res) => {
  const otherId = +req.params.userId;
  const f = areFriends(req.user.id, otherId);
  if (!f) return res.status(403).json({ error: "Kalian belum berteman." });
  const date = req.query.date || toISO(new Date());

  const { myMarked, theirMarked, allDone } = computeSharedSchedule(req.user.id, otherId, date);

  // Persist blue fire streak for this date if all done (idempotent).
  if (allDone) recordBlueFire(req.user.id, otherId, date);
  const streak = sharedStreakCount(req.user.id, otherId);

  res.json({
    date,
    me: { user_id: req.user.id, items: myMarked },
    friend: { user_id: otherId, items: theirMarked },
    all_done: allDone,
    blue_fire: allDone,
    streak
  });
});

// GET /api/shared-activities/:friendId — list my activities + which ones I share with this friend.
app.get("/api/shared-activities/:friendId", authenticate, (req, res) => {
  const otherId = +req.params.friendId;
  const f = areFriends(req.user.id, otherId);
  if (!f) return res.status(403).json({ error: "Kalian belum berteman." });

  const activities = db.prepare("SELECT id, title, category, start_time, end_time FROM activities WHERE user_id=?").all(req.user.id);
  const sel = sharedActivityIds(req.user.id, otherId);
  // If no explicit selection, everything is shared (default).
  const items = activities.map(a => ({ ...a, shared: sel === null ? true : sel.has(a.id) }));
  const hasSelection = sel !== null;

  res.json({ friend_id: otherId, has_selection: hasSelection, items });
});

// PUT /api/shared-activities/:friendId — set which of my activities are shared with this friend.
// Body: { activity_ids: [1,2,3] } — replaces the selection entirely.
app.put("/api/shared-activities/:friendId", authenticate, (req, res) => {
  const otherId = +req.params.friendId;
  const f = areFriends(req.user.id, otherId);
  if (!f) return res.status(403).json({ error: "Kalian belum berteman." });

  const ids = Array.isArray(req.body.activity_ids) ? req.body.activity_ids.map(Number).filter(n => Number.isInteger(n)) : [];
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM shared_activities WHERE user_id=? AND friend_id=?").run(req.user.id, otherId);
    for (const id of ids) {
      db.prepare("INSERT OR IGNORE INTO shared_activities(user_id, friend_id, activity_id) VALUES(?,?,?)").run(req.user.id, otherId, id);
    }
  });
  tx();
  res.json({ ok: true, activity_ids: ids });
});

// Helper: consecutive-day blue fire streak count, ending at the most recently
// earned day (may be today, a past day, or a future day). A missing day resets
// the run, but the user can "patch" a missed day and reconnect the streak.
function sharedStreakCount(a, b) {
  const [x, y] = pair(a, b);
  const rows = db.prepare("SELECT date FROM shared_streaks WHERE user_a=? AND user_b=? ORDER BY date ASC").all(x, y);
  if (!rows.length) return 0;
  const dates = new Set(rows.map(r => r.date));
  const latest = rows[rows.length - 1].date; // ISO dates sort lexicographically
  let cursor = parseISO(latest);
  let count = 0;
  for (let i = 0; i < 3650; i++) {
    if (dates.has(toISO(cursor))) { count++; }
    else break;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

// GET /api/blue-fire — list blue fire streaks across all my friends (for Dashboard card).
app.get("/api/blue-fire", authenticate, (req, res) => {
  const me = req.user.id;
  const friends = db.prepare(`
    SELECT u.id, u.username, f.affinity
    FROM friendships f
    JOIN users u ON u.id = CASE WHEN f.user_a = ? THEN f.user_b ELSE f.user_a END
    WHERE (f.user_a = ? OR f.user_b = ?) AND f.status = 'accepted'
  `).all(me, me, me);

  const result = friends.map(fr => {
    const streak = sharedStreakCount(me, fr.id);
    const [x, y] = pair(me, fr.id);
    const todayDone = db.prepare("SELECT 1 FROM shared_streaks WHERE user_a=? AND user_b=? AND date=?").get(x, y, toISO(new Date()));
    return {
      user_id: fr.id,
      username: fr.username,
      affinity: fr.affinity,
      streak,
      today_done: !!todayDone
    };
  });

  res.json(result);
});

app.listen(PORT, () => console.log(`Life Scheduler running at http://localhost:${PORT}`));
