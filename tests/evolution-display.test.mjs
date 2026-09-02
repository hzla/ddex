import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "..");

function loadPokemonPanel() {
  const context = {
    Dex: {
      species: {
        get(name) {
          return { exists: false, name };
        },
      },
      items: {
        get(name) {
          return { exists: true, name };
        },
      },
    },
    PokedexResultPanel: {
      extend(definition) {
        return definition;
      },
    },
  };

  vm.runInNewContext(
    fs.readFileSync(path.join(root, "js/pokedex-pokemon.js"), "utf8"),
    context,
  );
  return context.PokedexPokemonPanel;
}

function loadOverride(file) {
  const context = {};
  vm.runInNewContext(
    fs.readFileSync(path.join(root, "data/overrides", file), "utf8"),
    context,
  );
  return context.overrides;
}

const panel = loadPokemonPanel();

function formatBranch(evoSource, evoData) {
  return panel.getEvolutionBranchDisplay.call(panel, evoSource, 0, {}, evoData);
}

test("prefers named item-use methods over ROM-local numeric method IDs", () => {
  assert.equal(
    formatBranch({ evoMethods: ["Item Use"], evoMethodIds: [8] }, "Sun Stone"),
    "Sun Stone",
  );
  assert.equal(
    formatBranch({ evoMethods: ["useItem"], evoMethodIds: [19] }, "Water Stone"),
    "Water Stone",
  );
});

test("uses descriptive Gen 5 method names for shifted numeric IDs", () => {
  assert.equal(
    formatBranch(
      { evoMethods: ["Level Requirement + Atk Stat Greater Than Def"], evoMethodIds: [9] },
      20,
    ),
    "Lv 20 + Atk > Def",
  );
  assert.equal(
    formatBranch(
      { evoMethods: ["Level with Item + Day"], evoMethodIds: [19] },
      "Oval Stone",
    ),
    "Lv w/ Oval Stone During Day",
  );
  assert.equal(
    formatBranch({ evoMethods: ["After Learning Specific Move"], evoMethodIds: [21] }, "Mimic"),
    "Lv while knowing Mimic",
  );
});

test("keeps numeric-only special methods as a compatibility fallback", () => {
  assert.equal(
    formatBranch({ evoMethods: ["levelExtra"], evoMethodIds: [19] }, "Razor Fang"),
    "Lv w/ Razor Fang During Night",
  );
  assert.equal(formatBranch({ evoMethodIds: [29] }, 5), "K5");
  assert.equal(formatBranch({ evoMethodIds: [30] }, 6), "B6");
});

test("affected shipped overrides expose item use semantically", () => {
  const platinumKaizo = loadOverride("platinumkaizo.js");
  const cascadeWhiteDev = loadOverride("cascadewhitedev.js");
  const staryu = platinumKaizo.poks.STARYU;
  const petilil = cascadeWhiteDev.poks.Petilil;

  assert.equal(formatBranch(staryu, staryu.evoParams[0]), "Water Stone");
  assert.equal(formatBranch(petilil, petilil.evoParams[0]), "Sun Stone");
});
