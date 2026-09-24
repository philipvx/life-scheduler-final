const fs = require('fs');
let c = fs.readFileSync('public/app.js', 'utf8');

// Replace schedule render section (lines 358-405)
const oldBlock = `  $(\"#dayCards\").innerHTML = days.map(d => {
    const ds = iso(d);
    const items = rows.filter(x => x.occurrence_date === ds).sort((a, b) => a.start_time.localeCompare(b.start_time));
    const isToday = sameDate(d, today);
    return \`<div class="day-card \${isToday ? "is-today" : ""}">
      <div class="day-card-head">
        <div class="dch-left">
          <b>\${d.toLocaleDateString("id-ID", { weekday: "long" })}</b>
          <span>\${d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</span>
        </div>
        <span class="dch-badge">\${items.length} aktivitas</span>
      </div>
      <div class="day-card-body">
        \${items.length ? items.map(x => \`
          <div class="sched-row \${x.completed ? "is-done" : ""}" style="--cat:\${catColor(x.category)}" data-id="\${x.id}" data-occ="\${x.occurrence_date}">
            <div class="sched-time">\${x.start_time}–\${x.end_time}</div>
            <div class="sched-dot"></div>
            <div class="sched-main">
              <div class="sched-title">\${esc(x.title)}\${subBadge(x)}</div>
              <div class="sched-sub">\${esc(x.category)} · \${PRI_LABEL[x.priority]}</div>
            </div>
            <div class="sched-actions">
              \${x.completed ? "" : \`<button class="icon-btn" data-act="focus" title="Mulai fokus"><svg class="icon icon-sm"><use href="#ic-timer"/></svg></button>\`}
              <button class="icon-btn check \${x.completed ? "on" : ""}" data-act="toggle" title="Selesai"><svg class="icon icon-sm"><use href="#ic-check"/></svg></button>
              <button class="icon-btn" data-act="edit" title="Edit"><svg class="icon icon-sm"><use href="#ic-pencil"/></svg></button>
              <button class="icon-btn danger" data-act="del" title="Hapus"><svg class="icon icon-sm"><use href="#ic-trash"/></svg></button>
            </div>
          </div>\`).join("") : \`<div class="day-empty">Tidak ada aktivitas.</div>\`}
      </div>
    </div>\`;
  }).join("");

  $(\"#dayCards\").querySelectorAll(".sched-row").forEach(row => {
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
  });`;

const newBlock = `  const isOwner = window.currentUser && window.currentUser.id == window.viewedUserId;
  $(\"#dayCards\").innerHTML = days.map(d => {
    const ds = iso(d);
    const items = rows.filter(x => x.occurrence_date === ds).sort((a, b) => a.start_time.localeCompare(b.start_time));
    const isToday = sameDate(d, today);
    const isPast = isPastDate(ds);
    return \`<div class="day-card \${isToday ? "is-today" : ""} \${isPast ? "is-past" : ""}">
      <div class="day-card-head">
        <div class="dch-left">
          <b>\${d.toLocaleDateString("id-ID", { weekday: "long" })}</b>
          <span>\${d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</span>
        </div>
        <div style="display:flex;gap:6px;align-items:center;">
          \${isPast ? \`<span class="past-lock-badge">🔒 Terkunci</span>\` : ""}
          <span class="dch-badge">\${items.length} aktivitas</span>
        </div>
      </div>
      <div class="day-card-body">
        \${items.length ? items.map(x => \`
          <div class="sched-row \${x.completed ? "is-done" : ""} \${isPast ? "is-past-row" : ""}" style="--cat:\${catColor(x.category)}" data-id="\${x.id}" data-occ="\${x.occurrence_date}">
            <div class="sched-time">\${x.start_time}–\${x.end_time}</div>
            <div class="sched-dot"></div>
            <div class="sched-main">
              <div class="sched-title">\${esc(x.title)}\${subBadge(x)}</div>
              <div class="sched-sub">\${esc(x.category)} · \${PRI_LABEL[x.priority]}</div>
            </div>
            <div class="sched-actions">
              \${!isPast && isOwner && !x.completed ? \`<button class="icon-btn" data-act="focus" title="Mulai fokus"><svg class="icon icon-sm"><use href="#ic-timer"/></svg></button>\` : ""}
              \${isOwner ? \`<button class="icon-btn check \${x.completed ? "on" : ""}" data-act="toggle" title="\${x.completed ? "Batalkan selesai" : "Tandai selesai"}"><svg class="icon icon-sm"><use href="#ic-check"/></svg></button>\` : ""}
              \${!isPast && isOwner ? \`<button class="icon-btn" data-act="edit" title="Edit"><svg class="icon icon-sm"><use href="#ic-pencil"/></svg></button>
              <button class="icon-btn danger" data-act="del" title="Hapus"><svg class="icon icon-sm"><use href="#ic-trash"/></svg></button>\` : ""}
            </div>
          </div>\`).join("") : \`<div class="day-empty">Tidak ada aktivitas.</div>\`}
      </div>
    </div>\`;
  }).join("");

  $(\"#dayCards\").querySelectorAll(".sched-row").forEach(row => {
    const id = row.dataset.id, occ = row.dataset.occ;
    const toggleBtn = row.querySelector('[data-act="toggle"]');
    const editBtn = row.querySelector('[data-act="edit"]');
    const delBtn = row.querySelector('[data-act="del"]');
    const focusBtn = row.querySelector('[data-act="focus"]');
    if (toggleBtn) toggleBtn.onclick = e => { e.stopPropagation(); toggleActivity(id, occ); };
    if (editBtn) editBtn.onclick = e => { e.stopPropagation(); openForm(id); };
    if (delBtn) delBtn.onclick = e => { e.stopPropagation(); deleteActivity(id); };
    if (focusBtn) focusBtn.onclick = e => {
      e.stopPropagation();
      const item = rows.find(x => String(x.id) === id && x.occurrence_date === occ);
      if (item) openFocusSetup({ ...item, date: item.occurrence_date });
    };
    row.onclick = () => {
      const item = rows.find(x => String(x.id) === id && x.occurrence_date === occ);
      if (item) openDetail({ ...item, date: item.occurrence_date });
    };
  });`;

if (c.includes(oldBlock)) {
  c = c.replace(oldBlock, newBlock);
  fs.writeFileSync('public/app.js', c);
  console.log('SUCCESS: Schedule block replaced');
} else {
  console.log('ERROR: Block not found');
  // Show first 200 chars of what we're looking for vs what's in file
  const startStr = '$(\"#dayCards\").innerHTML = days.map';
  const fileIdx = c.indexOf(startStr);
  console.log('Looking for start at:', fileIdx);
  if (fileIdx >= 0) {
    console.log('File content at that point (200 chars):\n', JSON.stringify(c.slice(fileIdx, fileIdx + 200)));
  }
}
