import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { deflateRawSync } from "node:zlib";
import test from "node:test";
import { buildPixelmonImport, pixelmonArchivePath } from "../rom/pixelmon-import.mjs";
import { normalizePixelmonCalcSetNames } from "../rom/pixelmon-set-names.mjs";

const entry = (name, data) => ({ name, text: JSON.stringify(data) });
function fixture(prefix = "data/pixelmon/") {
  return [
    entry(prefix + "species/006_charizard.json", { name: "Charizard", dex: 6, forms: [
      { name: "base", battleStats: { hp: 88, attack: 84, defense: 78, specialAttack: 109, specialDefense: 85, speed: 100 }, types: ["FIRE", "FLYING"], weight: 90.5, abilities: { abilities: ["Blaze"], hiddenAbilities: ["SolarPower"] }, moves: { levelUpMoves: [{ level: 0, attacks: ["Scratch"] }, { level: 36, attacks: ["Flamethrower"] }], tmMoves9: ["Protect"], tmMoves8: ["Toxic"], eggMoves: ["Dragon Rush"] } },
      { name: "megax", battleStats: { attack: 150 }, types: ["FIRE", "DRAGON"], abilities: { abilities: ["ToughClaws"] } },
    ] }),
    entry(prefix + "moves/flamethrower.json", { attackName: "Flamethrower", attackIndex: 51, attackType: "FIRE", attackCategory: "SPECIAL", basePower: 120, ppBase: 15, accuracy: 100, makesContact: false, effects: [{ effectTypeID: "Burn", modifiers: [{ type: "Chance", value: 20 }] }] }),
    entry(prefix + "moves/quick_attack.json", { attackName: "Quick Attack", attackType: "NORMAL", attackCategory: "PHYSICAL", basePower: 40, ppBase: 30, accuracy: 100, makesContact: true, effects: [{ effectTypeID: "Priority", priority: 2 }] }),
    entry(prefix + "pixelmon/npc/preset/battle/leader/gym/fire_1.json", { names: { values: ["Pyra"] }, party: { value: { type: "pixelmon:spec", specs: ["Charizard form:megax lvl:70 ability:toughclaws helditem:life_orb nature:adamant ivhp:31 ivatk:0 evatk:252 evspd:252 move1:flamethrower"] } } }),
    entry(prefix + "pixelmon/npc/preset/trainers/youngster.json", { party: { value: { type: "pixelmon:random_combination", options: ["Charizard"], min_selections: 1, max_selections: 3 } } }),
    entry(prefix + "spawning/standard/charizard.set.json", { spawnInfos: [{ typeID: "pokemon", spec: "species:Charizard", minLevel: 36, maxLevel: 50, rarity: 10, condition: { biomes: ["#pixelmon:spawning/forests"], times: ["DAY"] }, stringLocationTypes: ["Air"] }] }),
  ];
}

test("imports edited stats and powers, sparse forms, learnsets and canonical ability names", () => {
  const result = buildPixelmonImport(fixture());
  assert.equal(result.overrides.poks.Charizard.bs.hp, 88);
  assert.equal(result.backupData.poks["Charizard-Mega-X"].bs.at, 150);
  assert.equal(result.backupData.poks["Charizard-Mega-X"].bs.hp, 88);
  assert.equal(result.overrides.poks.Charizard.abs[2], "Solar Power");
  assert.equal(result.overrides.poks["Charizard-Mega-X"].abs[2], "");
  assert.equal(result.overrides.moves.Flamethrower.bp, 120);
  assert.equal(result.backupData.moves.Flamethrower.basePower, 120);
  assert.equal(result.backupData.moves["Quick Attack"].priority, 2);
  assert.equal(result.overrides.moves.Flamethrower.flags.contact, 0);
  assert.deepEqual(result.overrides.poks.Charizard.learnset_info.eggMoves, ["Dragon Rush"]);
  assert.deepEqual(result.overrides.poks.Charizard.learnset_info.tms, ["Protect", "Toxic"]);
  assert.ok(result.searchIndex.some(([id, type]) => id === "charizardmegax" && type === "pokemon"));
});

test("maps spread targeting and clears omitted damage flags from vanilla moves", () => {
  const files = fixture();
  const move = { attackName: "Rock Slide", attackType: "ROCK", attackCategory: "PHYSICAL", basePower: 75, ppBase: 10, accuracy: 90, targetingInfo: { hitsAll: true, hitsAdjacentAlly: false } };
  files.push(entry("data/pixelmon/moves/rock_slide.json", move));
  files.push(entry("data/pixelmon/moves/earthquake.json", { ...move, attackName: "Earthquake", targetingInfo: { hitsAll: true, hitsAdjacentAlly: true } }));
  files.push(entry("data/pixelmon/moves/bite.json", { ...move, attackName: "Bite", targetingInfo: { hitsAll: false, hitsOppositeFoe: true }, flags: {} }));
  const result = buildPixelmonImport(files);
  assert.equal(result.backupData.moves["Rock Slide"].target, "allAdjacentFoes");
  assert.equal(result.backupData.moves.Earthquake.target, "allAdjacent");
  assert.equal(result.backupData.moves.Bite.target, "normal");
  assert.equal(result.backupData.moves.Bite.flags.bite, 0);
  assert.equal(result.backupData.moves.Bite.isBite, false);
});

test("preserves fixed trainer sets and labels random pools without inventing levels", () => {
  const result = buildPixelmonImport(fixture());
  assert.equal(result.summary.trainers, 2);
  const set = result.trainers[0].pokemon[0].set;
  assert.equal(set.level, 70);
  assert.equal(set.ability, "Tough Claws");
  assert.equal(set.item, "Life Orb");
  assert.equal(set.ivs.at, 0);
  assert.equal(set.evs.sp, 252);
  assert.deepEqual(set.moves, ["Flamethrower"]);
  assert.equal(result.trainers[1].random, true);
  assert.equal(result.trainers[1].max, 3);
  assert.equal(result.trainers[1].pokemon[0].set.level, undefined);
  assert.equal(result.trainers[1].pokemon[0].set.moves, undefined);
  const [label, fallback] = Object.entries(result.backupData.formatted_sets.Charizard)[0];
  assert.equal(label, "Lvl 100 Youngster #1");
  assert.deepEqual(Object.keys(result.backupData.formatted_sets["Charizard-Mega-X"]), ["Lvl 70 Pyra #1"]);
  assert.equal(fallback.pixelmonRandomPool, true);
  assert.equal(fallback.pixelmonTrainerName, "Youngster");
  assert.equal(fallback.level, 100);
  assert.equal(fallback.pixelmonUnspecifiedLevel, true);
  assert.deepEqual(fallback.moves, []);
});

test("migrates cached set labels without delimiters or losing duplicate trainer presets", () => {
  const result = {
    trainers: [{ id: 1, name: "Aliene (battle/trainer/gym/dragon_1)", random: false }, { id: 2, name: "Aliene (battle/trainer/arena/dragon_1)", random: true }],
    backupData: { formatted_sets: { Altaria: {
      "Lvl 50 Aliene (battle/trainer/gym/dragon_1) #5": { tr_id: 1, sub_index: 4, level: 50 },
      "Lvl 50 Aliene (battle/trainer/arena/dragon_1) #5 [pool]": { tr_id: 2, sub_index: 4, level: 50 },
    } } },
  };
  assert.equal(normalizePixelmonCalcSetNames(result), true);
  assert.deepEqual(Object.keys(result.backupData.formatted_sets.Altaria), ["Lvl 50 Aliene #5", "Lvl 50 Aliene 2 #5"]);
  assert.equal(result.backupData.formatted_sets.Altaria["Lvl 50 Aliene 2 #5"].tr_id, 2);
  assert.equal(result.backupData.formatted_sets.Altaria["Lvl 50 Aliene 2 #5"].pixelmonRandomPool, true);
  assert.equal(normalizePixelmonCalcSetNames(result), false);
});

test("exports rarity weights and source conditions without fabricating encounter percentages", () => {
  const result = buildPixelmonImport(fixture());
  const location = result.overrides.encs.pixelmonpixelmonspawningforests;
  assert.equal(location.air.encs[0].pixelmonRarity, 10);
  assert.deepEqual(location.air.encs[0].pixelmonConditions.times, ["DAY"]);
  assert.equal(location.air.rates, undefined);
  assert.equal(location.air.encs[0].mx, 50);
});

test("supports folder ZIP layouts and ignores unrelated or hidden files", () => {
  for (const prefix of ["", "pixelmon/", "data/pixelmon/", "pack/data/pixelmon/"]) assert.equal(buildPixelmonImport(fixture(prefix)).summary.trainers, 2);
  assert.equal(pixelmonArchivePath("__MACOSX/data/pixelmon/species/a.json"), null);
  assert.equal(pixelmonArchivePath("../species/a.json"), null);
  assert.equal(pixelmonArchivePath("data/pixelmon/recipe/a.json"), null);
  assert.equal(pixelmonArchivePath("species/._a.json"), null);
});

test("rejects invalid JSON, incomplete exports, duplicates and mixed Pixelmon roots", () => {
  assert.throws(() => buildPixelmonImport([{ name: "species/test.json", text: "{" }]), /Invalid JSON/);
  assert.throws(() => buildPixelmonImport(fixture().filter((file) => !file.name.includes("/moves/"))), /species\/ and moves\//);
  assert.throws(() => buildPixelmonImport([...fixture(), fixture()[0]]), /Duplicate/);
  assert.throws(() => buildPixelmonImport([...fixture(), entry("other/data/pixelmon/abilities/test.json", {})]), /multiple Pixelmon/);
});

test("keeps derived Z/Max power with the Gen 8 engine", () => {
  const result = buildPixelmonImport([...fixture(), entry("data/pixelmon/moves/zmoves/breakneck_blitz.json", { attackName: "Breakneck Blitz", attackType: "NORMAL", basePower: -1, ppBase: 1 })]);
  assert.equal(result.summary.derivedMoves, 1);
  assert.equal(result.backupData.moves["Breakneck Blitz"], undefined);
  assert.ok(result.overrides.moves["Breakneck Blitz"].bp >= 0);
});

const overrideSource = fs.readFileSync(new URL("../js/overrides.js", import.meta.url), "utf8");
function sourceBetween(start, end) { return overrideSource.slice(overrideSource.indexOf(start), overrideSource.indexOf(end, overrideSource.indexOf(start))); }

function zipFile(files, compressed) {
  const localParts = [], centralParts = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name), data = Buffer.from(file.text);
    const bytes = compressed ? deflateRawSync(data) : data;
    const header = Buffer.alloc(30), central = Buffer.alloc(46);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(compressed ? 8 : 0, 8);
    header.writeUInt32LE(bytes.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(name.length, 26);
    central.writeUInt32LE(0x02014b50); central.writeUInt16LE(compressed ? 8 : 0, 10);
    central.writeUInt32LE(bytes.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
    localParts.push(header, name, bytes); centralParts.push(central, name);
    offset += header.length + name.length + bytes.length;
  }
  const directory = Buffer.concat(centralParts), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  const bytes = Buffer.concat([...localParts, directory, end]);
  return { name: "pixelmon.zip", arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
}

test("extracts stored and deflated JSON ZIPs through the production reader", async () => {
  const context = { TextDecoder, Uint8Array, DataView, Blob, Response, DecompressionStream };
  vm.runInNewContext(sourceBetween("function readZipUint16", "function parseUploadedOverrideScript"), context);
  for (const compressed of [false, true]) {
    const entries = await context.extractZipTextEntries(zipFile([...fixture(), entry("data/pixelmon/recipe/ignore.json", {})], compressed), { accept: (name) => !!pixelmonArchivePath(name) });
    assert.equal(buildPixelmonImport(entries).summary.trainers, 2);
  }
  await assert.rejects(context.extractZipTextEntries(zipFile(fixture(), false), { maxEntrySize: 10, accept: (name) => !!pixelmonArchivePath(name) }), /size limit/);
});

test("calculator bridge pins every Pixelmon mechanic to Gen 8 and preserves Gen 3/4 configuration", () => {
  const context = { window: { DDEX_PIXELMON_DATA: {}, DDEX_ROM_SOURCE_GEN: 8 }, isPixelmonImportActive: () => true, ROM_SOURCE_GEN_KEY: "sourceGen", ROM_KEYS: { expanded: "expanded" }, localStorage: { getItem: () => null } };
  vm.runInNewContext(sourceBetween("function getRomSourceGen", "function getCalcBridgeBackupData"), context);
  const config = context.getCalcBridgeConfig();
  for (const key of ["gen", "damageGen", "critGen", "typeChart", "switchIn", "gameSwitchIn"]) assert.equal(config[key], 8);
  assert.equal(config.mechanics, "vanilla");
  context.isPixelmonImportActive = () => false;
  for (const gen of [3, 4]) {
    context.window.DDEX_ROM_SOURCE_GEN = gen;
    assert.equal(context.getCalcBridgeConfig().damageGen, gen);
  }
});
