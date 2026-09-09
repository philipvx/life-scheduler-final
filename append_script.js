const fs = require('fs');
const code = `
function renderManageCategories() {
  const list = document.querySelector('#catManageList');
  if(!list) return;
  list.innerHTML = Object.keys(CATS).map(c => \`
<div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-hover); padding:6px 10px; border-radius:6px; margin-bottom:4px;">
<span class="cat-chip" style="--cat:\${catColor(c)}">\${esc(c)}</span>
<button type="button" class="x-btn" onclick="deleteCategory('\${esc(c)}')" style="background:none; border:none; cursor:pointer;"><svg class="icon icon-sm"><use href="#ic-trash"/></svg></button>
</div>\`
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
      catGrid.innerHTML = Object.keys(CATS).map(c => \`<div class="cat-opt" data-cat="\${esc(c)}" style="--cat:\${catColor(c)}">\${esc(c)}</div>\`).join('');
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
`;
fs.appendFileSync('public/app.js', code);
