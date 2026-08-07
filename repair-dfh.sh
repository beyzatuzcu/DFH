#!/usr/bin/env bash
set -euo pipefail

echo "DFH repair başlıyor..."
mkdir -p public data scripts

cat > package.json <<'__DFH_EOF__'
{
  "name": "digital-fraud-hub-fixed",
  "version": "2.0.0",
  "private": true,
  "description": "Digital Fraud early warning MVP - Node 16+ compatible",
  "engines": { "node": ">=16" },
  "scripts": {
    "dev": "node server.js",
    "start": "node server.js",
    "build": "node scripts/check.js",
    "check": "node scripts/check.js"
  },
  "dependencies": {}
}
__DFH_EOF__

cat > server.js <<'__DFH_EOF__'
const http = require('http');
const fs = require('fs').promises;
const path = require('path');

const root = __dirname;
const dbFile = path.join(root, 'data', 'db.json');
const htmlFile = path.join(root, 'public', 'index.html');
const PORT = Number(process.env.PORT || 3000);

const keywords = [
  ['Alkol şüphesi',35,['alkollü','alkol','promil']],
  ['Olay yerinden kaçma',30,['olay yerinden kaç','kaçtı','kaçan sürücü']],
  ['Ölümlü kaza',30,['hayatını kaybetti','ölümlü','vefat']],
  ['Ağır hasar',20,['ağır hasarlı','hurdaya','kullanılamaz hale']],
  ['Yaralanmalı kaza',10,['yaralandı','yaralı']],
  ['Takla / savrulma',10,['takla attı','savruldu']],
  ['Gece olayı',5,['gece saatlerinde','gece yarısı']],
];

const normalizePlate = (v='') => v.toLocaleUpperCase('tr-TR').replace(/[^0-9A-ZÇĞİÖŞÜ]/g,'');
function extractPlates(text){
  const upper = text.toLocaleUpperCase('tr-TR');
  const re = /\b(0[1-9]|[1-7][0-9]|8[01])\s*[-.]?\s*([A-ZÇĞİÖŞÜ]{1,3})\s*[-.]?\s*(\d{2,4})\b/g;
  const out = new Set(); let m;
  while((m=re.exec(upper))!==null) out.add(`${m[1]} ${m[2]} ${m[3]}`);
  return [...out];
}
function detectKeywords(text){
  const l = text.toLocaleLowerCase('tr-TR');
  return keywords.filter(k=>k[2].some(t=>l.includes(t))).map(k=>k[0]);
}
function riskLevel(score){return score>=80?'CRITICAL':score>=60?'HIGH':score>=35?'MEDIUM':'LOW';}
async function readDB(){return JSON.parse(await fs.readFile(dbFile,'utf8'));}
async function writeDB(db){await fs.writeFile(dbFile,JSON.stringify(db,null,2));}
function alertsFor(news,db){
  const txt=`${news.title} ${news.content}`.toLocaleLowerCase('tr-TR');
  return news.detectedPlates.map(plate=>{
    const n=normalizePlate(plate);
    const policy=db.policies.find(p=>normalizePlate(p.plate)===n&&p.status==='ACTIVE');
    const claim=db.claims.find(c=>normalizePlate(c.plate)===n);
    let score=0; const reasons=[];
    for(const [label,pts,terms] of keywords){if(terms.some(t=>txt.includes(t))){score+=pts;reasons.push(label);}}
    if(policy){score+=25;reasons.push('Aktif TKS poliçesi ile eşleşti');}
    if(claim){score+=15;reasons.push('Hasar dosyası ile eşleşti');}
    if(policy&&!claim){score+=10;reasons.push('Henüz hasar ihbarı yok – erken uyarı');}
    score=Math.min(100,score);
    return {
      id:`ALT-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
      newsId:news.id,plate,score,level:riskLevel(score),
      reasons:reasons.length?reasons:['Plaka haber kaynağında tespit edildi'],
      policyNo:policy&&policy.policyNo, claimNo:claim&&claim.claimNo,
      status:'NEW', createdAt:new Date().toISOString()
    };
  });
}
async function addNews(input){
  const db=await readDB();
  const text=`${input.title} ${input.content}`;
  const item={...input,id:`NEWS-${Date.now()}`,detectedPlates:extractPlates(text),keywords:detectKeywords(text),createdAt:new Date().toISOString()};
  db.news.unshift(item);
  const alerts=alertsFor(item,db);
  db.alerts.unshift(...alerts);
  await writeDB(db);
  return {item,alerts};
}
function send(res,status,data,type='application/json; charset=utf-8'){
  res.writeHead(status,{'content-type':type,'cache-control':'no-store','access-control-allow-origin':'*'});
  res.end(type.startsWith('application/json')?JSON.stringify(data):data);
}
async function body(req){let s=''; for await(const c of req)s+=c; return s?JSON.parse(s):{};}
const samples=[
  {title:'Bartın’da alkollü sürücü kazaya karıştı',source:'Bartın Gündem • Demo',content:'Gece saatlerinde 74 ABC 741 plakalı otomobil kontrolden çıkarak bariyerlere çarptı. Sürücünün alkollü olduğu ve aracın ağır hasarlı hale geldiği belirtildi.'},
  {title:'Ankara’da araç takla attı: sürücü yaralandı',source:'Yerel Haber • Demo',content:'06 FRD 61 plakalı araç gece yarısı savrularak takla attı. Kazada sürücü yaralandı, ekipler olay yerine sevk edildi.'},
  {title:'İstanbul’da olay yerinden kaçan sürücü aranıyor',source:'Şehir Haber • Demo',content:'34 TKS 2026 plakalı aracın karıştığı kazanın ardından sürücünün olay yerinden kaçtığı iddia edildi. Araçta maddi hasar meydana geldi.'}
];

const server=http.createServer(async(req,res)=>{
  try{
    if(req.method==='OPTIONS'){res.writeHead(204,{'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,PATCH,OPTIONS','access-control-allow-headers':'content-type'});return res.end();}
    const u=new URL(req.url,`http://${req.headers.host}`);
    if(req.method==='GET'&&u.pathname==='/') return send(res,200,await fs.readFile(htmlFile,'utf8'),'text/html; charset=utf-8');
    if(req.method==='GET'&&u.pathname==='/health') return send(res,200,{ok:true,node:process.version,service:'Digital Fraud Hub'});
    if(req.method==='GET'&&u.pathname==='/api/state') return send(res,200,await readDB());
    if(req.method==='POST'&&u.pathname==='/api/demo'){
      const s=samples[Math.floor(Math.random()*samples.length)];
      return send(res,200,await addNews({...s,publishedAt:new Date().toISOString(),url:'https://example.com/demo'}));
    }
    if(req.method==='POST'&&u.pathname==='/api/news'){
      const b=await body(req);
      if(!b.title||!b.source||!b.content) return send(res,400,{error:'Başlık, kaynak ve metin zorunludur.'});
      return send(res,200,await addNews({...b,publishedAt:b.publishedAt||new Date().toISOString()}));
    }
    if(req.method==='PATCH'&&u.pathname==='/api/alerts'){
      const b=await body(req); const db=await readDB(); const a=db.alerts.find(x=>x.id===b.id);
      if(!a) return send(res,404,{error:'Uyarı bulunamadı'});
      if(!['NEW','REVIEWING','CLOSED'].includes(b.status)) return send(res,400,{error:'Geçersiz durum'});
      a.status=b.status; await writeDB(db); return send(res,200,{ok:true});
    }
    return send(res,404,{error:'Not found'});
  } catch(e){console.error(e); return send(res,500,{error:e.message||'Server error'});}
});

server.listen(PORT,'0.0.0.0',()=>{
  console.log('');
  console.log('Digital Fraud Hub çalışıyor.');
  console.log(`Local: http://localhost:${PORT}`);
  console.log('Codespaces kullanıyorsan PORTS sekmesinden 3000 portunu Open in Browser ile aç.');
  console.log('');
});
__DFH_EOF__

cat > public/index.html <<'__DFH_EOF__'
<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Digital Fraud Hub</title><style>
:root{--bg:#f5f7fb;--panel:#fff;--text:#172033;--muted:#64748b;--line:#e5eaf2;--nav:#101827;--accent:#0f766e}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif}.shell{display:grid;grid-template-columns:240px 1fr;min-height:100vh}.side{background:#101827;color:#fff;padding:26px 18px}.brand{display:flex;gap:10px;align-items:center;margin-bottom:30px}.mark{width:42px;height:42px;display:grid;place-items:center;background:#0f766e;border-radius:12px;font-weight:900}.side button{width:100%;text-align:left;margin:3px 0;background:transparent;color:#dbe4ef;padding:11px;border:0;border-radius:9px;font-weight:700}.side button:hover,.side button.active{background:#1d293a}.main{padding:28px 32px}.top h1{margin:5px 0 8px;font-size:28px}.top p{margin:0;color:var(--muted)}.k{font-size:10px;letter-spacing:.13em;color:#789;font-weight:900}.demo{margin:20px 0;background:#ecfeff;border:1px solid #bae6fd;padding:13px 15px;border-radius:13px;display:flex;align-items:center;justify-content:space-between}.btn{background:#0f766e;color:#fff;border:0;border-radius:9px;padding:10px 13px;font-weight:800;cursor:pointer}.stats{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin:16px 0}.stat,.panel{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px}.stat span{font-size:12px;color:var(--muted)}.stat b{display:block;font-size:26px;margin-top:4px}.panel{margin-top:14px}.panel h3{margin:4px 0 12px}.table{width:100%;border-collapse:collapse;font-size:13px}.table th,.table td{padding:10px;border-bottom:1px solid #edf1f6;text-align:left;vertical-align:top}.table th{font-size:10px;color:#718096;text-transform:uppercase}.badge{padding:4px 7px;border-radius:999px;font-size:10px;font-weight:900;background:#eef2f7}.CRITICAL{background:#fee2e2;color:#991b1b}.HIGH{background:#ffedd5;color:#9a3412}.MEDIUM{background:#fef3c7;color:#92400e}.LOW{background:#dcfce7;color:#166534}.plate{background:#101827;color:#fff;padding:4px 7px;border-radius:6px;font-family:monospace;font-weight:900}.reason{display:inline-block;background:#f1f5f9;color:#536176;padding:3px 5px;border-radius:5px;font-size:10px;margin:2px}.form{display:grid;gap:10px;max-width:750px}.form input,.form textarea{border:1px solid #dbe2ec;border-radius:9px;padding:10px;font:inherit}.form label{font-size:12px;color:#59677b;font-weight:700;display:grid;gap:5px}.hidden{display:none}.news{padding:12px 0;border-bottom:1px solid var(--line)}.news h4{margin:0 0 6px}.muted{color:var(--muted);font-size:12px}.status{border:1px solid #dbe2ec;border-radius:7px;padding:5px}@media(max-width:900px){.shell{grid-template-columns:1fr}.side{display:flex;gap:6px;flex-wrap:wrap}.brand{width:100%;margin-bottom:8px}.side button{width:auto}.stats{grid-template-columns:repeat(2,1fr)}.main{padding:20px}}
</style></head><body><div class="shell"><aside class="side"><div class="brand"><div class="mark">DF</div><div><b>Digital Fraud</b><div class="muted">Early Warning Hub</div></div></div><button class="active" data-tab="dashboard">Dashboard</button><button data-tab="news">Haber Akışı</button><button data-tab="alerts">Fraud Uyarıları</button><button data-tab="data">Üretim / Hasar</button></aside><main class="main"><section class="top"><div class="k">TÜRKİYE KATILIM SİGORTA • MVP</div><h1>Dijital Fraud Uygulaması</h1><p>Açık kaynak kaza haberlerini üretim ve hasar verileriyle eşleştiren erken uyarı uygulaması.</p></section><div id="dashboard" class="tab"><div class="demo"><div><b>Demo veri akışı</b><div class="muted">Yerel haber API’sinden gelmiş gibi örnek olay üretir.</div></div><button class="btn" id="demoBtn">Demo Haberi Çek</button></div><div class="stats" id="stats"></div><div class="panel"><div class="k">SON SİNYALLER</div><h3>Fraud uyarı kuyruğu</h3><div id="alertMini"></div></div></div><div id="news" class="tab hidden"><div class="panel"><div class="k">MANUEL TEST</div><h3>Haber ekle ve analiz et</h3><form id="newsForm" class="form"><label>Başlık<input name="title" required></label><label>Kaynak<input name="source" value="Manuel Test" required></label><label>Haber metni<textarea name="content" rows="6" required placeholder="74 ABC 741 plakalı araç... alkollü..."></textarea></label><button class="btn">Analiz Et</button></form></div><div class="panel"><div class="k">AKIŞ</div><h3>Analiz edilen haberler</h3><div id="newsList"></div></div></div><div id="alerts" class="tab hidden"><div class="panel"><div class="k">İNCELEME ÖNCELİĞİ</div><h3>Tüm fraud uyarıları</h3><div id="alertAll"></div></div></div><div id="data" class="tab hidden"><div class="panel"><div class="k">ŞİRKET VERİSİ</div><h3>Poliçeler</h3><div id="policies"></div></div><div class="panel"><div class="k">HASAR</div><h3>Hasar dosyaları</h3><div id="claims"></div></div></div></main></div><script>
let state={policies:[],claims:[],news:[],alerts:[]};const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));const fmt=d=>new Intl.DateTimeFormat('tr-TR',{dateStyle:'short',timeStyle:'short'}).format(new Date(d));
async function load(){state=await fetch('/api/state').then(r=>r.json());render();}
function table(head,rows){return `<div style="overflow:auto"><table class="table"><thead><tr>${head.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`}
function render(){const matched=state.alerts.filter(a=>a.policyNo).length, high=state.alerts.filter(a=>['HIGH','CRITICAL'].includes(a.level)).length, plates=state.news.reduce((n,x)=>n+x.detectedPlates.length,0);document.querySelector('#stats').innerHTML=[[state.news.length,'Analiz edilen haber'],[plates,'Yakalanan plaka'],[matched,'Poliçe eşleşmesi'],[state.claims.filter(c=>c.status==='OPEN').length,'Açık hasar'],[high,'Yüksek risk']].map(([n,l])=>`<div class="stat"><span>${l}</span><b>${n}</b></div>`).join('');const rows=state.alerts.slice(0,8).map(a=>`<tr><td><span class="badge ${a.level}">${a.level}</span><br><b>${a.score}/100</b></td><td><span class="plate">${esc(a.plate)}</span></td><td>${esc(a.policyNo||'—')}<br><span class="muted">${esc(a.claimNo||'')}</span></td><td>${a.reasons.slice(0,3).map(r=>`<span class="reason">${esc(r)}</span>`).join('')}</td></tr>`);document.querySelector('#alertMini').innerHTML=rows.length?table(['Risk','Plaka','Eşleşme','Neden'],rows):'<p class="muted">Henüz uyarı yok.</p>';document.querySelector('#newsList').innerHTML=state.news.length?state.news.map(n=>`<div class="news"><h4>${esc(n.title)}</h4><div class="muted">${esc(n.source)} • ${fmt(n.publishedAt)}</div><p>${esc(n.content)}</p>${n.detectedPlates.map(p=>`<span class="plate">${esc(p)}</span>`).join(' ')}</div>`).join(''):'<p class="muted">Henüz haber yok.</p>';document.querySelector('#alertAll').innerHTML=state.alerts.length?table(['Seviye','Skor','Plaka','Poliçe','Hasar','Sinyaller','Durum'],state.alerts.map(a=>`<tr><td><span class="badge ${a.level}">${a.level}</span></td><td><b>${a.score}</b></td><td><span class="plate">${esc(a.plate)}</span></td><td>${esc(a.policyNo||'—')}</td><td>${esc(a.claimNo||'—')}</td><td>${a.reasons.map(r=>`<span class="reason">${esc(r)}</span>`).join('')}</td><td><select class="status" data-id="${esc(a.id)}"><option value="NEW" ${a.status==='NEW'?'selected':''}>Yeni</option><option value="REVIEWING" ${a.status==='REVIEWING'?'selected':''}>İnceleniyor</option><option value="CLOSED" ${a.status==='CLOSED'?'selected':''}>Kapandı</option></select></td></tr>`)):'<p class="muted">Henüz uyarı yok.</p>';document.querySelectorAll('.status').forEach(x=>x.onchange=async e=>{await fetch('/api/alerts',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({id:e.target.dataset.id,status:e.target.value})});load();});document.querySelector('#policies').innerHTML=table(['Poliçe','Plaka','Sigortalı','Ürün','Durum'],state.policies.map(p=>`<tr><td>${esc(p.policyNo)}</td><td>${esc(p.plate)}</td><td>${esc(p.insured)}</td><td>${esc(p.product)}</td><td>${esc(p.status)}</td></tr>`));document.querySelector('#claims').innerHTML=table(['Hasar','Plaka','Durum','Rezerv'],state.claims.map(c=>`<tr><td>${esc(c.claimNo)}</td><td>${esc(c.plate)}</td><td>${esc(c.status)}</td><td>${Number(c.reserve).toLocaleString('tr-TR')} TL</td></tr>`));}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.add('hidden'));document.querySelector('#'+b.dataset.tab).classList.remove('hidden');document.querySelectorAll('[data-tab]').forEach(x=>x.classList.remove('active'));b.classList.add('active')});document.querySelector('#demoBtn').onclick=async()=>{const b=document.querySelector('#demoBtn');b.disabled=true;b.textContent='Analiz ediliyor...';await fetch('/api/demo',{method:'POST'});b.disabled=false;b.textContent='Demo Haberi Çek';load();};document.querySelector('#newsForm').onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target).entries());await fetch('/api/news',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(f)});e.target.reset();load();};load();
</script></body></html>
__DFH_EOF__

cat > data/db.json <<'__DFH_EOF__'
{
  "policies": [
    {
      "id": "P1",
      "policyNo": "KSK-2026-000184",
      "plate": "74 ABC 741",
      "insured": "Demo Sigortalı A.Ş.",
      "product": "Kasko",
      "status": "ACTIVE",
      "startDate": "2026-03-10",
      "endDate": "2027-03-10"
    },
    {
      "id": "P2",
      "policyNo": "KSK-2026-000209",
      "plate": "34 TKS 2026",
      "insured": "Demo Müşteri",
      "product": "Kasko",
      "status": "ACTIVE",
      "startDate": "2026-05-01",
      "endDate": "2027-05-01"
    },
    {
      "id": "P3",
      "policyNo": "TRF-2026-000087",
      "plate": "06 FRD 61",
      "insured": "Demo Firma",
      "product": "Trafik",
      "status": "ACTIVE",
      "startDate": "2026-01-15",
      "endDate": "2027-01-15"
    },
    {
      "id": "P4",
      "policyNo": "KSK-2025-000999",
      "plate": "35 XYZ 35",
      "insured": "Demo Eski Müşteri",
      "product": "Kasko",
      "status": "PASSIVE",
      "startDate": "2025-01-01",
      "endDate": "2026-01-01"
    }
  ],
  "claims": [
    {
      "id": "C1",
      "claimNo": "HSR-2026-00451",
      "plate": "06 FRD 61",
      "status": "OPEN",
      "lossDate": "2026-08-04",
      "noticeDate": "2026-08-05",
      "reserve": 275000
    },
    {
      "id": "C2",
      "claimNo": "HSR-2026-00371",
      "plate": "34 TKS 2026",
      "status": "CLOSED",
      "lossDate": "2026-07-10",
      "noticeDate": "2026-07-10",
      "reserve": 85000
    }
  ],
  "news": [],
  "alerts": []
}
__DFH_EOF__

cat > scripts/check.js <<'__DFH_EOF__'
const fs=require('fs');
const required=['server.js','public/index.html','data/db.json'];
let ok=true;
for(const f of required){if(!fs.existsSync(f)){console.error('Eksik:',f);ok=false;}else console.log('OK:',f);}
if(!ok) process.exit(1);
try{JSON.parse(fs.readFileSync('data/db.json','utf8'));console.log('OK: data/db.json JSON geçerli');}catch(e){console.error('DB JSON hatalı:',e.message);process.exit(1);}
console.log('Build/check başarılı. Bu proje derleme gerektirmez.');
__DFH_EOF__

cat > .nvmrc <<'__DFH_EOF__'
16
__DFH_EOF__

cat > .gitignore <<'__DFH_EOF__'
node_modules/
.env
.DS_Store
*.log
__DFH_EOF__

echo "Dosyalar güncellendi."
echo "Node: $(node -v)"
node scripts/check.js
echo ""
echo "Şimdi şu komutu çalıştır:"
echo "npm run dev"
echo ""
echo "Ardından başka terminalde:"
echo "curl -i http://127.0.0.1:3000/health"