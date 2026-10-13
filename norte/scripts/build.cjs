const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname,'..');
const code = path.join(root,'codigo');
const output = path.join(root,'dist');
fs.mkdirSync(path.join(output,'assets'),{recursive:true});
const files = {DATA:'data.js',CATALOGUE:'catalogue.js',PRICING:'pricing.js',PDF:'pdf.js',APP:'app.js',LANDING_JS:'landing.js',ENGINEERING_DATA:'engineering-data.js',ENGINEERING_EXPORT:'engineering-export.js',ENGINEERING_APP:'engineering.js',LIFECYCLE_APP:'lifecycle.js',PLATFORM:'platform.js',TEAM:'team.js',PDF_VIEWER:'pdf-viewer.js',COMMERCE:'commerce.js'};
let html = fs.readFileSync(path.join(code,'index.template.html'),'utf8');
function assetUrl(name,content) { return '/assets/' + name + '?v=' + crypto.createHash('sha256').update(content).digest('hex').slice(0,12); }
for (const [marker,file] of Object.entries(files)) {
  const content = fs.readFileSync(path.join(code,file),'utf8');
  fs.writeFileSync(path.join(output,'assets',file),content);
  html = html.replace(`<script>/* ${marker} */</script>`,`<script src="${assetUrl(file,content)}" defer></script>`);
}
const css = ['styles.css','landing.css','engineering.css','lifecycle.css','platform.css'].map(file => fs.readFileSync(path.join(code,file),'utf8')).join('\n');
fs.writeFileSync(path.join(output,'assets','norte.css'),css);
html = html.replace(/<style>[\s\S]*?<\/style>/,`<link rel="stylesheet" href="${assetUrl('norte.css',css)}">`);
html = html.replace('<!-- LANDING -->',fs.readFileSync(path.join(code,'landing.html'),'utf8'));
html = html.replace('<!-- CHAT -->',fs.readFileSync(path.join(code,'chat.html'),'utf8'));
fs.writeFileSync(path.join(output,'index.html'),html);
fs.writeFileSync(path.join(root,'index.html'),html);
for (const file of ['pdf.mjs','pdf.worker.mjs']) { fs.copyFileSync(path.join(root,'node_modules','pdfjs-dist','build',file),path.join(output,'assets',file)); }
const context = vm.createContext({openSource() {},saveDraft() {},showView() {},fitTable() {}});
// Somente código estático do repositório; nunca recebe texto de usuários.
vm.runInContext(fs.readFileSync(path.join(code,'data.js'),'utf8') + '\n' + fs.readFileSync(path.join(code,'engineering-data.js'),'utf8'),context,{timeout:1000});
const seed = vm.runInContext('JSON.stringify({requirements:INITIAL_REQUIREMENTS,verifications,engineering,definitions:DOCUMENT_DEFINITIONS,reviews:REVIEW_PROFILES,sources:SOURCES})',context);
fs.writeFileSync(path.join(output,'templates.json'),seed);
async function examples() {
  const templates = JSON.parse(seed); const {generate} = require('../server/documents.cjs');
  const schedules = {};
  for (const profile of ['NASA','ECSS']) { schedules[profile] = templates.reviews[profile].map(r => ({...r,date:new Date(Date.parse(templates.engineering.start) + r.week * 7 * 86400000).toISOString().slice(0,10),prepDays:10,closeDays:7})); }
  const project = {id:'00000000-0000-4000-8000-000000000000',name:'Missão Aurora · exemplo público',profile:'NASA',version:1,updated_at:'2026-10-12T12:00:00Z',payload:{requirements:templates.requirements,verifications:templates.verifications,engineering:{...templates.engineering,schedules},settings:{},lifecycle:{durations:{}}}};
  const directory = path.join(output,'assets','examples'); fs.mkdirSync(directory,{recursive:true});
  for (const id of ['REQ','RTM','CRN']) { const result = await generate(project,{format:'pdf',documents:[id]},templates); fs.writeFileSync(path.join(directory,id + '.pdf'),result.bytes); }
  console.log('Build gerado em dist; scripts locais, modelos e exemplos identificados.');
}
examples().catch(() => { console.error('Build dos exemplos falhou.'); process.exitCode = 1; });
