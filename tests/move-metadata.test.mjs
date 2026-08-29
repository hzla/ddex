import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "..");

function sourceBetween(file, startMarker, endMarker) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return source.slice(start, end);
}

test("formats Showdown move fractions as percentages", () => {
  const context = {};
  vm.runInNewContext(
    sourceBetween(
      "js/pokedex-moves.js",
      "function formatMoveFractionPercent",
      "var PokedexMovePanel",
    ),
    context,
  );

  assert.equal(context.formatMoveFractionPercent([1, 4]), "25%");
  assert.equal(context.formatMoveFractionPercent([1, 2]), "50%");
  assert.equal(context.formatMoveFractionPercent([33, 100]), "33%");
  assert.equal(context.formatMoveFractionPercent([1, 3]), "33.33%");
  assert.equal(context.formatMoveFractionPercent([0, 1]), null);
});

test("move overrides replace supplied metadata and preserve omitted vanilla values", () => {
  const context = {
    BattleMovedex: {
      takedown: {
        name: "Take Down",
        critRatio: 2,
        recoil: [1, 4],
        heal: [1, 2],
      },
    },
    cleanString(value) {
      return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
    },
  };
  vm.runInNewContext(
    sourceBetween(
      "js/overrides.js",
      "function copyOptionalMoveOverrideFields",
      "function overrideMonData",
    ),
    context,
  );

  context.overrideMoveData({
    "Take Down": {
      t: "Normal",
      bp: 90,
      cat: "Physical",
      pp: 20,
      acc: 100,
      prio: 0,
      desc: "Test move",
      recoil: [1, 3],
      critRatio: 3,
    },
  });

  assert.deepEqual(Array.from(context.BattleMovedex.takedown.recoil), [1, 3]);
  assert.equal(context.BattleMovedex.takedown.critRatio, 3);
  assert.deepEqual(Array.from(context.BattleMovedex.takedown.heal), [1, 2]);
});
