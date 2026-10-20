/* Shared core for the single-problem packs: licence gate, encrypted content,
   saving in this browser, editable tables, backup and restore.
   Each pack page sets window.PACK before loading this file and then calls Pack.start(). */
(function(){
const LICENCE_URL = 'https://wispy-bonus-8272.casunilkumarfca.workers.dev';
const P = window.PACK;

const store = {
  get(k){ try{ return JSON.parse(localStorage.getItem(k)); }catch(e){ return null; } },
  set(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); return true; }catch(e){ return false; } },
  del(k){ try{ localStorage.removeItem(k); }catch(e){} }
};
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const b64d = s => Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
const num = v => { const n = parseFloat(String(v ?? '').replace(/,/g,'')); return isFinite(n) ? n : null; };
const inr = v => (typeof v === 'number' && isFinite(v)) ? '₹' + Math.round(v).toLocaleString('en-IN') : '—';
const pct = (v, d=1) => (typeof v === 'number' && isFinite(v)) ? (v*100).toFixed(d) + '%' : '—';
const dec = (v, d=1) => (typeof v === 'number' && isFinite(v)) ? v.toFixed(d) : '—';
const fmtDate = s => { if (!s) return '—'; const d = new Date(s); return isNaN(d) ? '—' : d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}); };
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
const today = () => new Date().toISOString().slice(0,10);
const st = s => s ? `<span class="st ${String(s).replace(/[^A-Za-z]/g,'')}">${esc(s)}</span>` : '<span class="muted">—</span>';

let LIC = store.get(P.licKey);
let D = Object.assign(P.blank(), store.get(P.dataKey) || {});
let C = null;
let saveWarned = false;
function save(){ if (!store.set(P.dataKey, D) && !saveWarned){ saveWarned = true; banner('This browser is not letting the page save your work. Use "Your data" → "Download a backup" before you close the page.'); } }
function banner(msg){ const b = document.createElement('div'); b.className = 'banner'; b.textContent = msg; $('#view').prepend(b); }

async function decryptContent(keyB64){
  const res = await fetch('content.enc.json', {cache:'no-cache'});
  if (!res.ok) throw new Error('content');
  const enc = await res.json();
  const key = await crypto.subtle.importKey('raw', b64d(keyB64), 'AES-GCM', false, ['decrypt']);
  const pt = await crypto.subtle.decrypt({name:'AES-GCM', iv:b64d(enc.iv)}, key, b64d(enc.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}
function deviceId(){ let d = store.get('pack-device'); if (!d){ d = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)); store.set('pack-device', d); } return d; }
async function callLicence(path, body){
  const r = await fetch(LICENCE_URL + path, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(Object.assign({tool: P.tool}, body))});
  return r.json();
}
async function boot(){
  const m = location.hash.match(/access=([A-Za-z0-9_\-]+)/);
  if (m){ LIC = {mode:'reviewer', k:m[1], licensee:'Reviewer access', ref:'Reviewer', exp:null}; history.replaceState(null, '', location.pathname); }
  if (!LIC || !LIC.k) return showGate();
  if (LIC.mode === 'licence' && navigator.onLine && (!LIC.checked || Date.now() - LIC.checked > 7*864e5)){
    try{
      const r = await callLicence('/check', {key: LIC.key, device: deviceId()});
      if (!r.ok){ store.del(P.licKey); LIC = null; return showGate(r.message || 'Your licence could not be confirmed.'); }
      Object.assign(LIC, {k:r.k, exp:r.exp, licensee:r.licensee, ref:r.ref, checked:Date.now()});
    }catch(e){ /* offline: keep working with the stored licence */ }
  }
  if (LIC.exp && Date.now() > Date.parse(LIC.exp)){
    const old = LIC; store.del(P.licKey); LIC = null;
    return showGate('Your 12-month licence ended on ' + fmtDate(old.exp) + '. Buy a new licence to keep using it; your saved work is still here.');
  }
  try{ C = await decryptContent(LIC.k); }
  catch(e){ store.del(P.licKey); LIC = null; return showGate('This access link or key is no longer valid. Please write to sunil@sunilkumarfca.com.'); }
  store.set(P.licKey, LIC);
  $('#tabs').classList.remove('hidden');
  go(P.firstTab(D));
}
function showGate(msg){
  $('#tabs').classList.add('hidden');
  $('#view').innerHTML = `
  <div class="gate card">
    <h1>Open your ${esc(P.short)}</h1>
    <p class="muted">Enter the licence key from your Gumroad receipt. One licence covers one organisation for 12 months, on up to 3 devices.</p>
    <label class="f" for="lk">Licence key</label>
    <input type="text" id="lk" autocomplete="off" placeholder="XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX">
    <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;">
      <button class="btn" id="lkgo">Open</button>
      <a class="btn secondary" href="${P.buyUrl}">Buy a licence</a>
    </div>
    <div class="err" id="lkerr">${esc(msg || '')}</div>
    <p class="small muted" style="margin-top:18px;">Lost your key? It is in your Gumroad purchase email and in your Gumroad library. Questions about the pack: <a href="mailto:sunil@sunilkumarfca.com">sunil@sunilkumarfca.com</a></p>
  </div>`;
  $('#lkgo').onclick = activate;
  $('#lk').onkeydown = e => { if (e.key === 'Enter') activate(); };
}
async function activate(){
  const key = $('#lk').value.trim(); const err = $('#lkerr');
  if (!key){ err.textContent = 'Please enter your licence key.'; return; }
  $('#lkgo').disabled = true; err.textContent = 'Checking…';
  try{
    const r = await callLicence('/activate', {key, device: deviceId()});
    if (!r.ok){ err.textContent = r.message || 'This key could not be confirmed.'; $('#lkgo').disabled = false; return; }
    LIC = {mode:'licence', key, k:r.k, exp:r.exp, licensee:r.licensee, ref:r.ref, checked:Date.now()};
    store.set(P.licKey, LIC);
    if (r.licensee && !D.org){ D.org = r.licensee; save(); }
    boot();
  }catch(e){ err.textContent = 'Could not reach the licence check. Please check your connection and try again.'; $('#lkgo').disabled = false; }
}
function licenceLine(){
  if (!LIC) return '';
  if (LIC.mode === 'reviewer') return 'Reviewer access';
  return 'Licensed to ' + (LIC.licensee || D.org || 'your organisation') + ' · Licence ' + (LIC.ref || '') + (LIC.exp ? ' · valid until ' + fmtDate(LIC.exp) : '');
}

/* ---------- Tabs ---------- */
let current = null;
function go(tab){
  current = tab;
  document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-current', b.dataset.tab === tab ? 'true' : 'false'));
  if (tab === 'data') vData(); else P.views[tab]();
  window.scrollTo(0, 0);
}
function rerender(){ if (current) go(current); }

/* ---------- Editable tables ----------
   cols: {k, label, type:'text'|'number'|'date'|'select', opts, calc:(row)=>html, w} */
function tableEditor(el, name, cols, opts = {}){
  if (!Array.isArray(D[name])) D[name] = [];
  const rows = D[name];
  const draw = () => {
    el.innerHTML = `<div class="tablewrap"><table class="edit"><thead><tr>${cols.map(c => `<th class="${c.type==='number'||c.calc?'num':''}" style="${c.w?'min-width:'+c.w+'px':''}">${esc(c.label)}</th>`).join('')}<th></th></tr></thead>
      <tbody>${rows.map((r, i) => `<tr>${cols.map(c => {
        if (c.calc) return `<td class="calc num">${c.calc(r)}</td>`;
        const v = r[c.k] ?? '';
        if (c.type === 'select') return `<td><select data-i="${i}" data-k="${c.k}"><option value=""></option>${c.opts.map(o => `<option${o===v?' selected':''}>${esc(o)}</option>`).join('')}</select></td>`;
        return `<td><input type="${c.type==='date'?'date':c.type==='number'?'number':'text'}" ${c.type==='number'?'step="any" inputmode="decimal"':''} data-i="${i}" data-k="${c.k}" value="${esc(v)}" aria-label="${esc(c.label)}"></td>`;
      }).join('')}<td><button class="del" data-del="${i}" title="Remove row" aria-label="Remove row">×</button></td></tr>`).join('')}
      ${opts.totals ? `<tr>${cols.map((c, ci) => `<td class="num"><b>${ci===0?'Total':(opts.totals[c.k] ? opts.totals[c.k](rows) : '')}</b></td>`).join('')}<td></td></tr>` : ''}
      </tbody></table></div>
      <button class="btn secondary small noprint" style="margin-top:10px;" data-add>+ Add a row</button>`;
    el.querySelectorAll('input,select').forEach(inp => {
      const upd = () => { rows[+inp.dataset.i][inp.dataset.k] = inp.value; save(); };
      inp.oninput = upd;
      inp.onchange = () => { upd(); if (opts.onChange) opts.onChange();
        // Redraw for calculated cells and totals, keeping focus where the user moved to.
        setTimeout(() => { const a = document.activeElement; const ai = a && a.dataset ? a.dataset.i : null, ak = a && a.dataset ? a.dataset.k : null;
          draw(); if (ai != null && el.contains(a) === false){ const t = el.querySelector(`[data-i="${ai}"][data-k="${ak}"]`); if (t) t.focus(); } }, 0); };
    });
    el.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { if (confirmRemove(rows[+b.dataset.del])){ rows.splice(+b.dataset.del, 1); save(); draw(); if (opts.onChange) opts.onChange(); } });
    el.querySelector('[data-add]').onclick = () => { rows.push({}); save(); draw(); const last = el.querySelectorAll('tbody tr'); const r = last[rows.length-1]; if (r){ const f = r.querySelector('input,select'); if (f) f.focus(); } };
  };
  if (!rows.length) for (let i = 0; i < (opts.startRows || 3); i++) rows.push({});
  draw();
}
function confirmRemove(row){ return !Object.values(row || {}).some(v => String(v).trim()) || window.confirm('Remove this row?'); }

/* ---------- Your data ---------- */
function download(name, text, type){
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type})); a.download = name; document.body.appendChild(a); a.click(); a.remove();
}
function csv(rows){ return rows.map(r => r.map(c => '"' + String(c ?? '').replace(/"/g,'""') + '"').join(',')).join('\r\n'); }
function vData(){
  $('#view').innerHTML = `
  <div class="card">
    <h1>Your data</h1>
    <p>Everything you enter is kept only in this browser on this device. We cannot see it and cannot recover it for you.</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;">
      <button class="btn" id="bk">Download a backup</button>
      <label class="btn secondary" for="restore" style="cursor:pointer;">Load a backup</label><input type="file" id="restore" accept=".json,application/json" class="hidden">
      ${P.exports ? P.exports.map((x, i) => `<button class="btn secondary" data-exp="${i}">${esc(x.label)}</button>`).join('') : ''}
    </div>
    <p class="small muted" style="margin-top:10px;">Use a backup to move to another computer (up to 3 devices per licence), to share the file with a colleague in your organisation, or to keep a copy before clearing your browser.</p>
    <div class="err" id="rmsg"></div>
  </div>
  <div class="card">
    <h3>Start again</h3>
    <p class="small muted">Clears everything you have entered on this device. Download a backup first if you may need it.</p>
    <button class="btn secondary" id="clr">Clear all my entries</button>
  </div>
  <p class="small muted">${esc(licenceLine())}</p>`;
  $('#bk').onclick = () => download(P.slug + '-backup-' + today() + '.json', JSON.stringify({format: P.slug + '-backup', v: 1, data: D}, null, 1), 'application/json');
  $('#restore').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try{ const j = JSON.parse(await f.text()); if (j.format !== P.slug + '-backup') throw 0; D = Object.assign(P.blank(), j.data); save(); $('#rmsg').className = 'muted'; $('#rmsg').textContent = 'Backup loaded.'; }
    catch(err){ $('#rmsg').className = 'err'; $('#rmsg').textContent = 'That file is not a backup from this pack.'; }
  };
  document.querySelectorAll('[data-exp]').forEach(b => b.onclick = () => { const x = P.exports[+b.dataset.exp]; download(x.file, csv(x.rows()), 'text/csv'); });
  $('#clr').onclick = () => { if (window.confirm('Clear all your entries on this device?')){ D = P.blank(); save(); go(P.firstTab(D)); } };
}

window.Pack = {
  start(){ document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => go(b.dataset.tab)); boot(); },
  get D(){ return D; }, get C(){ return C; }, save, go, rerender, tableEditor, licenceLine,
  $, esc, num, inr, pct, dec, fmtDate, daysBetween, today, st, download, csv
};
})();
