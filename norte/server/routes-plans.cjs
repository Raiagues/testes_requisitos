const {z,uuid} = require('./schemas.cjs');
const {check} = require('./errors.cjs');
const selection = z.strictObject({kind:z.enum(['individual','company']),company:z.string().trim().max(120),editors:z.number().int().min(0).max(19),reviewers:z.number().int().min(0).max(19),viewers:z.number().int().min(0).max(19)});
module.exports = function planRoutes(app,h) {
  const {gateway,authenticated,limited,admin} = h;
  app.get('/api/plans',async (_req,res) => res.json(check(await gateway.fresh().from('norte_plan_catalog').select('*').eq('active',true).single())));
  app.post('/api/plans/quote',authenticated,async (req,res) => { const input=selection.parse(req.body); res.json(check(await req.auth.db.rpc('norte_plan_quote',{p_selection:input}))); });
  app.get('/api/plans/requests',authenticated,async (req,res) => res.json(check(await req.auth.db.rpc('norte_plan_requests'))));
  app.post('/api/plans/requests',authenticated,async (req,res) => { const input=z.strictObject({key:uuid,selection,version:z.number().int().positive(),expectedCents:z.number().int().nonnegative(),consent:z.literal(true)}).parse(req.body); await limited(req,'plan-request',8); res.status(201).json(check(await req.auth.db.rpc('norte_plan_request',{p_key:input.key,p_selection:input.selection,p_version:input.version,p_expected:input.expectedCents}))); });
  app.post('/api/plans/requests/:id/cancel',authenticated,async (req,res) => { uuid.parse(req.params.id); const input=z.strictObject({version:z.number().int().positive()}).parse(req.body); check(await req.auth.db.rpc('norte_plan_cancel',{p_id:req.params.id,p_version:input.version})); res.json({ok:true}); });
  app.get('/api/admin/plans',async (req,res) => { await admin(req,'commercial'); res.json(check(await req.auth.db.rpc('norte_plan_requests',{p_admin:true}))); });
  app.post('/api/admin/plans/catalog',async (req,res) => { await admin(req,'commercial'); const cents=z.number().int().nonnegative().max(1000000); const input=z.strictObject({version:z.number().int().positive(),prices:z.strictObject({individual:cents,company:cents,editor:cents,reviewer:cents}),approved:z.boolean()}).parse(req.body); res.json({version:check(await req.auth.db.rpc('norte_admin_plan_catalog',{p_version:input.version,p_prices:input.prices,p_approved:input.approved}))}); });
  app.post('/api/admin/plans/:id',async (req,res) => { await admin(req,'commercial'); uuid.parse(req.params.id); const input=z.strictObject({version:z.number().int().positive(),status:z.enum(['contacted','confirmed','cancelled']),confirm:z.boolean()}).parse(req.body); check(await req.auth.db.rpc('norte_admin_plan_request',{p_id:req.params.id,p_version:input.version,p_status:input.status,p_confirm:input.confirm})); res.json({ok:true}); });
};
