const {execFileSync} = require('node:child_process');
const crypto = require('node:crypto');
const image = process.argv[2] || 'norte:verification';
if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/@-]{0,200}$/.test(image)) { throw new Error('Nome de imagem inválido.'); }
const name = 'norte-smoke-' + crypto.randomUUID();
const code = `
const assert = require('node:assert/strict');
const fs = require('node:fs');
assert.notEqual(process.getuid(),0);
for (const file of ['/app/.env','/app/.git','/app/dados-privados','/app/backups','/app/tests']) { assert.equal(fs.existsSync(file),false); }
(async () => {
  let response;
  for (let i = 0; i < 20; i += 1) { try { response = await fetch('http://127.0.0.1:8080/api/health'); if (response.ok) { break; } } catch {} await new Promise(resolve => setTimeout(resolve,100)); }
  assert.equal(response.status,200);
  assert.equal((await fetch('http://127.0.0.1:8080/api/ready')).status,503);
  assert.equal((await fetch('http://127.0.0.1:8080/.env')).status,404);
  const template = JSON.parse(fs.readFileSync('/app/dist/templates.json','utf8'));
  const project = {id:'synthetic',name:'Teste do contêiner',profile:'NASA',version:1,updated_at:'2026-10-12T12:00:00Z',payload:{requirements:template.requirements,verifications:template.verifications,engineering:template.engineering}};
  const {renderIsolated} = require('/app/server/jobs.cjs');
  for (const format of ['pdf','docx','zip']) { const result = await renderIsolated({snapshot:project,input:{format,documents:['REQ']}}); assert.ok(result.bytes.length > 100); assert.equal(result.bytes.subarray(0,format === 'pdf' ? 5 : 2).toString(),format === 'pdf' ? '%PDF-' : 'PK'); console.log('PASS CONTAINER ' + format + ' · ' + result.bytes.length + ' bytes'); }
  console.log('PASS CONTAINER usuário sem root, filesystem readonly, rede externa ausente, saúde 200, prontidão 503 sem configuração e segredos fora da imagem.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });`;
let created = false;
try {
  execFileSync('docker',['run','--detach','--name',name,'--network','none','--read-only','--tmpfs','/tmp:rw,noexec,nosuid,size=64m','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','512m','--pids-limit','64',image],{stdio:'pipe',timeout:30000});
  created = true;
  execFileSync('docker',['exec',name,'node','-e',code],{stdio:'inherit',timeout:120000});
} finally { if (created) { execFileSync('docker',['rm','--force',name],{stdio:'pipe',timeout:10000}); } }
