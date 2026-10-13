const {test}=require('node:test');
const assert=require('node:assert/strict');
const sharp=require('sharp');
const {normalizeAvatar}=require('../server/avatars.cjs');
test('foto é reprocessada, reduzida, sem EXIF ou conteúdo extra',async()=>{
  const input=await sharp({create:{width:600,height:400,channels:3,background:'#82533d'}}).jpeg().withExif({IFD0:{Copyright:'SYNTHETIC_PRIVATE_METADATA'}}).toBuffer();
  const data=Buffer.concat([input,Buffer.from('<script>SYNTHETIC_EXTRA</script>')]);
  const output=Buffer.from(await normalizeAvatar(data.toString('base64')),'base64'); const meta=await sharp(output).metadata();
  assert.equal(meta.format,'webp'); assert.equal(meta.width,256); assert.equal(meta.height,256); assert.equal(meta.exif,undefined); assert.ok(!output.includes(Buffer.from('SYNTHETIC_'))); assert.ok(output.length<=100000);
});
test('SVG, URL, HTML, dados corrompidos e foto gigante são recusados',async()=>{
  const giant=await sharp({create:{width:4100,height:4100,channels:3,background:'#fff'}}).png().toBuffer();
  for(const data of ['https://127.0.0.1/secrets',Buffer.from('<svg><script>alert(1)</script></svg>').toString('base64'),Buffer.from('<html>bad</html>').toString('base64'),Buffer.from('89504e470d0a1a0a000000','hex').toString('base64'),giant.toString('base64'),Buffer.alloc(2100000).toString('base64')]) { await assert.rejects(normalizeAvatar(data),/invalid_avatar/); }
});
