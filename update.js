// Dipanggil oleh GitHub Actions saat Power Automate mengirim event "tm-survey".
// client_payload.rows = array baris Excel (objek). Baris digabung berdasarkan Id.
const fs = require('fs');
const ev = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
const p = ev.client_payload || {};
let inc = p.rows || (p.row ? [p.row] : []);
if (typeof inc === 'string') inc = JSON.parse(inc);
if (!Array.isArray(inc)) inc = [inc];
// Respons langsung dari Microsoft Forms (flow "TM Survey Forms -> GitHub")
if (p.form) {
  const nm = s => String(s || '').replace(/_x[0-9a-f]{4}_/gi, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const qmap = fs.existsSync('qmap.json') ? JSON.parse(fs.readFileSync('qmap.json', 'utf8')) : {};
  const f = typeof p.form === 'string' ? JSON.parse(p.form) : p.form;
  const H0 = fs.existsSync('data.json') ? JSON.parse(fs.readFileSync('data.json', 'utf8')).H : [];
  const o = { Id: String(p.id ?? f.responseId ?? ''), 'Completion time': f.submitDate || '', Email: 'anonymous' };
  for (const [k, v] of Object.entries(f)) {
    const t = qmap[k]; if (!t) continue;
    const n = nm(t); const key = H0.find(h => nm(h) === n) || (n.length > 20 && H0.find(h => nm(h).startsWith(n))) || t;
    o[key] = Array.isArray(v) ? v.join('; ') : v;
  }
  if (o.Id) inc = inc.concat([o]); else console.log('Respons Forms tanpa Id, dilewati');
}
const drop = /^(@odata|ItemInternalId$|Email$|Name$)/i;
let db = fs.existsSync('data.json') ? JSON.parse(fs.readFileSync('data.json', 'utf8')) : null;
if (!db) {
  // Pertama kali: ambil data awal dari TM_Survey_Data.js yang di-upload manual
  db = { H: [], R: [] };
  if (fs.existsSync('TM_Survey_Data.js')) {
    const w = {}; new Function('window', fs.readFileSync('TM_Survey_Data.js', 'utf8'))(w);
    if (Array.isArray(w.TM_DATA)) inc = w.TM_DATA.concat(inc);
  }
}
if (p.reset) { db.H = []; db.R = []; }
const before = JSON.stringify(db);
for (const o of inc) {
  if (!o || typeof o !== 'object') continue;
  for (const k of Object.keys(o)) if (!drop.test(k) && !db.H.includes(k)) { db.H.push(k); db.R.forEach(r => r.push('')); }
  const id = String(o.Id ?? '');
  const iId = db.H.indexOf('Id');
  const i = id && iId >= 0 ? db.R.findIndex(r => String(r[iId]) === id) : -1;
  const row = db.H.map((k, j) => (o[k] == null ? (i >= 0 ? db.R[i][j] : '') : String(o[k])));
  if (i >= 0) db.R[i] = row; else db.R.push(row);
}
const iId = db.H.indexOf('Id');
if (iId >= 0) db.R.sort((a, b) => Number(a[iId]) - Number(b[iId]));
if (JSON.stringify(db) === before && !p.reset) { console.log('Tidak ada perubahan'); process.exit(0); }
fs.writeFileSync('data.json', JSON.stringify(db));
const objs = db.R.map(r => Object.fromEntries(db.H.map((k, j) => [k, r[j]])));
fs.writeFileSync('TM_Survey_Data.js',
  'window.TM_DATA_TIME=' + JSON.stringify(new Date().toISOString()) + ';window.TM_DATA=' + JSON.stringify(objs) + ';\n');
console.log('Total baris:', db.R.length, '| masuk:', inc.length);
