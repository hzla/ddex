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

function formatBranch(evoSource, evoData, branchIndex = 0) {
  return panel.getEvolutionBranchDisplay.call(panel, evoSource, branchIndex, {}, evoData);
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

test("keeps method names authoritative and numeric-only IDs as a compatibility fallback", () => {
  assert.equal(
    formatBranch({ evoMethods: ["levelExtra"], evoMethodIds: [19] }, "Razor Fang"),
    "Razor Fang",
  );
  assert.equal(
    formatBranch({ evoMethodIds: [19] }, "Razor Fang"),
    "Lv w/ Razor Fang During Night",
  );
  assert.equal(formatBranch({ evoMethods: ["level"], evoMethodIds: [22] }, 35), "L35");
  assert.equal(formatBranch({ evoMethodIds: [8] }, 20), "Lv 20 + Atk > Def");
  assert.equal(formatBranch({ evoMethodIds: [10] }, 20), "Lv 20 + Atk < Def");
  assert.equal(formatBranch({ evoMethodIds: [29] }, 5), "K5");
  assert.equal(formatBranch({ evoMethodIds: [30] }, 6), "B6");
});

test("formats canonical cross-generation methods without consulting IDs", () => {
  assert.equal(formatBranch({ evoMethods: ["trade"] }, ""), "Trade");
  assert.equal(formatBranch({ evoMethods: ["tradeItem"] }, "Metal Coat"), "Trade holding Metal Coat");
  assert.equal(formatBranch({ evoMethods: ["levelFriendshipNight"] }, ""), "Max Happiness During Night");
  assert.equal(formatBranch({ evoMethods: ["levelMoveType"] }, "Fairy"), "Lv while knowing a Fairy-type move");
  assert.equal(formatBranch({ evoMethods: ["criticalHits"], evoMethodIds: [36] }, 3), "3 Critical Hits in One Battle");
  assert.equal(formatBranch({ evoMethods: ["damageTaken"], evoMethodIds: [37] }, 49), "Take 49 Damage in Battle");
});

test("affected shipped overrides expose item use semantically", () => {
  const platinumKaizo = loadOverride("platinumkaizo.js");
  const cascadeWhiteDev = loadOverride("cascadewhitedev.js");
  const staryu = platinumKaizo.poks.STARYU;
  const petilil = cascadeWhiteDev.poks.Petilil;

  assert.equal(formatBranch(staryu, staryu.evoParams[0]), "Water Stone");
  assert.equal(formatBranch(petilil, petilil.evoParams[0]), "Sun Stone");
});

test("all shipped override evolution arrays stay aligned and named methods are recognized", () => {
  const overrideDir = path.join(root, "data", "overrides");
  const files = fs.readdirSync(overrideDir).filter((file) =>
    file.endsWith(".js") && !file.includes("searchindex") && !file.includes("customdesc")
  );

  for (const file of files) {
    const override = loadOverride(file);
    for (const [speciesName, species] of Object.entries(override?.poks || {})) {
      if (!Array.isArray(species.evos)) continue;
      for (const field of ["evoMethods", "evoMethodIds", "evoParams"]) {
        if (!Array.isArray(species[field])) continue;
        assert.equal(
          species[field].length,
          species.evos.length,
          `${file}:${speciesName} has a misaligned ${field}`,
        );
      }

      for (let index = 0; index < species.evos.length; index += 1) {
        const method = species.evoMethods?.[index];
        if (!method) continue;
        const displayValue = panel.normalizeEvolutionDisplayValue.call(
          panel,
          species.evoParams?.[index] ?? "",
        );
        assert.notEqual(
          panel.formatNamedEvolutionBranchDisplay.call(panel, method, displayValue),
          null,
          `${file}:${speciesName} uses unrecognized evolution method ${method}`,
        );

        if (["item", "item use", "useitem"].includes(String(method).toLowerCase())) {
          assert.equal(
            formatBranch(species, species.evoParams?.[index] ?? "", index),
            String(displayValue),
            `${file}:${speciesName} adds an extra condition to direct item use`,
          );
        }
      }
    }
  }
});
