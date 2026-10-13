const {test} = require('node:test');
const assert = require('node:assert/strict');
const {mergeChanges} = require('../server/changes.cjs');
test('edições independentes combinam por campo e identificador, sem perder inclusão ou remoção',() => {
  const base={requirements:[{id:'A',text:'a',owner:'Equipe'},{id:'B',text:'b'}],settings:{trace:true}};
  const mine=structuredClone(base); mine.requirements[0].text='a revisado'; mine.requirements.push({id:'C',text:'c'});
  const current=structuredClone(base); current.requirements[0].owner='Revisão'; current.requirements=current.requirements.filter(r=>r.id!=='B');
  const result=mergeChanges(base,mine,current); assert.deepEqual(result.conflicts,[]); assert.deepEqual(result.payload.requirements,[{id:'A',text:'a revisado',owner:'Revisão'},{id:'C',text:'c'}]); assert.equal(base.requirements[0].text,'a');
});
test('edição no mesmo campo, remoção concorrente e escolhas fora do diff não passam silenciosamente',() => {
  const base={items:[{id:'A',body:'original'}]}; const mine={items:[{id:'A',body:'meu'}]}; const current={items:[{id:'A',body:'outro'}]};
  const result=mergeChanges(base,mine,current); assert.deepEqual(result.conflicts,[{path:'/items/A/body',before:'original',mine:'meu',current:'outro'}]);
  assert.equal(mergeChanges(base,mine,current,[{path:'/items/A/body',choice:'mine'}]).payload.items[0].body,'meu');
  assert.equal(mergeChanges(base,mine,current,[{path:'/items/A/body',choice:'current'}]).payload.items[0].body,'outro');
  assert.equal(mergeChanges(base,mine,{items:[]}).conflicts.length,1);
  assert.equal(mergeChanges(base,mine,current,[{path:'/owner_id',choice:'mine'}]).invalidResolutions,true);
});
