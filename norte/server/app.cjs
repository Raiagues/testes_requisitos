const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const {doubleCsrf} = require('csrf-csrf');
const {rateLimit} = require('express-rate-limit');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {readConfig} = require('./config.cjs');
const {createGateway} = require('./supabase.cjs');
const {AppError,check} = require('./errors.cjs');
const schema = require('./schemas.cjs');
function createApp({config = readConfig(),gateway = createGateway(config),fetcher = fetch,templates = null} = {}) {
  const root = path.resolve(__dirname,'..');
  templates ||= JSON.parse(fs.readFileSync(path.join(root,'dist','templates.json'),'utf8'));
  const app = express();
  const secret = config.sessionKey || crypto.randomBytes(32).toString('hex');
  const prefix = config.production ? '__Host-' : '';
  const sessionCookie = prefix + 'norte-session';
  const seedCookie = prefix + 'norte-browser';
  const cookieOptions = {httpOnly:true,secure:config.production,sameSite:'strict',path:'/',maxAge:7 * 86400000};
  app.disable('x-powered-by');
  app.set('trust proxy',false);
  const directives = {defaultSrc:["'none'"],scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'"],imgSrc:["'self'",'data:','blob:'],fontSrc:["'self'"],connectSrc:["'self'"],workerSrc:["'self'"],frameSrc:["'none'"],objectSrc:["'none'"],baseUri:["'none'"],formAction:["'self'"],frameAncestors:["'none'"],upgradeInsecureRequests:config.production ? [] : null};
  app.use(helmet({contentSecurityPolicy:{directives},referrerPolicy:{policy:'no-referrer'}}));
  app.use(cookieParser(secret));
  app.use((req,res,next) => { req.requestId = crypto.randomUUID(); res.setHeader('X-Request-ID',req.requestId); if (req.path.startsWith('/api') || req.path.startsWith('/auth')) { res.setHeader('Cache-Control','private, no-store'); } next(); });
  app.use('/api',rateLimit({windowMs:60000,limit:240,standardHeaders:'draft-8',legacyHeaders:false,validate:{xForwardedForHeader:false},message:{error:'rate_limit'}}));
  app.use(express.json({limit:'4mb',strict:true}));
  const csrf = doubleCsrf({getSecret:() => secret,getSessionIdentifier:req => req.signedCookies[seedCookie] || '',cookieName:prefix + 'norte-csrf',cookieOptions:{httpOnly:true,secure:config.production,sameSite:'strict',path:'/'},getCsrfTokenFromRequest:req => req.headers['x-csrf-token']});
  async function session(req) { if (!req.auth) { req.auth = await gateway.resolveSession(req.cookies[sessionCookie]); } return req.auth; }
  async function authenticated(req,_res,next) { await session(req); next(); }
  async function optionalSession(req) { if (req.cookies[sessionCookie]) { await session(req); } }
  async function limited(req,bucket,limit = 30,seconds = 3600) {
    const ip = req.socket.remoteAddress || 'unknown';
    if (!await gateway.rate(bucket + ':ip:' + ip,limit * 5,seconds)) { throw new AppError('rate_limit',429); }
    if (req.auth && !await gateway.rate(bucket + ':user:' + req.auth.user.id,limit,seconds)) { throw new AppError('rate_limit',429); }
  }
  async function audit(req,event,result = 'ok',projectId = null) { if (gateway) { await gateway.audit(req.auth?.user.id,projectId,event,result,req.requestId).catch(() => {}); } }
  async function getProject(req,id = req.params.id) {
    schema.uuid.parse(id);
    const project = check(await req.auth.db.rpc('norte_project_context',{p_id:id}));
    if (!project) { throw new AppError('not_found',404); } return project;
  }
  async function admin(req,role) {
    await session(req);
    const result = await req.auth.authClient.auth.getClaims(req.auth.tokens.access_token);
    const claims = result.data?.claims;
    const recent = claims?.amr?.some(entry => ['totp','mfa/totp'].includes(entry.method) && entry.timestamp > Date.now() / 1000 - 600);
    if (result.error || claims?.aal !== 'aal2' || !recent || !check(await req.auth.db.rpc('norte_is_admin',{p_role:role || null}))) { throw new AppError('admin_mfa_recent_required',403); }
  }
  async function configuration() { return check(await gateway.fresh().from('norte_config').select('*').eq('active',true).single()); }
  async function eligibility(req) {
    if (!req.auth) { return {first:false,feedback:false}; }
    const feedback = check(await req.auth.db.from('norte_feedback').select('user_id').eq('user_id',req.auth.user.id).maybeSingle());
    const orders = check(await req.auth.db.from('norte_orders').select('id').eq('user_id',req.auth.user.id).eq('status','confirmed').limit(1));
    return {first:orders.length === 0,feedback:Boolean(feedback)};
  }
  app.get('/api/health',(_req,res) => res.json({service:'norte',status:'ok'}));
  app.get('/api/ready',async (_req,res) => { if (!gateway) { throw new AppError('setup_required',503); } await configuration(); res.json({ready:true}); });
  app.get('/api/bootstrap',async (req,res) => {
    if (!req.signedCookies[seedCookie]) { const seed = crypto.randomBytes(24).toString('hex'); req.signedCookies[seedCookie] = seed; res.cookie(seedCookie,seed,{...cookieOptions,signed:true}); }
    let user = null; let entitlements = null; let offer = null; let role = false;
    if (gateway) { offer = await configuration(); if (req.cookies[sessionCookie]) { try { const auth = await session(req); user = {id:auth.user.id,email:auth.user.email}; entitlements = check(await auth.db.rpc('norte_usage')); role = check(await auth.db.rpc('norte_is_admin')); } catch (error) { if (error.status !== 401) { throw error; } res.clearCookie(sessionCookie,cookieOptions); } } }
    res.json({csrfToken:csrf.generateCsrfToken(req,res),configured:Boolean(gateway),authEmailReady:config.authEmailReady,user,entitlements,offer,admin:role,privacyContact:config.privacyContact,serviceOwner:config.serviceOwner,uploadsEnabled:false,technicalAIEnabled:config.requirementsProvider !== 'none'});
  });
  app.use('/api',(req,res,next) => {
    if (['GET','HEAD','OPTIONS'].includes(req.method)) { return next(); }
    if (req.headers.origin !== config.siteUrl || !req.is('application/json') || !req.signedCookies[seedCookie]) { return next(new AppError('request_origin_or_type_denied',403)); }
    csrf.doubleCsrfProtection(req,res,next);
  });
  app.use('/api',(_req,_res,next) => { if (!gateway) { return next(new AppError('setup_required',503)); } next(); });
  const helpers = {config,gateway,fetcher,templates,session,authenticated,optionalSession,limited,audit,getProject,admin,configuration,eligibility,sessionCookie,seedCookie,cookieOptions};
  require('./routes-auth.cjs')(app,helpers);
  require('./routes-project.cjs')(app,helpers);
  require('./routes-team.cjs')(app,helpers);
  require('./routes-business.cjs')(app,helpers);
  app.use('/assets',express.static(path.join(root,'dist','assets'),{dotfiles:'deny',index:false,maxAge:3600000,fallthrough:false}));
  app.get(['/','/index.html','/auth/confirm'],(_req,res) => res.sendFile(path.join(root,'dist','index.html')));
  app.use((_req,_res,next) => next(new AppError('not_found',404)));
  app.use(async (error,req,res,_next) => {
    const validation = error instanceof schema.z.ZodError;
    const status = validation ? 422 : error.code === 'EBADCSRFTOKEN' ? 403 : error.status || 500;
    const code = validation ? 'invalid_input' : error instanceof AppError ? error.code : error.code === 'EBADCSRFTOKEN' ? 'csrf_invalid' : status === 413 ? 'request_too_large' : status === 404 ? 'not_found' : 'operation_unavailable';
    await audit(req,'request_blocked',code);
    if (!res.headersSent) { res.status(status).json({error:code,requestId:req.requestId}); }
  });
  return app;
}
function sendBytes(req,res,bytes,mime,filename,attachment = true) {
  res.type(mime); res.setHeader('Accept-Ranges','bytes'); res.setHeader('Content-Disposition',`${attachment ? 'attachment' : 'inline'}; filename="${filename.replace(/[^a-zA-Z0-9_.-]/g,'_')}"`);
  if (req.headers.range) { const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range); if (!match) { res.status(416).end(); return; } const start = Number(match[1]); const end = match[2] ? Number(match[2]) : bytes.length - 1; if (start > end || end >= bytes.length) { res.status(416).set('Content-Range',`bytes */${bytes.length}`).end(); return; } res.status(206).set('Content-Range',`bytes ${start}-${end}/${bytes.length}`).send(bytes.subarray(start,end + 1)); return; }
  res.send(bytes);
}
module.exports = {createApp,sendBytes};
