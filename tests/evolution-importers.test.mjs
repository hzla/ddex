import assert from "node:assert/strict";
import test from "node:test";

import { evoToDdex } from "../rom/gen3-export/lib/gen3-exporter.mjs";
import {
  evolutionMethodName,
  formatEvolutionParam,
  mapEvoMethod,
} from "../rom/dspre_export.js";

const itemNames = [];
itemNames[10] = "Leaf Stone";
itemNames[11] = "Razor Claw";
const moveNames = [];
moveNames[20] = "Mimic";
const typeNames = [];
typeNames[2] = "Fairy";
const speciesNames = [];
speciesNames[30] = "Mantyke";

function mapGen3(method, arg = 0, extra = 0) {
  return evoToDdex(method, arg, extra, itemNames, moveNames, typeNames, speciesNames);
}

test("Gen 3 and expanded Gen 3 methods export stable semantic names", () => {
  assert.deepEqual(mapGen3("Stone", 10), ["useItem", "Leaf Stone"]);
  assert.deepEqual(mapGen3("Trade Item", 11), ["tradeItem", "Razor Claw"]);
  assert.deepEqual(mapGen3("Move Type", 2), ["levelMoveType", "Fairy"]);
  assert.deepEqual(mapGen3("Hold Item Night", 11), ["levelHoldNight", "Razor Claw"]);
  assert.deepEqual(mapGen3("Move Name", 20), ["levelMove", "Mimic"]);
  assert.deepEqual(mapGen3("Mon in Party", 30), ["levelParty", "Mantyke"]);
  assert.deepEqual(mapGen3("Item Location", 7, 4), ["itemLocation", "7:4"]);
  assert.deepEqual(mapGen3("Level High Attack", 20), ["levelAttackGreater", 20]);

  const expandedMethods = [
    "Rain Or Fog",
    "Move Type",
    "Type in Party",
    "Map",
    "Male",
    "Female",
    "Level Night",
    "Level Day",
    "Hold Item Night",
    "Hold Item Day",
    "Move Name",
    "Mon in Party",
    "Level Time Range",
    "Flag Set",
    "3 Critical Hits In One Battle",
    "Nature High",
    "Nature Low",
    "Damage Location",
    "Item Location",
    "Gigantamax",
    "Mega",
  ];
  for (const method of expandedMethods) {
    assert.notEqual(mapGen3(method, 2, 4)[0], "levelExtra", `${method} lost its semantics`);
  }
});

test("vanilla Gen 4 and HG-Engine IDs resolve through separate method tables", () => {
  assert.equal(evolutionMethodName(8), "Atk_Greater_Def");
  assert.equal(evolutionMethodName(27), "Loc_MossRock");
  assert.equal(evolutionMethodName(27, { hgEngine: true }), "LevelingUp_Day");
  assert.equal(evolutionMethodName(29, { hgEngine: true }), "LevelingUp_Dusk");
  assert.equal(evolutionMethodName(31, { hgEngine: true }), "KnowsMoveType");
  assert.equal(evolutionMethodName(36, { hgEngine: true }), "CriticalHits");
  assert.equal(evolutionMethodName(37, { hgEngine: true }), "DamageTaken");
  assert.equal(
    formatEvolutionParam("KnowsMoveType", 2, { typeNames }),
    "Fairy",
  );
});

test("DS exporter preserves each evolution condition as a semantic method", () => {
  assert.equal(mapEvoMethod("Item"), "useItem");
  assert.equal(mapEvoMethod("Trade_HeldItem"), "tradeItem");
  assert.equal(mapEvoMethod("Atk_Greater_Def"), "levelAttackGreater");
  assert.equal(mapEvoMethod("LevelingUp_Female"), "levelFemale");
  assert.equal(mapEvoMethod("KnowsMoveType"), "levelMoveType");
  assert.equal(mapEvoMethod("PartyType_Dark"), "levelDarkParty");
  assert.equal(mapEvoMethod("LevelingUp_Dusk"), "levelDusk");
  assert.equal(mapEvoMethod("CriticalHits"), "criticalHits");
  assert.equal(mapEvoMethod("DamageTaken"), "damageTaken");
});
