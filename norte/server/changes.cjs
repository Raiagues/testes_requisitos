const {isDeepStrictEqual:equal} = require('node:util');

// Combina alterações independentes. Um conflito exige uma escolha explícita
// sobre os valores comparados; nada é resolvido por IA ou pela ordem de chegada.
function mergeChanges(base,mine,current,resolutions = []) {
  const choices = new Map(resolutions.map(item => [item.path,item.choice]));
  const conflicts = []; const used = new Set();
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  function walk(before,ours,theirs,path) {
    if (equal(ours,before)) { return theirs; }
    if (equal(theirs,before) || equal(ours,theirs)) { return ours; }
    if ([before,ours,theirs].every(object)) {
      return Object.fromEntries([...new Set([...Object.keys(before),...Object.keys(ours),...Object.keys(theirs)])].map(key => [key,walk(before[key],ours[key],theirs[key],path + '/' + key.replaceAll('~','~0').replaceAll('/','~1'))]).filter(([,value]) => value !== undefined));
    }
    const identified = rows => Array.isArray(rows) && rows.every(item => object(item) && typeof item.id === 'string') && new Set(rows.map(item => item.id)).size === rows.length;
    if ([before,ours,theirs].every(identified)) {
      const maps = [before,ours,theirs].map(rows => new Map(rows.map(item => [item.id,item])));
      return [...new Set([...theirs.map(item => item.id),...ours.map(item => item.id),...before.map(item => item.id)])].map(id => walk(maps[0].get(id),maps[1].get(id),maps[2].get(id),path + '/' + id)).filter(value => value !== undefined);
    }
    if (choices.has(path)) { used.add(path); return choices.get(path) === 'mine' ? ours : theirs; }
    conflicts.push({path,before:before ?? null,mine:ours ?? null,current:theirs ?? null}); return theirs;
  }
  const payload = walk(base,mine,current,'');
  return {payload,conflicts,invalidResolutions:[...choices.keys()].some(key => !used.has(key))};
}
module.exports = {mergeChanges};
