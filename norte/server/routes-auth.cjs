const schema = require('./schemas.cjs');
const {AppError,check} = require('./errors.cjs');
const {hash} = require('./supabase.cjs');
module.exports = function authRoutes(app,h) {
  const {gateway,config,limited,authenticated,audit,sessionCookie,cookieOptions} = h;
  app.post('/api/auth/signup',async (req,res) => {
    const input = schema.login.parse(req.body); await limited(req,'signup',5);
    if (!config.authEmailReady) { throw new AppError('auth_email_unavailable',503); }
    const result = await gateway.fresh().auth.signUp({...input,options:{emailRedirectTo:config.siteUrl + '/auth/confirm'}});
    if (result.error && result.error.code !== 'user_already_exists') { throw new AppError('auth_email_unavailable',503); }
    if (!result.error && result.data?.user?.id) { check(await gateway.service.rpc('norte_register_signup',{p_user:result.data.user.id})); }
    await audit(req,'signup_requested'); res.json({message:'Se o endereço puder ser cadastrado, você receberá a confirmação por e-mail.'});
  });
  app.post('/api/auth/login',async (req,res) => {
    const input = schema.login.parse(req.body); await limited(req,'login',10,900);
    const result = await gateway.fresh().auth.signInWithPassword(input);
    if (result.error || !result.data.session || !result.data.user.email_confirmed_at) { await audit(req,'login','denied'); throw new AppError('invalid_credentials_or_confirmation',401); }
    const id = await gateway.saveSession(result.data.session,result.data.user.id);
    res.cookie(sessionCookie,id,cookieOptions); await audit(req,'login'); res.json({ok:true});
  });
  app.post('/api/auth/recover',async (req,res) => {
    const input = schema.z.strictObject({email:schema.z.email().max(200)}).parse(req.body); await limited(req,'recover',5);
    if (!config.authEmailReady) { throw new AppError('auth_email_unavailable',503); }
    const result = await gateway.fresh().auth.resetPasswordForEmail(input.email,{redirectTo:config.siteUrl + '/auth/confirm'});
    if (result.error && result.error.code !== 'user_not_found') { throw new AppError('auth_email_unavailable',503); }
    await audit(req,'recovery_requested'); res.json({message:'Se o endereço estiver cadastrado, você receberá as instruções por e-mail.'});
  });
  app.post('/api/auth/confirm',async (req,res) => {
    const input = schema.z.strictObject({token_hash:schema.z.string().min(20).max(300),type:schema.z.enum(['signup','recovery','email'])}).parse(req.body); await limited(req,'confirm',10);
    const result = await gateway.fresh().auth.verifyOtp(input);
    if (result.error || !result.data.session) { throw new AppError('confirmation_expired',400); }
    const tokens = {...result.data.session,recovery:input.type === 'recovery'};
    const id = await gateway.saveSession(tokens,result.data.user.id); res.cookie(sessionCookie,id,cookieOptions); res.json({ok:true,recovery:tokens.recovery});
  });
  app.post('/api/auth/logout',authenticated,async (req,res) => {
    schema.z.strictObject({}).parse(req.body);
    await gateway.rpc('norte_session',{p_action:'delete',p_id:hash(req.auth.id)});
    const client = gateway.fresh(); await client.auth.setSession(req.auth.tokens); await client.auth.signOut({scope:'local'});
    res.clearCookie(sessionCookie,cookieOptions); await audit(req,'logout'); res.json({ok:true});
  });
  app.post('/api/auth/password',authenticated,async (req,res) => {
    const input = schema.z.strictObject({password:schema.z.string().min(12).max(128),currentPassword:schema.z.string().min(12).max(128).optional()}).parse(req.body); await limited(req,'password',5);
    const client = gateway.fresh();
    if (!req.auth.tokens.recovery) { const verified = await client.auth.signInWithPassword({email:req.auth.user.email,password:input.currentPassword || ''}); if (verified.error) { throw new AppError('reauthentication_required',403); } }
    await client.auth.setSession(req.auth.tokens); check(await client.auth.updateUser({password:input.password}));
    await gateway.rpc('norte_session',{p_action:'delete',p_id:hash(req.auth.id)}); await client.auth.signOut({scope:'global'}); await gateway.rpc('norte_revoke_sessions',{p_user:req.auth.user.id});
    res.clearCookie(sessionCookie,cookieOptions); await audit(req,'password_changed'); res.json({ok:true});
  });
  app.get('/api/auth/mfa',authenticated,async (req,res) => { const client = gateway.fresh(); await client.auth.setSession(req.auth.tokens); res.json(check(await client.auth.mfa.listFactors())); });
  app.post('/api/auth/mfa/enroll',authenticated,async (req,res) => {
    schema.z.strictObject({}).parse(req.body); await limited(req,'mfa',10); const client = gateway.fresh(); await client.auth.setSession(req.auth.tokens);
    const data = check(await client.auth.mfa.enroll({factorType:'totp',friendlyName:'Norte'})); res.json({id:data.id,secret:data.totp.secret,uri:data.totp.uri});
  });
  app.post('/api/auth/mfa/verify',authenticated,async (req,res) => {
    const input = schema.z.strictObject({factorId:schema.uuid,code:schema.z.string().regex(/^\d{6}$/)}).parse(req.body); await limited(req,'mfa',10,900);
    const client = gateway.fresh(); await client.auth.setSession(req.auth.tokens); const data = check(await client.auth.mfa.challengeAndVerify(input));
    const tokens = {...data,expires_at:Math.floor(Date.now() / 1000) + data.expires_in};
    await gateway.saveSession(tokens,req.auth.user.id,req.auth.id); await audit(req,'mfa_verified'); res.json({ok:true});
  });
};
