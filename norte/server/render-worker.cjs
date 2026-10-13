// Processo sem credenciais e sem entrada HTML; conexões são recusadas pelo código controlado.
const fs = require('node:fs');
const denyNetwork = () => { throw new Error('network_denied'); };
require('node:net').Socket.prototype.connect = denyNetwork;
require('node:dgram').createSocket = denyNetwork;
globalThis.fetch = denyNetwork;
const {generate} = require('./documents.cjs');
const templates = JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
process.on('message',async input => {
  try { const result = await generate(input.project,input.input,templates); if (result.bytes.length > 20 * 1024 * 1024) { throw new Error('too_large'); } process.send({filename:result.filename,mime:result.mime,bytes:result.bytes.toString('base64')}); }
  catch { process.send({error:'generation_failed'}); }
});
