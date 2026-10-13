const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createClient} = require('@supabase/supabase-js');
const {help} = require('../../server/ai.cjs');
const enabled = process.env.RUN_REAL_INTEGRATIONS === 'true';
test('Supabase real: autenticação e RLS entre duas contas sintéticas',{skip:!enabled},async () => {
  const env = process.env; assert.equal(env.REAL_TEST_ACK,new URL(env.SUPABASE_URL).hostname,'Confirme explicitamente o host isolado em REAL_TEST_ACK.');
  const a = createClient(env.SUPABASE_URL,env.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false}}); const b = createClient(env.SUPABASE_URL,env.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false}});
  const loginA = await a.auth.signInWithPassword({email:env.TEST_USER_A_EMAIL,password:env.TEST_USER_A_PASSWORD}); const loginB = await b.auth.signInWithPassword({email:env.TEST_USER_B_EMAIL,password:env.TEST_USER_B_PASSWORD});
  assert.ifError(loginA.error); assert.ifError(loginB.error); assert.notEqual(loginA.data.user.id,loginB.data.user.id);
  let project;
  try {
    const payload = {requirements:[],verifications:[],engineering:{profile:'NASA',start:'2026-10-12'},settings:{},lifecycle:{}};
    const created = await a.rpc('norte_create_project',{p_name:'Teste sintético de integração',p_type:'software',p_profile:'NASA',p_start:'2026-10-12',p_payload:payload}); assert.ifError(created.error); project = created.data;
    const read = await b.from('norte_projects').select('id,payload').eq('id',project.id); assert.ifError(read.error); assert.deepEqual(read.data,[]);
    const write = await b.rpc('norte_save_project',{p_id:project.id,p_version:project.version,p_payload:payload}); assert.ok(write.error);
    const permission = await b.rpc('norte_can_read',{p_id:project.id}); assert.equal(permission.data,false);
    const buckets = await b.storage.from('norte-projects').list(loginA.data.user.id); assert.ok(buckets.error || !buckets.data.length);
  } finally { if (project) { const removed = await a.rpc('norte_manage_project',{p_id:project.id,p_version:project.version,p_action:'delete',p_name:project.name}); assert.ifError(removed.error); } await a.auth.signOut(); await b.auth.signOut(); }
});
test('Gemini real opcional: uma chamada de ajuda pública',{skip:process.env.RUN_REAL_GEMINI !== 'true'},async () => { const result = await help({topic:'navigation'},{helpApproved:true,geminiKey:process.env.GEMINI_API_KEY,geminiModel:process.env.GEMINI_MODEL}); assert.equal(result.mode,'gemini'); console.log(JSON.stringify({provider:'Gemini',model:result.model,attempts:1,case:'public-help-navigation',temperature:0})); });
