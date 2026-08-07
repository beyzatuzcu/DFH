const fs=require('fs');
const required=['server.js','public/index.html','data/db.json'];
let ok=true;
for(const f of required){if(!fs.existsSync(f)){console.error('Eksik:',f);ok=false;}else console.log('OK:',f);}
if(!ok) process.exit(1);
try{JSON.parse(fs.readFileSync('data/db.json','utf8'));console.log('OK: data/db.json JSON geçerli');}catch(e){console.error('DB JSON hatalı:',e.message);process.exit(1);}
console.log('Build/check başarılı. Bu proje derleme gerektirmez.');
