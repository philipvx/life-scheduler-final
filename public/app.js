/* Life Scheduler — Personal OS — frontend */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = x => String(x ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const DEFAULT_CATS = {
  "Academic": "var(--cat-academic)",
  "KP": "var(--cat-kp)",
  "Bootcamp": "var(--cat-bootcamp)",
  "Worship": "var(--cat-worship)",
  "English": "var(--cat-english)",
  "Data Analyst": "var(--cat-dataanalyst)",
  "Health": "var(--cat-health)",
  "Personal": "var(--cat-personal)",
  "Rest": "var(--cat-rest)"
};
let CATS = { ...DEFAULT_CATS };
const catColor = c => CATS[c] || "var(--primary)";
const PRI_LABEL = { 1: "P1", 2: "P2", 3: "P3", 4: "P4", 5: "P5" };
const PRI_FULL = { 1: "P1 — Wajib", 2: "P2 — Tinggi", 3: "P3 — Sedang", 4: "P4 — Fleksibel", 5: "P5 — Fleksibel" };
const REC_LABEL = { none: "Sekali", daily: "Setiap hari", weekdays: "Senin–Jumat", weekend: "Sabtu–Minggu", weekly: "Setiap minggu", custom: "Hari tertentu" };
const DOW_CHIPS = [{ v: 1, l: "Sen" }, { v: 2, l: "Sel" }, { v: 3, l: "Rab" }, { v: 4, l: "Kam" }, { v: 5, l: "Jum" }, { v: 6, l: "Sab" }, { v: 0, l: "Min" }];

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
function iso(d) { return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function parseISO(s) { return new Date(s + "T00:00:00"); }
function monday(d) { const x = new Date(d); const n = x.getDay() || 7; x.setDate(x.getDate() - n + 1); x.setHours(0, 0, 0, 0); return x; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function sameDate(a, b) { return iso(a) === iso(b); }
function dateTextLong(s) { return parseISO(s).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); }
window.viewedUserId = "";
window.currentUser = null;

async function api(u, o = {}) {
  const token = localStorage.getItem("ls_token");
  o.headers = o.headers || {};
  if (token) o.headers["Authorization"] = "Bearer " + token;
  
  if (!window.viewedUserId && !u.startsWith("/api/user") && !u.startsWith("/api/login") && !u.startsWith("/api/register")) {
    if (u.includes("/stats") || u.includes("/habits")) return {};
    return [];
  }

  if (!o.method || o.method === "GET") {
    const separator = u.includes("?") ? "&" : "?";
    u = u + separator + "userId=" + window.viewedUserId;
  }
  const r = await fetch(u, o);
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "Terjadi kesalahan");
  return j;
}

function toast(msg, type) {
  const wrap = $("#toastWrap");
  const el = document.createElement("div");
  el.className = "toast" + (type ? " " + type : "");
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------
function applyThemeUI() {
  const t = document.documentElement.getAttribute("data-theme") || "light";
  $("#themeIcon").innerHTML = t === "dark"
    ? `<svg class="icon icon-sm"><use href="#ic-moon"/></svg> <b>Dark</b>`
    : `<svg class="icon icon-sm"><use href="#ic-sun"/></svg> <b>Light</b>`;
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme") || "light";
  const next = cur === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try { localStorage.setItem("ls_theme", next); } catch (e) { }
  applyThemeUI();
}
$("#themeSwitch").onclick = toggleTheme;
applyThemeUI();

// ---------------------------------------------------------------------------
// View routing
// ---------------------------------------------------------------------------
let activeView = "dashboard";
const VIEW_META = {
  dashboard: ["Dashboard", "Ringkasan aktivitas dan progres hari ini."],
  calendar: ["Calendar", "Jadwal mingguan berdasarkan jam."],
  schedule: ["My Schedule", "Aktivitas dikelompokkan per hari."],
  analytics: ["Analytics", "Statistik dan tren produktivitas kamu."]
};
function renderActiveView() {
  if (activeView === "dashboard") loadDashboard();
  else if (activeView === "calendar") renderCalendar();
  else if (activeView === "schedule") renderSchedule();
  else if (activeView === "analytics") renderAnalytics();
  refreshPetMood();
}
function switchView(v) {
  activeView = v;
  $$(".view").forEach(x => x.classList.add("hide"));
  $("#" + v).classList.remove("hide");
  $$(".nav").forEach(x => x.classList.toggle("active", x.dataset.v === v));
  $("#pageTitle").textContent = VIEW_META[v][0];
  $("#pageSub").textContent = VIEW_META[v][1];
  renderActiveView();
}
$$(".nav").forEach(b => b.onclick = () => switchView(b.dataset.v));

// ===========================================================================
// DASHBOARD
// ===========================================================================
let dashCursor = new Date(); dashCursor.setHours(0, 0, 0, 0);

async function loadDashboard() {
  const d = iso(dashCursor);
  $("#datePick").value = d;

  const hour = new Date().getHours();
  $("#greeting").textContent = hour < 11 ? "Selamat pagi" : hour < 15 ? "Selamat siang" : hour < 18 ? "Selamat sore" : "Selamat malam";
  $("#todayText").textContent = dateTextLong(d);

  let stats, sched;
  try {
    [stats, sched] = await Promise.all([api("/api/stats?date=" + d), api("/api/schedule?date=" + d)]);
  } catch (e) { toast(e.message, "error"); return; }

  $("#mTotal").textContent = stats.total;
  $("#mDone").textContent = stats.done;
  $("#heroPct").textContent = stats.pct + "%";
  $("#sTotal").textContent = stats.total;
  $("#sDone").textContent = stats.done;
  $("#sPct").textContent = stats.pct + "%";
  $("#sConf").textContent = sched.conflicts.length;

  const now = new Date();
  const isToday = sameDate(dashCursor, now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const next = sched.items.filter(x => !x.completed && (!isToday || timeMins(x.start_time) >= nowMin))[0];
  $("#mNext").textContent = next ? next.title : "—";
  $("#nextTitle").textContent = next ? next.title : "Semua aktivitas selesai";
  $("#nextTime").textContent = next ? `${next.start_time}–${next.end_time} · ${next.category}` : "";

  $("#heroStatus").textContent = sched.conflicts.length
    ? `⚠ ${sched.conflicts.length} konflik perlu perhatian`
    : "✓ Jadwal berjalan lancar, tanpa konflik";

  // Timeline
  const tl = $("#timeline");
  if (!sched.items.length) {
    tl.innerHTML = `<div class="empty-note">Tidak ada aktivitas pada tanggal ini.</div>`;
  } else {
    tl.innerHTML = sched.items.map((x, i) => `
      <div class="t-item ${x.completed ? "is-done" : ""}" style="--cat:${catColor(x.category)}">
        <div class="t-rail">
          <div class="t-dot"></div>
          ${i < sched.items.length - 1 ? '<div class="t-line"></div>' : ""}
        </div>
        <div class="t-body" data-id="${x.id}" data-occ="${x.date}">
          <div>
            <div class="t-title">${esc(x.title)}${subBadge(x)}${x.auto_moved ? `<span class="t-moved">dipindah dari ${x.original_start}</span>` : ""}</div>
            <div class="t-cat">${esc(x.category)} · ${x.start_time}–${x.end_time}</div>
          </div>
          <div class="t-actions">
            ${x.completed ? "" : `<button class="t-check t-focus" data-focus="${x.id}" data-occ="${x.date}" title="Mulai fokus">
              <svg class="icon icon-sm"><use href="#ic-timer"/></svg>
            </button>`}
            <button class="t-check" data-toggle="${x.id}" data-occ="${x.date}" title="Tandai selesai">
              <svg class="icon icon-sm"><use href="#ic-check"/></svg>
            </button>
          </div>
        </div>
      </div>`).join("");
  }
  tl.querySelectorAll("[data-toggle]").forEach(b => b.onclick = async (e) => {
    e.stopPropagation();
    await toggleActivity(b.dataset.toggle, b.dataset.occ);
  });
  tl.querySelectorAll("[data-focus]").forEach(b => b.onclick = (e) => {
    e.stopPropagation();
    const item = sched.items.find(x => String(x.id) === b.dataset.focus && x.date === b.dataset.occ);
    if (item) openFocusSetup(item);
  });
  tl.querySelectorAll(".t-body").forEach(b => b.onclick = () => {
    const item = sched.items.find(x => String(x.id) === b.dataset.id && x.date === b.dataset.occ);
    if (item) openDetail(item);
  });

  // Intelligence panel
  const moved = sched.items.filter(x => x.auto_moved).length;
  $("#intelligence").innerHTML = `
    <div class="intel-row">
      <div class="intel-ic ${sched.conflicts.length ? "warn" : "ok"}">
        <svg class="icon icon-sm"><use href="#${sched.conflicts.length ? "ic-alert" : "ic-check"}"/></svg>
      </div>
      <div><b>${sched.conflicts.length} konflik</b><span>${sched.conflicts.length ? "belum terselesaikan otomatis" : "tidak ada konflik jadwal"}</span></div>
    </div>
    <div class="intel-row">
      <div class="intel-ic info"><svg class="icon icon-sm"><use href="#ic-zap"/></svg></div>
      <div><b>${moved} aktivitas</b><span>dipindahkan otomatis oleh scheduler</span></div>
    </div>
    <div class="intel-row">
      <div class="intel-ic ok"><svg class="icon icon-sm"><use href="#ic-target"/></svg></div>
      <div><b>Kuliah & ibadah</b><span>selalu diprioritaskan (P1)</span></div>
    </div>`;

  loadHabits();
}

async function loadHabits() {
  let habits = [];
  try { habits = await api("/api/habits"); } catch (e) { return; }
  const list = $("#habitList");
  if (!habits.length) {
    list.innerHTML = `<div class="empty-note">Belum ada kebiasaan yang terdeteksi. Kebiasaan diambil dari aktivitas berulang di kategori Worship, Health, Data Analyst, English, atau Personal.</div>`;
    return;
  }
  list.innerHTML = habits.map(h => `
    <div class="habit-card ${h.current === 0 ? "zero" : ""}" style="--cat:${catColor(h.category)}">
      <div class="hc-title">${esc(h.title)}</div>
      <div class="hc-cat">${esc(h.category)}</div>
      <div class="hc-streak"><b>${h.current ? "🔥" + h.current : "0"}</b><span>hari beruntun</span></div>
      <div class="hc-best">Rekor terbaik: ${h.best} hari</div>
    </div>`).join("");
}
function timeMins(t) { const [h, m] = t.split(":").map(Number); return h * 60 + m; }

// Small "2/5" progress badge shown next to a title when an activity has
// subtasks. Used across Dashboard timeline, Calendar, and My Schedule.
function subBadge(x) {
  if (!x.subtask_total) return "";
  const allDone = x.subtask_done >= x.subtask_total;
  return `<span class="sub-badge ${allDone ? "all-done" : ""}">☑ ${x.subtask_done}/${x.subtask_total}</span>`;
}

$("#datePick").onchange = e => { dashCursor = parseISO(e.target.value); loadDashboard(); };
$("#btnAuto").onclick = async () => {
  try {
    const r = await api("/api/auto-schedule", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: iso(dashCursor) }) });
    toast(r.conflicts.length ? `Selesai — ${r.conflicts.length} konflik masih perlu perhatian.` : "Selesai — jadwal tanpa konflik.", r.conflicts.length ? "error" : "success");
    loadDashboard();
  } catch (e) { toast(e.message, "error"); }
};

// ===========================================================================
// CALENDAR — weekly time grid
// ===========================================================================
let calCursor = new Date(); calCursor.setHours(0, 0, 0, 0);
const HOUR_START = 0, HOUR_END = 24, HOURPX = 52;

async function renderCalendar() {
  const start = monday(calCursor), end = addDays(start, 6);
  $("#calRange").textContent = `${start.toLocaleDateString("id-ID", { day: "numeric", month: "short" })} – ${end.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}`;

  if (!$("#calLegend").childElementCount) {
    const legend = $("#calLegend");
    if(legend) legend.innerHTML = Object.keys(CATS).map(c => `<span class="cat-chip" style="--cat:${catColor(c)}">${esc(c)}</span>`).join("");
  }

  let rows = [];
  try { rows = await api(`/api/activities?from=${iso(start)}&to=${iso(end)}`); }
  catch (e) { toast(e.message, "error"); return; }

  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const today = new Date();

  let html = `<div class="cal-corner"></div>`;
  days.forEach(d => {
    html += `<div class="cal-daycol-head ${sameDate(d, today) ? "is-today" : ""}">
      <div class="dow">${d.toLocaleDateString("id-ID", { weekday: "short" })}</div>
      <div class="dnum">${d.getDate()}</div>
    </div>`;
  });

  const totalH = (HOUR_END - HOUR_START) * HOURPX;
  html += `<div class="cal-hourlabels" style="height:${totalH}px">`;
  for (let h = HOUR_START; h < HOUR_END; h++) html += `<div class="cal-hourlabel" style="height:${HOURPX}px">${String(h).padStart(2, "0")}:00</div>`;
  html += `</div>`;

  days.forEach(d => {
    const ds = iso(d);
    const items = rows.filter(x => x.occurrence_date === ds).sort((a, b) => a.start_time.localeCompare(b.start_time));
    let col = `<div class="cal-daycol ${sameDate(d, today) ? "is-today" : ""}" style="height:${totalH}px">`;
    for (let h = HOUR_START; h <= HOUR_END; h++) col += `<div class="cal-hourline" style="top:${(h - HOUR_START) * HOURPX}px"></div>`;
    if (sameDate(d, today)) {
      const nowMin = today.getHours() * 60 + today.getMinutes();
      if (nowMin >= HOUR_START * 60 && nowMin <= HOUR_END * 60) {
        col += `<div class="cal-now-line" style="top:${(nowMin - HOUR_START * 60) / 60 * HOURPX}px"></div>`;
      }
    }
    items.forEach(x => {
      const s = timeMins(x.start_time), e = timeMins(x.end_time);
      const top = Math.max(0, (s - HOUR_START * 60) / 60 * HOURPX);
      const h = Math.max(20, (e - s) / 60 * HOURPX - 2);
      col += `<div class="cal-event ${x.completed ? "is-done" : ""} ${h < 34 ? "short" : ""}" style="--cat:${catColor(x.category)}; top:${top}px; height:${h}px"
        data-id="${x.id}" data-occ="${x.occurrence_date}">
        <div class="ce-title">${esc(x.title)}${subBadge(x)}</div>
        <div class="ce-time">${x.start_time}–${x.end_time}</div>
      </div>`;
    });
    col += `</div>`;
    html += col;
  });

  $("#calGrid").innerHTML = html;
  $("#calGrid").querySelectorAll(".cal-event").forEach(el => el.onclick = () => {
    const item = rows.find(x => String(x.id) === el.dataset.id && x.occurrence_date === el.dataset.occ);
    if (item) openDetail({ ...item, date: item.occurrence_date });
  });
}
$("#calPrev").onclick = () => { calCursor = addDays(monday(calCursor), -7); renderCalendar(); };
$("#calNext").onclick = () => { calCursor = addDays(monday(calCursor), 7); renderCalendar(); };
$("#calToday").onclick = () => { calCursor = new Date(); calCursor.setHours(0, 0, 0, 0); renderCalendar(); };

// ===========================================================================
// MY SCHEDULE — daily grouped cards
// ===========================================================================
let schCursor = new Date(); schCursor.setHours(0, 0, 0, 0);

async function renderSchedule() {
  const start = monday(schCursor), end = addDays(start, 6);
  $("#schRange").textContent = `${start.toLocaleDateString("id-ID", { day: "numeric", month: "short" })} – ${end.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}`;

  let rows = [];
  try { rows = await api(`/api/activities?from=${iso(start)}&to=${iso(end)}`); }
  catch (e) { toast(e.message, "error"); return; }

  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  $("#dayCards").innerHTML = days.map(d => {
    const ds = iso(d);
    const items = rows.filter(x => x.occurrence_date === ds).sort((a, b) => a.start_time.localeCompare(b.start_time));
    const isToday = sameDate(d, today);
    return `<div class="day-card ${isToday ? "is-today" : ""}">
      <div class="day-card-head">
        <div class="dch-left">
          <b>${d.toLocaleDateString("id-ID", { weekday: "long" })}</b>
          <span>${d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</span>
        </div>
        <span class="dch-badge">${items.length} aktivitas</span>
      </div>
      <div class="day-card-body">
        ${items.length ? items.map(x => `
          <div class="sched-row ${x.completed ? "is-done" : ""}" style="--cat:${catColor(x.category)}" data-id="${x.id}" data-occ="${x.occurrence_date}">
            <div class="sched-time">${x.start_time}–${x.end_time}</div>
            <div class="sched-dot"></div>
            <div class="sched-main">
              <div class="sched-title">${esc(x.title)}${subBadge(x)}</div>
              <div class="sched-sub">${esc(x.category)} · ${PRI_LABEL[x.priority]}</div>
            </div>
            <div class="sched-actions">
              ${x.completed ? "" : `<button class="icon-btn" data-act="focus" title="Mulai fokus"><svg class="icon icon-sm"><use href="#ic-timer"/></svg></button>`}
              <button class="icon-btn check ${x.completed ? "on" : ""}" data-act="toggle" title="Selesai"><svg class="icon icon-sm"><use href="#ic-check"/></svg></button>
              <button class="icon-btn" data-act="edit" title="Edit"><svg class="icon icon-sm"><use href="#ic-pencil"/></svg></button>
              <button class="icon-btn danger" data-act="del" title="Hapus"><svg class="icon icon-sm"><use href="#ic-trash"/></svg></button>
            </div>
          </div>`).join("") : `<div class="day-empty">Tidak ada aktivitas.</div>`}
      </div>
    </div>`;
  }).join("");

  $("#dayCards").querySelectorAll(".sched-row").forEach(row => {
    const id = row.dataset.id, occ = row.dataset.occ;
    row.querySelector('[data-act="toggle"]').onclick = e => { e.stopPropagation(); toggleActivity(id, occ); };
    row.querySelector('[data-act="edit"]').onclick = e => { e.stopPropagation(); openForm(id); };
    row.querySelector('[data-act="del"]').onclick = e => { e.stopPropagation(); deleteActivity(id); };
    const focusBtn = row.querySelector('[data-act="focus"]');
    if (focusBtn) focusBtn.onclick = e => {
      e.stopPropagation();
      const item = rows.find(x => String(x.id) === id && x.occurrence_date === occ);
      if (item) openFocusSetup({ ...item, date: item.occurrence_date });
    };
    row.onclick = () => {
      const item = rows.find(x => String(x.id) === id && x.occurrence_date === occ);
      if (item) openDetail({ ...item, date: item.occurrence_date });
    };
  });
}
$("#schPrev").onclick = () => { schCursor = addDays(monday(schCursor), -7); renderSchedule(); };
$("#schNext").onclick = () => { schCursor = addDays(monday(schCursor), 7); renderSchedule(); };
$("#schToday").onclick = () => { schCursor = new Date(); schCursor.setHours(0, 0, 0, 0); renderSchedule(); };

// ===========================================================================
// ANALYTICS
// ===========================================================================
async function renderAnalytics() {
  const start = monday(new Date()), end = addDays(start, 6);
  let all, weekRows;
  try {
    [all, weekRows] = await Promise.all([api("/api/activities"), api(`/api/activities?from=${iso(start)}&to=${iso(end)}`)]);
  } catch (e) { toast(e.message, "error"); return; }

  $("#aTemplates").textContent = all.length;
  $("#aFlex").textContent = all.filter(x => x.flexible).length;

  const byCat = {};
  weekRows.forEach(x => byCat[x.category] = (byCat[x.category] || 0) + 1);
  const maxCat = Math.max(1, ...Object.values(byCat));
  const sortedCats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  $("#aTop").textContent = sortedCats[0] ? sortedCats[0][0] : "—";
  $("#catBars").innerHTML = sortedCats.length ? sortedCats.map(([cat, n]) => `
    <div class="bar-row" style="--cat:${catColor(cat)}">
      <div class="br-top"><b>${esc(cat)}</b><span>${n}x</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.round(n / maxCat * 100)}%"></div></div>
    </div>`).join("") : `<div class="empty-note">Belum ada data minggu ini.</div>`;

  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  let weekTotal = 0, weekDone = 0;
  const trends = [];
  for (const d of days) {
    try {
      const s = await api("/api/stats?date=" + iso(d));
      weekTotal += s.total; weekDone += s.done;
      trends.push({ d, pct: s.pct });
    } catch (e) { trends.push({ d, pct: 0 }); }
  }
  $("#aWeekPct").textContent = (weekTotal ? Math.round(weekDone / weekTotal * 100) : 0) + "%";
  $("#trendRow").innerHTML = trends.map(t => `
    <div class="trend-col">
      <div class="trend-bar" style="height:${Math.max(4, t.pct)}%"></div>
      <span>${t.d.toLocaleDateString("id-ID", { weekday: "short" })}</span>
    </div>`).join("");
}

// ===========================================================================
// Add / Edit modal
// ===========================================================================
let selectedCat = "Personal", selectedPri = 4, selectedDays = new Set();

function buildCatGrid() {
  $("#catGrid").innerHTML = Object.keys(CATS).map(c => `
    <div class="cat-opt ${c === selectedCat ? "on" : ""}" data-cat="${esc(c)}" style="--cat:${catColor(c)}">
      <span class="dot"></span>${esc(c)}
    </div>`).join("");
  $("#catGrid").querySelectorAll(".cat-opt").forEach(el => el.onclick = () => {
    selectedCat = el.dataset.cat;
    $("#catGrid").querySelectorAll(".cat-opt").forEach(x => x.classList.toggle("on", x.dataset.cat === selectedCat));
  });
}
function buildPriGrid() {
  $("#priGrid").innerHTML = [1, 2, 3, 4, 5].map(p => `<div class="pri-opt ${p === selectedPri ? "on" : ""}" data-pri="${p}">${PRI_LABEL[p]}</div>`).join("");
  $("#priGrid").querySelectorAll(".pri-opt").forEach(el => el.onclick = () => {
    selectedPri = +el.dataset.pri;
    $("#priGrid").querySelectorAll(".pri-opt").forEach(x => x.classList.toggle("on", +x.dataset.pri === selectedPri));
  });
}
function buildDayChips() {
  $("#dayChips").innerHTML = DOW_CHIPS.map(c => `<div class="day-chip ${selectedDays.has(c.v) ? "on" : ""}" data-d="${c.v}">${c.l}</div>`).join("");
  $("#dayChips").querySelectorAll(".day-chip").forEach(el => el.onclick = () => {
    const v = +el.dataset.d;
    selectedDays.has(v) ? selectedDays.delete(v) : selectedDays.add(v);
    el.classList.toggle("on");
  });
}
function updateRecurringUI() {
  const rep = $("#f_rep").value;
  $("#wrapDate").classList.toggle("hide", !(rep === "none" || rep === "weekly"));
  $("#wrapDays").classList.toggle("hide", rep !== "custom");
}
$("#f_rep").onchange = updateRecurringUI;

function openForm(id) {
  $("#form").reset();
  $("#f_id").value = "";
  $("#f_date").value = iso(new Date());
  $("#f_rep").value = "none";
  selectedCat = "Personal"; selectedPri = 4; selectedDays = new Set();
  buildCatGrid(); buildPriGrid(); buildDayChips(); updateRecurringUI();
  $("#formTitle").textContent = "New Activity";
  $("#btnDeleteInForm").classList.add("hide");

  if (id) {
    api("/api/activities").then(all => {
      const x = all.find(z => String(z.id) === String(id));
      if (!x) return;
      $("#f_id").value = x.id;
      $("#f_title").value = x.title;
      $("#f_start").value = x.start_time;
      $("#f_end").value = x.end_time;
      $("#f_date").value = x.date || iso(new Date());
      $("#f_rep").value = x.recurring || "none";
      $("#f_flex").checked = !!x.flexible;
      $("#f_notes").value = x.notes || "";
      selectedCat = x.category; selectedPri = x.priority;
      try { selectedDays = new Set(JSON.parse(x.days || "[]")); } catch (e) { selectedDays = new Set(); }
      buildCatGrid(); buildPriGrid(); buildDayChips(); updateRecurringUI();
      $("#formTitle").textContent = "Edit Activity";
      $("#btnDeleteInForm").classList.remove("hide");
      $("#btnDeleteInForm").onclick = async () => { await deleteActivity(x.id); closeForm(); };
    });
  }
  $("#modal").classList.remove("hide");
}
function closeForm() { $("#modal").classList.add("hide"); }
$("#btnAdd").onclick = () => openForm(null);
$("#btnCloseForm").onclick = closeForm;
$("#btnCancelForm").onclick = closeForm;

$("#form").onsubmit = async e => {
  e.preventDefault();
  const rep = $("#f_rep").value;
  const payload = {
    title: $("#f_title").value.trim(),
    category: selectedCat,
    priority: selectedPri,
    start_time: $("#f_start").value,
    end_time: $("#f_end").value,
    recurring: rep,
    date: (rep === "none" || rep === "weekly") ? ($("#f_date").value || null) : null,
    days: rep === "custom" ? Array.from(selectedDays) : [],
    flexible: $("#f_flex").checked,
    notes: $("#f_notes").value
  };
  if (rep === "custom" && !payload.days.length) { toast("Pilih minimal satu hari.", "error"); return; }
  const id = $("#f_id").value;
  try {
    await api(id ? "/api/activities/" + id : "/api/activities", {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    closeForm();
    toast(id ? "Aktivitas diperbarui." : "Aktivitas ditambahkan.", "success");
    renderActiveView();
  } catch (err) { toast(err.message, "error"); }
};

// ===========================================================================
// Detail modal
// ===========================================================================
let detailItem = null;
function openDetail(item) {
  detailItem = item;
  $("#dDot").style.setProperty("--cat", catColor(item.category));
  $("#dTitle").textContent = item.title;
  $("#dTime").textContent = `${dateTextLong(item.date || item.occurrence_date)} · ${item.start_time}–${item.end_time}`;
  $("#dCat").innerHTML = `<span class="cat-chip" style="--cat:${catColor(item.category)}">${esc(item.category)}</span>`;
  $("#dPri").textContent = PRI_FULL[item.priority] || item.priority;
  $("#dRec").textContent = REC_LABEL[item.recurring] || item.recurring;
  $("#dStatus").textContent = item.completed ? "Selesai" : "Belum selesai";
  if (item.notes) { $("#dNotesWrap").classList.remove("hide"); $("#dNotes").textContent = item.notes; }
  else { $("#dNotesWrap").classList.add("hide"); }
  $("#btnToggleLabel").textContent = item.completed ? "Batalkan Selesai" : "Tandai Selesai";
  $("#detailModal").classList.remove("hide");
  loadSubtasks(item.id);
}
function closeDetail() { $("#detailModal").classList.add("hide"); detailItem = null; }

// ===========================================================================
// Subtasks (checklist inside Detail modal)
// ===========================================================================
async function loadSubtasks(activityId) {
  $("#dSubList").innerHTML = `<div class="dsub-empty">Memuat...</div>`;
  $("#dSubProgress").textContent = "";
  let subs = [];
  try { subs = await api(`/api/activities/${activityId}/subtasks`); }
  catch (e) { $("#dSubList").innerHTML = `<div class="dsub-empty">Gagal memuat subtugas.</div>`; return; }
  renderSubtasks(activityId, subs);
}

function renderSubtasks(activityId, subs) {
  const done = subs.filter(s => s.done).length;
  $("#dSubProgress").textContent = subs.length ? `${done}/${subs.length}` : "";
  $("#dSubList").innerHTML = subs.length
    ? subs.map(s => `
      <div class="dsub-row ${s.done ? "is-done" : ""}" data-id="${s.id}">
        <button type="button" class="dsub-check ${s.done ? "on" : ""}" data-act="toggle" title="Tandai selesai">
          <svg class="icon icon-sm"><use href="#ic-check"/></svg>
        </button>
        <span class="dsub-title">${esc(s.title)}</span>
        <button type="button" class="dsub-del" data-act="del" title="Hapus subtugas">
          <svg class="icon icon-sm"><use href="#ic-trash"/></svg>
        </button>
      </div>`).join("")
    : `<div class="dsub-empty">Belum ada subtugas. Pecah aktivitas ini jadi langkah-langkah kecil.</div>`;

  $("#dSubList").querySelectorAll(".dsub-row").forEach(row => {
    const id = row.dataset.id;
    row.querySelector('[data-act="toggle"]').onclick = async () => {
      try { await api(`/api/subtasks/${id}/toggle`, { method: "PATCH" }); loadSubtasks(activityId); renderActiveView(); }
      catch (e) { toast(e.message, "error"); }
    };
    row.querySelector('[data-act="del"]').onclick = async () => {
      try { await api(`/api/subtasks/${id}`, { method: "DELETE" }); loadSubtasks(activityId); renderActiveView(); }
      catch (e) { toast(e.message, "error"); }
    };
  });
}

$("#dSubAddForm").onsubmit = async e => {
  e.preventDefault();
  if (!detailItem) return;
  const input = $("#dSubInput");
  const title = input.value.trim();
  if (!title) return;
  try {
    await api(`/api/activities/${detailItem.id}/subtasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title })
    });
    input.value = "";
    loadSubtasks(detailItem.id);
    renderActiveView();
  } catch (e) { toast(e.message, "error"); }
};
$("#btnCloseDetail").onclick = closeDetail;
$("#btnToggleDetail").onclick = async () => { if (detailItem) { await toggleActivity(detailItem.id, detailItem.date); closeDetail(); } };
$("#btnFocusDetail").onclick = () => {
  if (!detailItem) return;
  const item = { ...detailItem, date: detailItem.date || detailItem.occurrence_date };
  closeDetail();
  openFocusSetup(item);
};
$("#btnDeleteDetail").onclick = async () => { if (detailItem) { await deleteActivity(detailItem.id); closeDetail(); } };
$("#btnEditDetail").onclick = () => { if (detailItem) { const id = detailItem.id; closeDetail(); openForm(id); } };

// ===========================================================================
// Shared mutations
// ===========================================================================
async function toggleActivity(id, date) {
  try { await api(`/api/activities/${id}/toggle?date=${date}`, { method: "PATCH" }); renderActiveView(); }
  catch (e) { toast(e.message, "error"); }
}
async function deleteActivity(id) {
  if (!confirm("Hapus aktivitas ini? Jika berulang, semua kemunculannya akan terhapus.")) return;
  try { await api("/api/activities/" + id, { method: "DELETE" }); toast("Aktivitas dihapus.", "success"); renderActiveView(); }
  catch (e) { toast(e.message, "error"); }
}

// Close modals on backdrop click
$("#modal").addEventListener("click", e => { if (e.target.id === "modal") closeForm(); });
$("#detailModal").addEventListener("click", e => { if (e.target.id === "detailModal") closeDetail(); });

// ===========================================================================
// REMINDERS — browser notifications shortly before an activity starts
// ===========================================================================
const REM_KEY = "ls_reminder_settings";
function getRemSettings() {
  try { return { enabled: false, minutes: 10, ...JSON.parse(localStorage.getItem(REM_KEY)) }; }
  catch (e) { return { enabled: false, minutes: 10 }; }
}
function setRemSettings(s) { try { localStorage.setItem(REM_KEY, JSON.stringify(s)); } catch (e) { } }

function renderRemUI() {
  const s = getRemSettings();
  $("#remMinutes").value = s.minutes;
  const supported = "Notification" in window;
  const on = supported && s.enabled && Notification.permission === "granted";
  $("#remSwitch").classList.toggle("on", on);
  $("#remMinutesRow").classList.toggle("disabled", !on);
  if (!supported) $("#remStatus").textContent = "Browser ini tidak mendukung notifikasi.";
  else if (Notification.permission === "denied") $("#remStatus").textContent = "Notifikasi diblokir. Izinkan lewat pengaturan browser.";
  else if (on) $("#remStatus").textContent = `Aktif — diingatkan ${s.minutes} menit sebelum mulai.`;
  else $("#remStatus").textContent = "Dapatkan notifikasi sebelum kegiatan dimulai.";
}

$("#remSwitch").onclick = async () => {
  if (!("Notification" in window)) return;
  const s = getRemSettings();
  if (!s.enabled) {
    let perm = Notification.permission;
    if (perm === "default") perm = await Notification.requestPermission();
    if (perm !== "granted") { renderRemUI(); return; }
    setRemSettings({ ...s, enabled: true });
    toast("Reminder diaktifkan.", "success");
  } else {
    setRemSettings({ ...s, enabled: false });
    toast("Reminder dimatikan.");
  }
  renderRemUI();
};
$("#remMinutes").onchange = e => { setRemSettings({ ...getRemSettings(), minutes: +e.target.value }); renderRemUI(); };

let remNotified = new Set(); // keys already notified today: `${id}|${date}|${start_time}`
let remNotifiedDate = null;

async function checkReminders() {
  const s = getRemSettings();
  if (!s.enabled || !("Notification" in window) || Notification.permission !== "granted") return;

  const now = new Date();
  const today = iso(now);
  if (remNotifiedDate !== today) { remNotified = new Set(); remNotifiedDate = today; }

  let sched;
  try { sched = await api("/api/schedule?date=" + today); } catch (e) { return; }

  const nowMin = now.getHours() * 60 + now.getMinutes();
  sched.items.forEach(x => {
    if (x.completed) return;
    const key = `${x.id}|${x.date}|${x.start_time}`;
    if (remNotified.has(key)) return;
    const diff = timeMins(x.start_time) - nowMin;
    if (diff >= 0 && diff <= s.minutes) {
      remNotified.add(key);
      try {
        const n = new Notification(`⏰ ${x.title} sebentar lagi`, {
          body: `${x.start_time}–${x.end_time} · ${x.category}`,
          tag: key
        });
        n.onclick = () => { window.focus(); n.close(); };
      } catch (e) { }
    }
  });
}

renderRemUI();
setInterval(checkReminders, 20000);
checkReminders();

// ===========================================================================
// FOCUS TIMER — Pomodoro-style timer attached to a single activity
// ===========================================================================
const FOCUS_KEY = "ls_focus_state";
const POMO_PRESETS = { pomo25: { work: 25, break: 5 }, pomo50: { work: 50, break: 10 } };

function loadFocusState() {
  try {
    const s = JSON.parse(localStorage.getItem(FOCUS_KEY));
    if (s && s.endAt) return s;
  } catch (e) { }
  return null;
}
function saveFocusState() {
  try {
    if (focusState) localStorage.setItem(FOCUS_KEY, JSON.stringify(focusState));
    else localStorage.removeItem(FOCUS_KEY);
  } catch (e) { }
}

let focusState = loadFocusState();
let focusTicker = null;
let pendingFocusItem = null;

function openFocusSetup(item) {
  pendingFocusItem = item;
  $("#focusSetupActivityName").textContent = `${item.title} · ${item.start_time}–${item.end_time}`;
  $$(".focus-mode-opt").forEach(el => el.classList.toggle("on", el.dataset.mode === "duration"));
  $("#focusSetupModal").dataset.mode = "duration";
  $("#focusSetupModal").classList.remove("hide");
}
function closeFocusSetup() { $("#focusSetupModal").classList.add("hide"); pendingFocusItem = null; }
$("#btnCloseFocusSetup").onclick = closeFocusSetup;
$("#btnCancelFocusSetup").onclick = closeFocusSetup;
$("#focusSetupModal").addEventListener("click", e => { if (e.target.id === "focusSetupModal") closeFocusSetup(); });
$$(".focus-mode-opt").forEach(el => el.onclick = () => {
  $$(".focus-mode-opt").forEach(x => x.classList.remove("on"));
  el.classList.add("on");
  $("#focusSetupModal").dataset.mode = el.dataset.mode;
});
$("#btnStartFocus").onclick = () => {
  if (!pendingFocusItem) return;
  const mode = $("#focusSetupModal").dataset.mode || "duration";
  startFocus(pendingFocusItem, mode);
  closeFocusSetup();
};

function startFocus(item, mode) {
  const now = Date.now();
  let workMin, breakMin, autoComplete = false;
  if (mode === "duration") {
    const [eh, em] = item.end_time.split(":").map(Number);
    const end = new Date(); end.setHours(eh, em, 0, 0);
    let mins = Math.round((end.getTime() - now) / 60000);
    if (mins <= 0) mins = 25; // schedule already passed — fall back to a normal focus block
    workMin = mins; breakMin = 0; autoComplete = true;
  } else {
    const p = POMO_PRESETS[mode] || POMO_PRESETS.pomo25;
    workMin = p.work; breakMin = p.break;
  }
  focusState = {
    id: item.id, date: item.date || item.occurrence_date, title: item.title,
    mode, phase: "work", workMin, breakMin, autoComplete, cyclesDone: 0,
    endAt: now + workMin * 60000, paused: false, remainingMs: null
  };
  saveFocusState();
  renderFocusWidget();
  startFocusTicker();
  toast(`Fokus dimulai: ${item.title}`, "success");
}

function startFocusTicker() {
  clearInterval(focusTicker);
  focusTicker = setInterval(tickFocus, 1000);
  tickFocus();
}

function tickFocus() {
  if (!focusState || focusState.paused) return;
  const remaining = focusState.endAt - Date.now();
  if (remaining <= 0) { advanceFocusPhase(); return; }
  updateFocusDisplay(remaining);
}

function advanceFocusPhase() {
  if (!focusState) return;
  if (focusState.autoComplete) { finishFocusAutoComplete(); return; }
  if (focusState.phase === "work") {
    focusState.cyclesDone += 1;
    focusState.phase = "break";
    focusState.endAt = Date.now() + focusState.breakMin * 60000;
    toast(`🍅 Sesi fokus selesai! Waktunya istirahat ${focusState.breakMin} menit.`, "success");
    notifyFocus("Waktunya istirahat", `${focusState.breakMin} menit istirahat setelah fokus di "${focusState.title}"`);
  } else {
    focusState.phase = "work";
    focusState.endAt = Date.now() + focusState.workMin * 60000;
    toast(`Istirahat selesai — balik fokus ke "${focusState.title}"`, "success");
    notifyFocus("Balik fokus", `Sesi fokus ${focusState.workMin} menit dimulai lagi`);
  }
  saveFocusState();
  updateFocusDisplay(focusState.endAt - Date.now());
}

async function finishFocusAutoComplete() {
  const item = focusState;
  toast(`🎉 "${item.title}" otomatis ditandai selesai!`, "success");
  notifyFocus("Aktivitas selesai", `"${item.title}" otomatis ditandai selesai.`);
  try { await api(`/api/activities/${item.id}/toggle?date=${item.date}`, { method: "PATCH" }); } catch (e) { }
  stopFocus();
  renderActiveView();
}

function notifyFocus(title, body) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try { new Notification(`⏱ ${title}`, { body }); } catch (e) { }
}

function stopFocus() {
  clearInterval(focusTicker);
  focusTicker = null;
  focusState = null;
  saveFocusState();
  $("#focusWidget").classList.add("hide");
}

function pad2(n) { return String(n).padStart(2, "0"); }
function updateFocusDisplay(remainingMs) {
  if (!focusState) return;
  const total = Math.max(0, remainingMs);
  const mins = Math.floor(total / 60000);
  const secs = Math.floor((total % 60000) / 1000);
  $("#focusTime").textContent = `${pad2(mins)}:${pad2(secs)}`;
  const phaseTotal = ((focusState.phase === "work" ? focusState.workMin : focusState.breakMin) || 1) * 60000;
  const pct = Math.min(100, Math.max(0, 100 - (total / phaseTotal * 100)));
  $("#focusBarFill").style.width = pct + "%";
  $("#focusPhaseLabel").textContent = focusState.autoComplete
    ? "Fokus"
    : (focusState.phase === "work" ? `Fokus${focusState.cyclesDone ? ` · sesi ke-${focusState.cyclesDone + 1}` : ""}` : "Istirahat");
  $("#focusTitle").textContent = focusState.title;
}

function renderFocusWidget() {
  const w = $("#focusWidget");
  if (!focusState) { w.classList.add("hide"); return; }
  w.classList.remove("hide");
  w.classList.toggle("is-break", focusState.phase === "break");
  updateFocusDisplay(focusState.paused ? focusState.remainingMs : focusState.endAt - Date.now());
  $("#focusPauseBtn").textContent = focusState.paused ? "Lanjut" : "Jeda";
}

$("#focusPauseBtn").onclick = () => {
  if (!focusState) return;
  if (focusState.paused) {
    focusState.endAt = Date.now() + (focusState.remainingMs ?? 0);
    focusState.paused = false;
    startFocusTicker();
  } else {
    focusState.remainingMs = Math.max(0, focusState.endAt - Date.now());
    focusState.paused = true;
    clearInterval(focusTicker);
  }
  saveFocusState();
  renderFocusWidget();
};
$("#focusDoneBtn").onclick = async () => {
  if (!focusState) return;
  try { await api(`/api/activities/${focusState.id}/toggle?date=${focusState.date}`, { method: "PATCH" }); toast("Aktivitas ditandai selesai.", "success"); }
  catch (e) { toast(e.message, "error"); }
  stopFocus();
  renderActiveView();
};
$("#focusClose").onclick = () => { if (confirm("Hentikan sesi fokus ini?")) stopFocus(); };

// Resume a session that survives a page reload
if (focusState) {
  renderFocusWidget();
  if (!focusState.paused) startFocusTicker();
}

// ===========================================================================
// PIXEL PET — mood reacts to today's daily progress (independent of whatever
// date the Dashboard/Calendar/Schedule happen to be showing right now)
// ===========================================================================
const petTrack = $(".pixel-pet-track");
const PET_MOODS = [
  { key: "rest", label: "🌙 Belum ada jadwal hari ini", test: (total) => total === 0 },
  { key: "low", label: "😔 Baru mulai, semangat!", test: (total, pct) => pct < 30 },
  { key: "mid", label: "🙂 Lagi jalan, terus lanjutkan", test: (total, pct) => pct < 60 },
  { key: "high", label: "😄 Progres bagus hari ini!", test: (total, pct) => pct < 100 },
  { key: "perfect", label: "🏆 Semua aktivitas hari ini selesai!", test: () => true }
];

function applyPetMood(total, pct) {
  if (!petTrack) return;
  const mood = PET_MOODS.find(m => m.test(total, pct)) || PET_MOODS[2];
  petTrack.dataset.mood = mood.key;
  petTrack.title = `${mood.label} (${pct}% selesai hari ini)`;
  petTrack.setAttribute("aria-label", petTrack.title);
}

async function refreshPetMood() {
  try {
    const stats = await api("/api/stats?date=" + iso(new Date()));
    applyPetMood(stats.total, stats.pct);
  } catch (e) { /* keep last known mood if the request fails */ }
}

// ===========================================================================
// BACKGROUND MUSIC — plays and loops the ambient track, persists on/off +
// volume across visits, and gracefully handles browsers that block autoplay
// until the user interacts with the page.
// ===========================================================================
const MUSIC_KEY = "ls_music_settings";
const bgMusic = $("#bgMusic");

function getMusicSettings() {
  try { return { enabled: true, volume: 35, ...JSON.parse(localStorage.getItem(MUSIC_KEY)) }; }
  catch (e) { return { enabled: true, volume: 35 }; }
}
function setMusicSettings(s) { try { localStorage.setItem(MUSIC_KEY, JSON.stringify(s)); } catch (e) { } }

function renderMusicUI() {
  const s = getMusicSettings();
  $("#musicSwitch").classList.toggle("on", s.enabled);
  $("#musicVolumeRow").classList.toggle("disabled", !s.enabled);
  $("#musicVolume").value = s.volume;
  if (bgMusic) bgMusic.volume = s.volume / 100;
  if (!s.enabled) $("#musicStatus").textContent = "Musik dimatikan.";
  else if (bgMusic && bgMusic.paused) $("#musicStatus").textContent = "Musik ambient santai — sentuh layar sekali untuk mulai memutar.";
  else $("#musicStatus").textContent = "Musik ambient santai, diputar terus selama kamu buka web ini.";
}

async function tryPlayMusic() {
  if (!bgMusic || !getMusicSettings().enabled) return;
  try { await bgMusic.play(); }
  catch (e) { /* autoplay blocked until user interacts — resumed below */ }
  renderMusicUI();
}

function pauseMusic() {
  if (bgMusic) bgMusic.pause();
  renderMusicUI();
}

$("#musicSwitch").onclick = () => {
  const s = getMusicSettings();
  const enabled = !s.enabled;
  setMusicSettings({ ...s, enabled });
  if (enabled) { toast("Musik dinyalakan.", "success"); tryPlayMusic(); }
  else { toast("Musik dimatikan."); pauseMusic(); }
  renderMusicUI();
};

$("#musicVolume").oninput = e => {
  const volume = +e.target.value;
  setMusicSettings({ ...getMusicSettings(), volume });
  if (bgMusic) bgMusic.volume = volume / 100;
};

// Most browsers block audio autoplay until the visitor interacts with the
// page — so try immediately, and also on the very first click/keypress.
tryPlayMusic();
const resumeMusicOnce = () => {
  tryPlayMusic();
  document.removeEventListener("click", resumeMusicOnce);
  document.removeEventListener("keydown", resumeMusicOnce);
};
document.addEventListener("click", resumeMusicOnce);
document.addEventListener("keydown", resumeMusicOnce);

renderMusicUI();

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
switchView("dashboard");
refreshPetMood();
setInterval(refreshPetMood, 60000);function refreshAuthUI() {
  const isGuest = !window.currentUser || window.currentUser.id != window.viewedUserId;
  if (isGuest) {
    $("#btnAdd").style.display = "none";
    $("#calUserSelect").style.pointerEvents = "auto";
  } else {
    $("#btnAdd").style.display = "";
  }
  
  if (isGuest) {
    if($("#btnEditDetail")) $("#btnEditDetail").style.display = "none";
    if($("#btnDeleteDetail")) $("#btnDeleteDetail").style.display = "none";
    if($("#dSubAddForm")) $("#dSubAddForm").style.display = "none";
  } else {
    if($("#btnEditDetail")) $("#btnEditDetail").style.display = "";
    if($("#btnDeleteDetail")) $("#btnDeleteDetail").style.display = "";
    if($("#dSubAddForm")) $("#dSubAddForm").style.display = "flex";
  }

  if (window.currentUser) {
    $("#btnAuth").textContent = window.currentUser.username;
    if($("#publicSwitch")) $("#publicSwitch").classList.toggle("on", window.currentUser.is_public);
    if($("#publicAccessWrap")) $("#publicAccessWrap").classList.remove("hide");
  } else {
    $("#btnAuth").textContent = "Login";
    if($("#publicAccessWrap")) $("#publicAccessWrap").classList.add("hide");
  }
}

async function initAuth() {
  const token = localStorage.getItem("ls_token");
  if (token) {
    try {
      const me = await api("/api/users/me");
      window.currentUser = me;
      window.viewedUserId = me.id;
    } catch(e) {
      localStorage.removeItem("ls_token");
    }
  }

  try {
    const users = await api("/api/users");
    window.allUsers = users;
    const sel = $("#calUserSelect");
    if(sel) {
      sel.innerHTML = `<option value="">-- Pilih Akun (None) --</option>` + users.map(u => `<option value="${u.id}">${u.username}</option>`).join("");
      if (window.currentUser) {
        if (!users.find(u => u.id === window.currentUser.id)) {
           sel.innerHTML += `<option value="${window.currentUser.id}">${window.currentUser.username} (Private)</option>`;
        }
        window.viewedUserId = window.currentUser.id;
        sel.value = window.currentUser.id;
      } else {
        window.viewedUserId = "";
        sel.value = "";
      }
      sel.classList.remove("hide");
    }
    
    updateUserCategories();
    
  } catch(e) {}

  refreshAuthUI();
  
  document.querySelectorAll(".nav").forEach(b => b.classList.remove("active"));
  const calNav = document.querySelector('.nav[data-v="calendar"]');
  if(calNav) calNav.classList.add("active");
  document.querySelectorAll(".view").forEach(v => v.classList.add("hide"));
  const calView = $("#calendar");
  if(calView) calView.classList.remove("hide");
  
  if (window.loadDashboard) {
    loadDashboard();
    renderCalendar();
    renderSchedule();
  }
}

if($("#btnAuth")) {
  $("#btnAuth").onclick = () => {
    if (window.currentUser) {
      $("#a_username").value = window.currentUser.username;
      $("#accountModal").classList.remove("hide");
      if(typeof renderManageCategories === 'function') renderManageCategories();
    } else {
      $("#loginModal").classList.remove("hide");
    }
  };
}
if($("#btnCloseLogin")) $("#btnCloseLogin").onclick = () => $("#loginModal").classList.add("hide");
if($("#btnCloseAccount")) $("#btnCloseAccount").onclick = () => $("#accountModal").classList.add("hide");

if($("#btnToggleRegister")) {
  $("#btnToggleRegister").onclick = () => {
    const isReg = $("#loginTitle").textContent === "Register";
    $("#loginTitle").textContent = isReg ? "Login" : "Register";
    $("#btnToggleRegister").textContent = isReg ? "Register Baru" : "Sudah punya akun? Login";
    $("#btnSubmitLogin").textContent = isReg ? "Login" : "Daftar";
  };
}

if($("#loginForm")) {
  $("#loginForm").onsubmit = async (e) => {
    e.preventDefault();
    const isReg = $("#loginTitle").textContent === "Register";
    const url = isReg ? "/api/register" : "/api/login";
    try {
      const res = await api(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: $("#l_username").value, password: $("#l_password").value })
      });
      localStorage.setItem("ls_token", res.token);
      window.currentUser = res;
      window.viewedUserId = res.id;
      $("#loginModal").classList.add("hide");
      toast("Berhasil login", "success");
      initAuth();
    } catch(e) {
      toast(e.message, "error");
    }
  };
}

if($("#accountForm")) {
  $("#accountForm").onsubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await api("/api/users/me/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: $("#a_username").value, password: $("#a_password").value || undefined })
      });
      localStorage.setItem("ls_token", res.token);
      window.currentUser.username = res.username;
      $("#accountModal").classList.add("hide");
      toast("Profil diperbarui", "success");
      refreshAuthUI();
    } catch(e) {
      toast(e.message, "error");
    }
  };
}

if($("#btnLogout")) {
  $("#btnLogout").onclick = () => {
    localStorage.removeItem("ls_token");
    window.currentUser = null;
    $("#accountModal").classList.add("hide");
    toast("Logout berhasil", "success");
    initAuth();
  };
}

if($("#publicSwitch")) {
  $("#publicSwitch").onclick = async () => {
    const isOn = $("#publicSwitch").classList.contains("on");
    const next = !isOn;
    try {
      await api("/api/users/me/public", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_public: next })
      });
      $("#publicSwitch").classList.toggle("on", next);
      window.currentUser.is_public = next;
      toast("Privasi diperbarui", "success");
    } catch(e) {
      toast(e.message, "error");
    }
  };
}

if($("#calUserSelect")) {
  $("#calUserSelect").onchange = (e) => {
    window.viewedUserId = e.target.value;
    updateUserCategories();
    refreshAuthUI();
    loadDashboard();
    renderCalendar();
    renderSchedule();
  };
}

setTimeout(initAuth, 100);

function updateUserCategories() {
  CATS = { ...DEFAULT_CATS }
function renderManageCategories() {
  const list = document.querySelector('#catManageList');
  if(!list) return;
  list.innerHTML = Object.keys(CATS).map(c => `
<div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-hover); padding:6px 10px; border-radius:6px; margin-bottom:4px;">
<span class="cat-chip" style="--cat:${catColor(c)}">${esc(c)}</span>
<button type="button" class="x-btn" onclick="deleteCategory('${esc(c)}')" style="background:none; border:none; cursor:pointer;"><svg class="icon icon-sm"><use href="#ic-trash"/></svg></button>
</div>`
  ).join('');
}
window.deleteCategory = async (c) => {
  if(!confirm('Hapus kategori ' + c + '?')) return;
  delete CATS[c];
  await saveCategories();
};
if(document.querySelector('#btnAddCat')) {
  document.querySelector('#btnAddCat').onclick = async () => {
    const name = document.querySelector('#newCatName').value.trim();
    const color = document.querySelector('#newCatColor').value;
    if(!name) return;
    CATS[name] = color;
    document.querySelector('#newCatName').value = '';
    await saveCategories();
  };
}
async function saveCategories() {
  if(!window.currentUser) return;
  try {
    const catsStr = JSON.stringify(CATS);
    await api('/api/users/me/categories', {
      method: 'PUT', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ categories: catsStr })
    });
    window.currentUser.categories = catsStr;
    updateUserCategories();
    renderManageCategories();
    
    // Also update the Add Form options
    const catGrid = document.querySelector('#catGrid');
    if(catGrid) {
      const selected = catGrid.querySelector('.cat-opt.on')?.dataset.cat;
      catGrid.innerHTML = Object.keys(CATS).map(c => `<div class="cat-opt" data-cat="${esc(c)}" style="--cat:${catColor(c)}">${esc(c)}</div>`).join('');
      catGrid.querySelectorAll('.cat-opt').forEach(el => {
        if(el.dataset.cat === selected) el.classList.add('on');
        el.onclick = () => {
          catGrid.querySelectorAll('.cat-opt').forEach(x => x.classList.remove('on'));
          el.classList.add('on');
        };
      });
    }
  } catch(e) { toast(e.message, 'error'); }
}
