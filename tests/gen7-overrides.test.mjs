import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
const root=path.resolve(import.meta.dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const ctx={};vm.runInNewContext(read('data/overrides/photonicsun.js'),ctx);
const dex=ctx.overrides;

test('Photonic Sun exports patched species, moves, TM compatibility and descriptions',()=>{
  assert.equal(dex.poks.Blastoise.bs.at,73);
  assert.deepEqual(Array.from(dex.poks.Arbok.types),['Poison','Dark']);
  assert.equal(dex.poks.Bulbasaur.heightm,0.7);
  assert.equal(dex.poks['Gardevoir-Mega'].abs[0],'Pixilate');
  assert.equal(dex.moves.Absorb.bp,35);
  assert.equal(dex.moves['Draining Kiss'].bp,75);
  assert.equal(dex.moves['Draining Kiss'].drain[0]/dex.moves['Draining Kiss'].drain[1],0.5);
  assert.ok(dex.poks.Furfrou.learnset_info.tms.includes('Rock Climb'));
  assert.ok(!dex.poks['Furfrou-Heart'].learnset_info.tms.includes('Rock Climb'));
  assert.match(dex.abilities.overgrow.desc,/Grass-type/);
});

test('actual override merger preserves Gen 7 levels, egg moves, weights and accents',()=>{
  const source=read('js/overrides.js');
  const runtime={BattlePokedex:{},BattleLearnsets:{},unrecognizedPoks:{},truncatedSpeciesNames:{}};
  vm.runInNewContext(source.slice(source.indexOf('function overrideMonData('),source.indexOf('function checkAndLoadScript(')),runtime);
  runtime.overrideMonData(dex.poks);
  assert.equal(runtime.BattlePokedex.flabebe.name,'Flabébé');
  assert.equal(runtime.BattlePokedex.bulbasaur.heightm,0.7);
  assert.equal(runtime.BattlePokedex.bulbasaur.weightkg,6.9);
  assert.ok(runtime.BattleLearnsets.bulbasaur.learnset.petaldance.includes('E'));
  assert.equal(runtime.BattlePokedex.cosmoem.evoLevels[0],53);
  assert.equal(runtime.BattlePokedex.rockruffowntempo.num,744);
});

test('encounter rates stay aligned and species/learnsets/evolutions reference exported records',()=>{
  const moves=new Set(Object.keys(dex.moves));
  for(const [name,p] of Object.entries(dex.poks)){
    for(const next of p.evos||[]) assert.ok(dex.poks[next],`${name} -> ${next}`);
    for(const m of [...p.learnset_info.learnset.map(x=>x[1]),...p.learnset_info.tms,...p.learnset_info.tutors,...p.learnset_info.eggMoves]) assert.ok(moves.has(m),`${name}: ${m}`);
  }
  assert.equal(Object.keys(dex.encs).length-1,74);
  for(const [key,loc] of Object.entries(dex.encs)){
    if(key==='rates')continue;
    for(const [method,group] of Object.entries(loc)){
      if(method==='name')continue;
      assert.equal(group.rates.length,group.encs.length);
      assert.equal(group.rates.reduce((a,b)=>a+b,0),100,`${key}/${method}`);
      for(const e of group.encs){assert.ok(dex.poks[e.s],e.s);assert.ok(e.mn>0&&e.mx>=e.mn);}
    }
  }
});

test('Gen 7 source alias and search index link exported forms',()=>{
  const c={exports:{}};vm.runInNewContext(read('data/overrides/photonicsun_searchindex.js'),c);
  const entries=c.exports.BattleSearchIndex;
  for(const id of ['rockruffowntempo','zygarde10powerconstruct','area0'])assert.ok(entries.some(e=>e[0]===id),id);
  assert.equal(entries.length,c.exports.BattleSearchIndexOffset.length);
  assert.match(read('js/overrides.js'),/"pspm": "photonicsun"/);
});
