const schema = require('./schemas.cjs');
const {AppError,check} = require('./errors.cjs');
const {hash} = require('./supabase.cjs');
const {model} = require('./documents.cjs');
const {validateRects} = require('./network.cjs');
const ai = require('./ai.cjs');
const JOB_COLUMNS = 'id,project_id,project_version,input,status,cost,filename,mime,sha256,error_code,created_at';
module.exports = function projectRoutes(app,h) {
  const {gateway,config,limited,authenticated,optionalSession,audit,getProject,templates,fetcher} = h;
  const sendBytes = (...args) => require('./app.cjs').sendBytes(...args);
  app.get('/api/projects',authenticated,async (req,res) => res.json(check(await req.auth.db.from('norte_projects').select('id,name,profile,phase,project_type,start_date,archived,version,updated_at,owner_id').is('deleted_at',null).order('updated_at',{ascending:false}))));
  app.post('/api/projects',authenticated,async (req,res) => {
    const input = schema.createProject.parse(req.body); await limited(req,'project-write',60);
    const engineering = input.template === 'aurora' ? {...templates.engineering,profile:input.profile,start:input.start} : {profile:input.profile,start:input.start,customDocs:[],schedules:{},prepDays:10,closeDays:7,changes:[],version:1};
    const payload = {requirements:input.template === 'aurora' ? templates.requirements : [],verifications:input.template === 'aurora' ? templates.verifications : [],engineering,settings:{standard:input.profile,quality:true,trace:true,verification:true,anatel:false,itar:false},lifecycle:{durations:{}}};
    const args = {p_name:input.name,p_type:input.type,p_profile:input.profile,p_start:input.start,p_payload:payload};
    res.status(201).json(check(await req.auth.db.rpc('norte_create_project',args)));
  });
  app.get('/api/projects/:id',authenticated,async (req,res) => res.json(await getProject(req)));
  app.put('/api/projects/:id',authenticated,async (req,res) => {
    const input = schema.z.strictObject({version:schema.z.number().int().positive(),payload:schema.payload}).parse(req.body); schema.uuid.parse(req.params.id); await limited(req,'project-write',240);
    res.json(check(await req.auth.db.rpc('norte_save_project',{p_id:req.params.id,p_version:input.version,p_payload:input.payload})));
  });
  app.post('/api/projects/:id/manage',authenticated,async (req,res) => {
    const input = schema.z.strictObject({version:schema.z.number().int().positive(),action:schema.z.enum(['rename','archive','duplicate','delete']),name:schema.z.string().max(160).optional()}).parse(req.body); schema.uuid.parse(req.params.id);
    res.json(check(await req.auth.db.rpc('norte_manage_project',{p_id:req.params.id,p_version:input.version,p_action:input.action,p_name:input.name || null})));
  });
  app.post('/api/projects/:id/choose',authenticated,async (req,res) => { schema.z.strictObject({}).parse(req.body); schema.uuid.parse(req.params.id); res.json(check(await req.auth.db.rpc('norte_choose_project',{p_id:req.params.id}))); });
  app.post('/api/trial',authenticated,async (req,res) => { schema.z.strictObject({}).parse(req.body); res.json(check(await req.auth.db.rpc('norte_activate_trial'))); });
  app.get('/api/projects/:id/export',authenticated,async (req,res) => { const project = await getProject(req); await audit(req,'project_export','ok',project.id); res.attachment('norte-projeto.json').json({schemaVersion:1,project}); });
  app.get('/api/projects/:id/versions',authenticated,async (req,res) => { await getProject(req); const e = check(await req.auth.db.rpc('norte_entitlements')); if (e.tier === 'essential') { throw new AppError('advanced_required',403); } res.json(check(await req.auth.db.from('norte_versions').select('version,payload,created_at').eq('project_id',req.params.id).order('version',{ascending:false}).limit(30))); });
  app.get('/api/projects/:id/sources',authenticated,async (req,res) => { await getProject(req); res.json(check(await req.auth.db.from('norte_source_adoptions').select('*').eq('project_id',req.params.id))); });
  app.post('/api/projects/:id/sources',authenticated,async (req,res) => { const input = schema.z.strictObject({sourceId:schema.id,decision:schema.z.enum(['confirmed','pending','not_applicable']),rationale:schema.z.string().min(1).max(4000),responsible:schema.short,version:schema.z.number().int().positive()}).parse(req.body); schema.uuid.parse(req.params.id); res.json(check(await req.auth.db.rpc('norte_adopt_source',{p_project:req.params.id,p_source:input.sourceId,p_decision:input.decision,p_rationale:input.rationale,p_responsible:input.responsible,p_version:input.version}))); });
  app.post('/api/projects/:id/access',authenticated,async (req,res) => { const input = schema.z.strictObject({userId:schema.uuid,scope:schema.z.enum(['read','review','revoke']),expires:schema.z.iso.datetime()}).parse(req.body); schema.uuid.parse(req.params.id); check(await req.auth.db.rpc('norte_project_access',{p_id:req.params.id,p_user:input.userId,p_scope:input.scope,p_expires:input.expires})); res.json({ok:true}); });
  app.post('/api/projects/:id/generate',authenticated,async (req,res) => {
    const input = schema.generation.parse(req.body); const project = await getProject(req);
    for (const id of input.documents) { model(project,id,templates); }
    const payload = {format:input.format,documents:[...new Set(input.documents)],...(input.review ? {review:input.review} : {})};
    const args = {p_id:project.id,p_version:input.version,p_key:input.key,p_input:payload,p_hash:hash(JSON.stringify(payload))};
    const job = check(await req.auth.db.rpc('norte_reserve_job',args)); res.status(202).json({id:job.id,status:job.status});
  });
  app.get('/api/projects/:id/jobs',authenticated,async (req,res) => { await getProject(req); res.json(check(await req.auth.db.from('norte_jobs').select(JOB_COLUMNS).eq('project_id',req.params.id).order('created_at',{ascending:false}).limit(100))); });
  app.get('/api/jobs/:id',authenticated,async (req,res) => { schema.uuid.parse(req.params.id); const job = check(await req.auth.db.from('norte_jobs').select(JOB_COLUMNS).eq('id',req.params.id).maybeSingle()); if (!job) { throw new AppError('not_found',404); } res.json(job); });
  app.get('/api/jobs/:id/download',authenticated,async (req,res) => {
    schema.uuid.parse(req.params.id); await limited(req,'download',120);
    const job = check(await req.auth.db.from('norte_jobs').select(JOB_COLUMNS).eq('id',req.params.id).eq('status','ready').maybeSingle());
    if (!job) { throw new AppError('not_found',404); }
    const internal = check(await gateway.service.from('norte_jobs').select('storage_path').eq('id',job.id).single());
    const file = check(await req.auth.db.storage.from('norte-projects').download(internal.storage_path));
    if (!check(await req.auth.db.rpc('norte_can_read',{p_id:job.project_id}))) { throw new AppError('not_found',404); }
    const bytes = Buffer.from(await file.arrayBuffer()); if (hash(bytes) !== job.sha256) { throw new AppError('file_integrity_failed',503); }
    await audit(req,'document_download','ok',job.project_id); sendBytes(req,res,bytes,job.mime,job.filename);
  });
  app.post('/api/projects/:id/uploads',authenticated,async (req,_res) => { await getProject(req); throw new AppError('upload_inspection_unavailable',503); });
  app.post('/api/help',async (req,res) => {
    const input = ai.helpInput.parse(req.body); await optionalSession(req); await limited(req,'help',40);
    let aiConfig = config;
    const controls = check(await gateway.service.from('norte_controls').select('ai_enabled').single());
    if (!controls.ai_enabled) { aiConfig = {...config,helpApproved:false}; }
    if (aiConfig.helpApproved && aiConfig.geminiKey) { try { res.json(await ai.withBudget(gateway,config,() => ai.help(input,aiConfig,fetcher))); } catch { res.json(await ai.help(input,{...config,helpApproved:false})); } } else { res.json(await ai.help(input,aiConfig,fetcher)); }
  });
  app.post('/api/projects/:id/analyse',authenticated,async (req,res) => {
    const input = schema.z.strictObject({version:schema.z.number().int().positive()}).parse(req.body); const project = await getProject(req); await limited(req,'analysis',10);
    if (project.version !== input.version) { throw new AppError('version_conflict',409); }
    const controls = check(await gateway.service.from('norte_controls').select('ai_enabled').single());
    if (!controls.ai_enabled) { throw new AppError('technical_ai_disabled',503); }
    const adoptions = check(await req.auth.db.from('norte_source_adoptions').select('source_id').eq('project_id',project.id).eq('decision','confirmed'));
    const sources = check(await req.auth.db.from('norte_sources').select('id').in('id',adoptions.map(item => item.source_id)).eq('ai_allowed',true).eq('checked',true).eq('suspended',false));
    const citations = check(await req.auth.db.from('norte_citations').select('*').in('source_id',sources.map(item => item.id)).eq('verified',true).limit(30));
    const result = await ai.withBudget(gateway,config,() => ai.analyse(project,citations,config,fetcher)); const freshProject = await getProject(req);
    const args = {p_id:project.id,p_version:project.version,p_model:config.requirementsModel,p_sources:sources.map(item => item.id),p_result:result,p_user:req.auth.user.id};
    const analysis = check(await gateway.service.rpc('norte_record_analysis',args)); await audit(req,'analysis_completed','ok',project.id); res.json({...analysis,stale:freshProject.version !== project.version});
  });
  app.get('/api/sources',async (req,res) => { await optionalSession(req); const db = req.auth?.db || gateway.fresh(); res.json(check(await db.from('norte_sources').select('*').order('code'))); });
  app.get('/api/sources/:id/citations',async (req,res) => { schema.id.parse(req.params.id); await optionalSession(req); const db = req.auth?.db || gateway.fresh(); const citations = check(await db.from('norte_citations').select('*').eq('source_id',req.params.id)); for (const citation of citations) { validateRects(citation.rects,citation.page_index); } res.json(citations); });
  app.get('/api/sources/:id/file',async (req,res) => {
    schema.id.parse(req.params.id); await optionalSession(req); await limited(req,'source',120); const db = req.auth?.db || gateway.fresh();
    if (!check(await db.rpc('norte_source_allowed',{p_id:req.params.id}))) { throw new AppError('source_not_authorized',403); }
    const source = check(await db.from('norte_sources').select('*').eq('id',req.params.id).single());
    if (!source.storage_path) { throw new AppError('source_original_pending',404); }
    const file = check(await gateway.service.storage.from('norte-sources').download(source.storage_path)); const bytes = Buffer.from(await file.arrayBuffer());
    if (hash(bytes) !== source.sha256) { await gateway.service.from('norte_sources').update({suspended:true}).eq('id',source.id); await audit(req,'source_integrity','failed'); throw new AppError('source_integrity_failed',503); }
    if (!check(await db.rpc('norte_source_allowed',{p_id:source.id}))) { throw new AppError('source_not_authorized',403); }
    sendBytes(req,res,bytes,'application/pdf',source.id + '.pdf',false);
  });
};
