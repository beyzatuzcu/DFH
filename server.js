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
