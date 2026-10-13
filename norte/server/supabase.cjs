const {createClient} = require('@supabase/supabase-js');
const crypto = require('node:crypto');
const {AppError,check} = require('./errors.cjs');
const {configured} = require('./config.cjs');
function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function encrypt(value, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),body]).toString('base64url');
}
function decrypt(value, key) {
  const bytes = Buffer.from(value,'base64url');
  const decipher = crypto.createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),bytes.subarray(0,12));
  decipher.setAuthTag(bytes.subarray(12,28));
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8'));
}
function createGateway(config) {
  if (!configured(config)) { return null; }
  const options = {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
  const service = createClient(config.supabaseUrl,config.secretKey,options);
  const fresh = () => createClient(config.supabaseUrl,config.publishableKey,options);
  const userClient = token => createClient(config.supabaseUrl,config.publishableKey,{...options,global:{headers:{Authorization:`Bearer ${token}`}}});
  const sessionLocks = new Map();
  async function rpc(name,args) { return check(await service.rpc(name,args)); }
  async function saveSession(tokens,userId,id = crypto.randomBytes(32).toString('base64url')) {
    const args = {p_action:'put',p_id:hash(id),p_user:userId,p_tokens:encrypt(tokens,config.sessionKey),p_expires:new Date(Date.now() + 7 * 86400000).toISOString()};
    await rpc('norte_session',args);
    return id;
  }
  async function resolveSession(id) {
    if (!id || !/^[A-Za-z0-9_-]{43}$/.test(id)) { throw new AppError('not_authenticated',401); }
    if (sessionLocks.has(id)) { return sessionLocks.get(id); }
    const promise = (async () => {
      const row = await rpc('norte_session',{p_action:'get',p_id:hash(id)});
      if (!row) { throw new AppError('session_expired',401); }
      let tokens = decrypt(row.encrypted_tokens,config.sessionKey);
      const authClient = fresh();
      if (tokens.expires_at * 1000 < Date.now() + 60000) {
        const result = await authClient.auth.refreshSession({refresh_token:tokens.refresh_token});
        if (result.error || !result.data.session) { await rpc('norte_session',{p_action:'delete',p_id:hash(id)}); throw new AppError('session_expired',401); }
        tokens = {...result.data.session,recovery:tokens.recovery};
        await saveSession(tokens,row.user_id,id);
      }
      const verified = await authClient.auth.getUser(tokens.access_token);
      if (verified.error || verified.data.user?.id !== row.user_id || !verified.data.user.email_confirmed_at) { throw new AppError('not_authenticated',401); }
      const db = userClient(tokens.access_token);
      const account = check(await db.from('norte_accounts').select('suspended').eq('user_id',row.user_id).maybeSingle());
      if (account?.suspended) { throw new AppError('account_suspended',403); }
      return {id,user:verified.data.user,tokens,db,authClient};
    })();
    sessionLocks.set(id,promise);
    try { return await promise; } finally { sessionLocks.delete(id); }
  }
  async function audit(actor,project,event,result,requestId) { await rpc('norte_internal_audit',{p_actor:actor || null,p_project:project || null,p_event:event,p_result:result,p_request:requestId}); }
  async function rate(key,limit,seconds) { return rpc('norte_rate',{p_key:hash(config.sessionKey + ':' + key),p_limit:limit,p_seconds:seconds}); }
  return {service,fresh,userClient,rpc,saveSession,resolveSession,audit,rate};
}
module.exports = {createGateway,hash,encrypt,decrypt};
