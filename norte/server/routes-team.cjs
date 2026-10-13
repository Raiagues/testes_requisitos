const schema = require('./schemas.cjs');
const {AppError,check} = require('./errors.cjs');
const {model} = require('./documents.cjs');
const {mergeChanges} = require('./changes.cjs');
const {z,uuid,id} = schema;
const version = z.number().int().positive();
const grant = {role:z.enum(['viewer','editor','reviewer']),scope:z.enum(['project','documents']),documents:z.record(id,z.enum(['view','edit'])),expires:z.iso.datetime()};
module.exports = function teamRoutes(app,h) {
  const {authenticated,limited,getProject,templates} = h;
  app.get('/api/invitations',authenticated,async (req,res) => res.json(check(await req.auth.db.rpc('norte_invitations'))));
  app.post('/api/invitations/:id',authenticated,async (req,res) => { uuid.parse(req.params.id); const input = z.strictObject({accept:z.boolean()}).parse(req.body); await limited(req,'invitation-reply',30); res.json(check(await req.auth.db.rpc('norte_invitation_reply',{p_id:req.params.id,p_accept:input.accept}))); });
  app.get('/api/projects/:id/team',authenticated,async (req,res) => { uuid.parse(req.params.id); res.json(check(await req.auth.db.rpc('norte_team',{p_id:req.params.id}))); });
  app.post('/api/projects/:id/team',authenticated,async (req,res) => {
    uuid.parse(req.params.id);
    const input = z.discriminatedUnion('action',[
      z.strictObject({action:z.literal('invite'),version,email:z.email().max(200),...grant}),
      z.strictObject({action:z.literal('update'),version,userId:uuid,...grant}),
      z.strictObject({action:z.literal('revoke'),version,userId:uuid}),
      z.strictObject({action:z.literal('cancel'),version,invitationId:uuid}),
      z.strictObject({action:z.literal('protection'),version,required:z.boolean()})
    ]).parse(req.body);
    await limited(req,'team-write',60); const {action,...data} = input;
    res.json(check(await req.auth.db.rpc('norte_team',{p_id:req.params.id,p_action:action,p_input:data})));
  });
  app.post('/api/projects/:id/presence',authenticated,async (req,res) => {
    uuid.parse(req.params.id);
    const input = z.strictObject({tabId:uuid,module:z.enum(['requirements','verification','documents','schedule','team','changes']),editing:z.string().max(60).default(''),leave:z.boolean().default(false)}).parse(req.body);
    res.json(check(await req.auth.db.rpc('norte_presence',{p_id:req.params.id,p_tab:input.tabId,p_module:input.module,p_editing:input.editing,p_leave:input.leave})));
  });
  app.get('/api/projects/:id/documents/:document',authenticated,async (req,res) => {
    uuid.parse(req.params.id); id.parse(req.params.document);
    const project = check(await req.auth.db.rpc('norte_document_snapshot',{p_id:req.params.id,p_document:req.params.document}));
    res.json({projectVersion:project.version,document:model(project,req.params.document,templates)});
  });
  app.get('/api/projects/:id/changes',authenticated,async (req,res) => { uuid.parse(req.params.id); res.json(check(await req.auth.db.rpc('norte_changes',{p_id:req.params.id}))); });
  app.get('/api/projects/:id/changes/:change',authenticated,async (req,res) => { uuid.parse(req.params.id); uuid.parse(req.params.change); res.json(check(await req.auth.db.rpc('norte_changes',{p_id:req.params.id,p_change:req.params.change}))); });
  app.put('/api/projects/:id/draft',authenticated,async (req,res) => {
    uuid.parse(req.params.id);
    const input = z.strictObject({changeId:uuid.nullable(),revision:z.number().int().min(0),version,documentId:id.optional(),payload:z.unknown()}).parse(req.body);
    const payload = input.documentId ? z.strictObject({body:z.string().max(20000)}).parse(input.payload) : schema.payload.parse(input.payload);
    await limited(req,'draft',240);
    res.json(check(await req.auth.db.rpc('norte_change_save',{p_id:req.params.id,p_change:input.changeId,p_revision:input.revision,p_version:input.version,p_payload:payload,p_document:input.documentId || null})));
  });
  app.post('/api/projects/:id/changes/:change',authenticated,async (req,res) => {
    uuid.parse(req.params.id); uuid.parse(req.params.change);
    const input = z.discriminatedUnion('action',[
      z.strictObject({action:z.literal('submit'),revision:version,title:z.string().trim().min(3).max(160),description:z.string().max(4000).default('')}),
      z.strictObject({action:z.literal('review'),revision:version,decision:z.enum(['approve','request_changes','comment']),comment:z.string().max(4000).default('')}),
      z.strictObject({action:z.literal('merge'),revision:version}),z.strictObject({action:z.literal('close'),revision:version})
    ]).parse(req.body);
    const {action,revision,...data} = input; await limited(req,'changes',120);
    res.json(check(await req.auth.db.rpc('norte_change_action',{p_id:req.params.id,p_change:req.params.change,p_revision:revision,p_action:action,p_input:data})));
  });
  app.post('/api/projects/:id/changes/:change/rebase',authenticated,async (req,res) => {
    uuid.parse(req.params.id); uuid.parse(req.params.change);
    await limited(req,'change-rebase',120);
    const input = z.strictObject({revision:version,version,pending:z.unknown().optional(),resolutions:z.array(z.strictObject({path:z.string().max(1000),choice:z.enum(['mine','current'])})).max(500).default([])}).parse(req.body);
    const change = check(await req.auth.db.rpc('norte_changes',{p_id:req.params.id,p_change:req.params.change}));
    if (change.authorId !== req.auth.user.id) { throw new AppError('not_found',404); }
    const project = await getProject(req);
    if (change.revision !== input.revision || project.version !== input.version) { throw new AppError('version_conflict',409); }
    const current = change.documentId ? project.payload.engineering.customDocs.find(doc => doc.id === change.documentId) : project.payload;
    const mine = input.pending === undefined ? change.after : change.documentId ? {...change.after,...z.strictObject({body:z.string().max(20000)}).parse(input.pending)} : schema.payload.parse(input.pending);
    const result = mergeChanges(change.before,mine,current,input.resolutions);
    if (result.invalidResolutions) { throw new AppError('invalid_input',422); }
    if (result.conflicts.length) { res.json({merged:false,conflicts:result.conflicts,version:project.version,revision:change.revision}); return; }
    if (!result.payload) { throw new AppError('document_removed',409); }
    const payload = change.documentId ? {body:result.payload.body || ''} : schema.payload.parse(result.payload);
    const saved = check(await req.auth.db.rpc('norte_change_save',{p_id:project.id,p_change:change.id,p_revision:change.revision,p_version:project.version,p_payload:payload,p_document:change.documentId || null}));
    res.json({merged:true,change:saved});
  });
};
