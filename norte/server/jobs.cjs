const {fork} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {check,AppError} = require('./errors.cjs');
const {hash} = require('./supabase.cjs');
let activeRenders = 0;
async function renderIsolated(job) {
  if (activeRenders >= 1) { throw new AppError('generation_busy',503); }
  activeRenders += 1;
  const root = path.resolve(__dirname,'..');
  let temporary;
  try {
    temporary = fs.mkdtempSync(path.join(os.tmpdir(),'norte-render-'));
    return await new Promise((resolve,reject) => {
      const allowed = [path.join(root,'server'),path.join(root,'node_modules'),path.join(root,'assets','fonts'),path.join(root,'dist','templates.json')];
      const execArgv = ['--permission','--max-old-space-size=256',...allowed.map(file => '--allow-fs-read=' + file)];
      // Sem escrita, addons, subprocessos ou credenciais. Node 24 não oferece isolamento de rede pelo sistema operacional.
      const child = fork(path.join(__dirname,'render-worker.cjs'),[path.join(root,'dist','templates.json')],{cwd:temporary,env:{NODE_ENV:'production'},execArgv,stdio:['ignore','ignore','ignore','ipc']});
      const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('render_timeout')); },45000);
      child.once('message',message => { clearTimeout(timer); child.kill(); if (message.error) { reject(new Error('generation_failed')); } else { resolve({...message,bytes:Buffer.from(message.bytes,'base64')}); } });
      child.once('error',error => { clearTimeout(timer); reject(error); });
      child.once('exit',code => { clearTimeout(timer); if (code !== 0 && code !== null) { reject(new Error('render_exit')); } });
      child.send({project:job.snapshot,input:job.input});
    });
  } finally { activeRenders -= 1; if (temporary) { fs.rmSync(temporary,{recursive:true,force:true}); } }
}
async function processJob(gateway,job,renderer = renderIsolated) {
  let storagePath = null;
  try {
    const result = await renderer(job);
    const active = await gateway.rpc('norte_job_bytes',{p_id:job.id,p_lease:job.lease_token,p_bytes:result.bytes.length});
    if (!active) { throw new Error('lease_expired'); }
    storagePath = `${job.user_id}/${job.project_id}/${job.id}/${job.lease_token}`;
    check(await gateway.service.storage.from('norte-projects').upload(storagePath,result.bytes,{contentType:result.mime,upsert:false}));
    const args = {p_job:job.id,p_lease:job.lease_token,p_ok:true,p_path:storagePath,p_filename:result.filename,p_mime:result.mime,p_sha:hash(result.bytes)};
    const published = await gateway.rpc('norte_finish_job',args);
    if (!published) { await gateway.service.storage.from('norte-projects').remove([storagePath]); }
  } catch {
    if (storagePath) { await gateway.service.storage.from('norte-projects').remove([storagePath]).catch(() => {}); }
    await gateway.rpc('norte_finish_job',{p_job:job.id,p_lease:job.lease_token,p_ok:false,p_path:null,p_filename:null,p_mime:null,p_sha:null,p_error:'generation_failed'});
  }
}
async function processEmail(gateway,config,fetcher = fetch) {
  if (!config.resendKey || !config.emailFrom || !config.leadsEmail) { return; }
  const message = await gateway.rpc('norte_outbox',{p_action:'claim'});
  if (!message) { return; }
  try {
    const body = {from:config.emailFrom,to:[config.leadsEmail],subject:'Norte · solicitação de contratação',text:`Pedido ${message.orderId}. Consulte a área administrativa para o contato autorizado e a configuração.`};
    const response = await fetcher('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer ' + config.resendKey,'Content-Type':'application/json','Idempotency-Key':'norte-order-' + message.orderId},body:JSON.stringify(body),signal:AbortSignal.timeout(10000),redirect:'error'});
    await gateway.rpc('norte_outbox',{p_action:response.ok ? 'sent' : 'failed',p_id:message.id});
  } catch { await gateway.rpc('norte_outbox',{p_action:'failed',p_id:message.id}); }
}
function startWorker(gateway,config) {
  let running = false; let stopped = false; let cycles = 0;
  async function tick() {
    if (running || stopped) { return; } running = true;
    try {
      const job = await gateway.rpc('norte_claim_job',{}); if (job?.id) { await processJob(gateway,job); }
      await processEmail(gateway,config);
      cycles += 1;
      if (cycles % 120 === 0) { const paths = await gateway.rpc('norte_cleanup',{}); if (paths?.length) { check(await gateway.service.storage.from('norte-projects').remove(paths)); await gateway.rpc('norte_cleanup_done',{p_paths:paths}); } }
    } catch { console.error(JSON.stringify({event:'worker_unavailable'})); } finally { running = false; }
  }
  const timer = setInterval(tick,5000); timer.unref(); tick();
  return () => { stopped = true; clearInterval(timer); };
}
module.exports = {startWorker,renderIsolated,processJob,processEmail};
