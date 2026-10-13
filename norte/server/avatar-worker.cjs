// Processo descartável: sem credenciais, sem busca de URLs e sem persistir o original.
const deny = () => { throw new Error('network_denied'); };
require('node:net').Socket.prototype.connect = deny;
require('node:dgram').createSocket = deny;
globalThis.fetch = deny;
const sharp = require('sharp');
sharp.cache(false);
sharp.concurrency(1);
process.once('message',async data => {
  try {
    const bytes = Buffer.from(data,'base64');
    if (bytes.length > 2 * 1024 * 1024) { throw new Error('size'); }
    const input = sharp(bytes,{limitInputPixels:16000000,failOn:'warning',animated:false});
    const meta = await input.metadata();
    if (!['jpeg','png','webp'].includes(meta.format) || (meta.pages || 1) !== 1 || !meta.width || !meta.height) { throw new Error('format'); }
    const output = await input.autoOrient().resize(256,256,{fit:'cover',position:'centre'}).webp({quality:80,effort:2}).toBuffer();
    if (output.length > 100000) { throw new Error('size'); }
    process.send({bytes:output.toString('base64')});
  } catch { process.send({error:'invalid_avatar'}); }
});
