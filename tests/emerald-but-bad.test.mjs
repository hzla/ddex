import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const scope = { exports: {} };
for (const file of ["badem.js", "badem_searchindex.js"]) {
  vm.runInNewContext(fs.readFileSync(new URL(`../data/overrides/${file}`, import.meta.url), "utf8"), scope);
}
const dex = JSON.parse(JSON.stringify(scope.overrides));
const index = JSON.parse(JSON.stringify(scope.exports));
const toId = value => value.toLowerCase().replace(/[^a-z0-9]/g, "");

test("Emerald but Bad 1.0.8.3 has updated stats, evolutions and learnsets", () => {
  assert.equal(scope.hideEffectIds, true);
  assert.equal(dex.poks.Mightyena.bs.hp, 90);
  for (const [species, evolution] of [["Omanyte", "Omastar"], ["Kabuto", "Kabutops"]]) {
    assert.deepEqual(dex.poks[species].evos, [evolution]);
    assert.deepEqual(dex.poks[species].evoMethods, ["level"]);
    assert.deepEqual(dex.poks[species].evoParams, [33]);
  }
  for (const [species, level, move] of [["Spinarak", 6, "HP Bug"], ["Shiftry", 1, "Night Daze"]]) {
    assert.ok(dex.poks[species].learnset_info.learnset.some(([l, m]) => l === level && m === move));
    assert.ok(dex.moves[move], move);
  }
});

test("Emerald but Bad 1.0.8.3 has updated grass and Rock Smash encounters", () => {
  assert.equal(dex.encs.granitecave.grass.encs[0].s, "Makuhita");
  assert.equal(dex.encs.route118.grass.encs[1].s, "Forretress");
  assert.equal(dex.encs.route118.grass.encs[6].s, "Venomoth");
  assert.equal(dex.encs.magmahideout.grass.encs[2].s, "Rhydon");
  assert.equal(dex.encs.magmahideoutsection2.grass.encs[2].s, "Miltank");
  assert.equal(dex.encs.magmahideoutsection7.grass.encs[2].s, "Typhlosion");
  for (const [location, species, level] of [
    ["rusturftunnel", "Onix", 10],
    ["granitecave", "Nosepass", 10],
    ["magmahideout", "Rhydon", 30],
    ["magmahideoutsection2", "Dunsparce", 30],
  ]) {
    const encounters = dex.encs[location].rock_smash.encs;
    assert.equal(encounters.length, 5);
    assert.deepEqual(encounters[1], { s: species, mn: level, mx: level });
  }
});

test("Emerald but Bad encounters and search index remain internally consistent", () => {
  const entries = new Set(index.BattleSearchIndex.map(([id, kind]) => `${id}:${kind}`));
  assert.equal(index.BattleSearchIndex.length, index.BattleSearchIndexOffset.length);
  for (const name of Object.keys(dex.poks)) {
    if (name === "?") continue;
    assert.ok(entries.has(`${toId(name)}:pokemon`), name);
  }
  let slots = 0;
  for (const [id, location] of Object.entries(dex.encs)) {
    if (id === "rates") continue;
    assert.ok(entries.has(`${id}:location`), id);
    for (const [method, table] of Object.entries(location)) {
      if (method === "name") continue;
      const rates = table.rates || dex.encs.rates[method];
      assert.equal(table.encs.length, rates.length, `${id}/${method}`);
      const total = rates.reduce((sum, rate) => sum + rate, 0);
      assert.ok(rates.every(rate => rate > 0 && rate <= 100), `${id}/${method}`);
      // Filtered empty ROM slots keep their original rates without renormalizing.
      if (table.rates) assert.ok(total > 0 && total <= 100, `${id}/${method}`);
      else assert.equal(total, 100, `${id}/${method}`);
      for (const slot of table.encs) {
        assert.ok(dex.poks[slot.s], `${id}/${method}: ${slot.s}`);
        assert.ok(slot.mn > 0 && slot.mx >= slot.mn, `${id}/${method}: ${slot.s}`);
        slots++;
      }
    }
  }
  assert.equal(Object.keys(dex.encs).length - 1, 136);
  assert.equal(slots, 2238);
});
