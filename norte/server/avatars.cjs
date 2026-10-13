const {fork} = require('node:child_process');
const path = require('node:path');
const {AppError} = require('./errors.cjs');
let active = 0;
async function normalizeAvatar(data) {
  if (typeof data !== 'string' || data.length > 2800000 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data) || !data) { throw new AppError('invalid_avatar',422); }
  const bytes = Buffer.from(data,'base64');
  const raster = bytes.subarray(0,3).equals(Buffer.from([255,216,255])) || bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')) || (bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP');
  if (!raster || bytes.length > 2 * 1024 * 1024) { throw new AppError('invalid_avatar',422); }
  if (active >= 1) { throw new AppError('avatar_busy',429); }
  active += 1;
  try {
    return await new Promise((resolve,reject) => {
      const worker = fork(path.join(__dirname,'avatar-worker.cjs'),[],{env:{NODE_ENV:'production',VIPS_CONCURRENCY:'1'},execArgv:['--max-old-space-size=64'],stdio:['ignore','ignore','ignore','ipc']});
      let done = false;
      const finish = (error,result) => { if (done) { return; } done=true; clearTimeout(timer); worker.kill('SIGKILL'); error ? reject(error) : resolve(result); };
      const timer = setTimeout(() => finish(new AppError('invalid_avatar',422)),7000);
      worker.once('error',() => finish(new AppError('invalid_avatar',422)));
      worker.once('exit',() => finish(new AppError('invalid_avatar',422)));
      worker.once('message',result => finish(result.error ? new AppError('invalid_avatar',422) : null,result.bytes));
      worker.send(data);
    });
  } finally { active -= 1; }
}
module.exports = {normalizeAvatar};
