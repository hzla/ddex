import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { resolveFireRedDeluxeSpecies } from "../rom/fire-red-deluxe.mjs";

function load(slug) {
  const scope = { exports: {} };
  for (const file of [`${slug}.js`, `${slug}_searchindex.js`]) {
    vm.runInNewContext(fs.readFileSync(new URL(`../data/overrides/${file}`, import.meta.url), "utf8"), scope);
  }
  return JSON.parse(JSON.stringify({ dex: scope.overrides, index: scope.exports }));
}

test("Fire Red Deluxe resolves shortened regional forms without conflating variants", () => {
  for (const [raw, expected] of [["corsola-g", "Corsola-Galar"], ["GROWLITHEH", "Growlithe-Hisui"],
    ["FARFETCHDG", "Farfetch’d-Galar"], ["TAUROS-PA", "Tauros-Paldea-Aqua"]]) {
    assert.equal(resolveFireRedDeluxeSpecies(raw), expected);
  }
  assert.equal(resolveFireRedDeluxeSpecies("Corsola"), "Corsola");
});

for (const [slug, count, moveCount] of [["frd", 403, 354], ["frdnormal", 393, 354]]) {
  const { dex, index } = load(slug);
  test(`${slug} exports ROM stats, regional forms and Gen 3 move categories`, () => {
    assert.equal(Object.keys(dex.poks).length, count);
    assert.equal(Object.keys(dex.moves).length, moveCount);
    assert.equal(dex.poks.Venusaur.bs.at, 87);
    assert.equal(dex.poks["Corsola-Galar"].bs.df, 150);
    assert.deepEqual(dex.poks["Growlithe-Hisui"].types, ["Fire", "Rock"]);
    assert.ok(dex.poks["Farfetch’d-Galar"]);
    assert.equal(dex.moves.Bite.cat, "Special");
    assert.equal(dex.moves["Shadow Ball"].cat, "Physical");
    assert.equal(dex.moves["Double Iron Bash"].multihit, null);
    assert.deepEqual(dex.moves.Fly.recoil, [25, 100]);
    if (slug === "frd") {
      assert.equal(dex.moves["Weather Ball (Water)"].t, "Water");
      assert.equal(dex.moves["Weather Ball (Water)"].pp, 10);
      assert.equal(dex.moves["Weather Ball (Fire)"].t, "Fire");
      assert.equal(dex.moves["Weather Ball"].t, "Normal");
    }
  });

  test(`${slug} encounters, evolutions and search entries reference exported data`, () => {
    const entries = new Set(index.BattleSearchIndex.map(([id, kind]) => `${id}:${kind}`));
    assert.equal(index.BattleSearchIndex.length, index.BattleSearchIndexOffset.length);
    for (const [name, species] of Object.entries(dex.poks)) {
      for (const target of species.evos || []) assert.ok(dex.poks[target], `${name} -> ${target}`);
      for (const [, move] of species.learnset_info.learnset) assert.ok(dex.moves[move], `${name}: ${move}`);
    }
    for (const [id, location] of Object.entries(dex.encs)) {
      if (id === "rates") continue;
      assert.ok(entries.has(`${id}:location`), id);
      assert.ok(!location.name.startsWith("Bank "), location.name);
      for (const [method, table] of Object.entries(location)) {
        if (method === "name") continue;
        assert.equal(table.encs.length, (table.rates || dex.encs.rates[method]).length, `${id}/${method}`);
        for (const slot of table.encs) assert.ok(dex.poks[slot.s], `${id}: ${slot.s}`);
      }
    }
    for (const id of ["corsolagalar", "growlithehisui", "farfetchdgalar"]) assert.ok(entries.has(`${id}:pokemon`), id);
  });
}
