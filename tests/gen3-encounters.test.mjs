import assert from "node:assert/strict";
import test from "node:test";

import { buildGen3ExportArtifacts } from "../rom/gen3-export/lib/gen3-exporter.mjs";

function encounterRom() {
  const rom = Buffer.alloc(0x1000);
  const anchors = [];
  const anchor = (Name, Address, Format) => anchors.push({ Name, Address, Format });
  const pointer = (offset, target) => rom.writeUInt32LE(0x08000000 + target, offset);
  const text = (offset, value) => {
    const encoded = [...value].map((char) => {
      if (/[A-Z]/.test(char)) return 0xBB + char.charCodeAt(0) - 65;
      if (/[a-z]/.test(char)) return 0xD5 + char.charCodeAt(0) - 97;
      if (/[0-9]/.test(char)) return 0xA1 + Number(char);
      return char === "?" ? 0xAC : 0;
    });
    rom.set([...encoded, 0xFF], offset);
  };

  anchor("data.pokemon.names", 0x100, '[name""11]2');
  text(0x100, "?");
  text(0x10B, "Mew");
  anchor("data.pokemon.stats", 0x200, "[stats]data.pokemon.names");
  rom[0x200 + 28 + 6] = 14;
  rom[0x200 + 28 + 7] = 14;
  rom[0x200 + 28 + 22] = 1;
  anchor("data.pokemon.moves.names", 0x300, '[name""13]2');
  text(0x300, "?");
  text(0x30D, "Pound");
  anchor("data.pokemon.moves.stats.battle", 0x340, "[move]data.pokemon.moves.names");
  rom[0x34D] = 40;
  rom[0x34F] = 100;
  rom[0x350] = 35;
  anchor("data.pokemon.type.names", 0x400, '[name""7]18');
  ["Normal", "Fight", "Flying", "Poison", "Ground", "Rock", "Bug", "Ghost", "Steel",
    "???", "Fire", "Water", "Grass", "Electr", "Psychc", "Ice", "Dragon", "Dark"]
    .forEach((name, index) => text(0x400 + index * 7, name));
  anchor("data.items.stats", 0x500, '[name""13]2');
  text(0x500, "?");
  text(0x52C, "Potion");
  anchor("data.abilities.names", 0x600, '[name""13]2');
  text(0x600, "?");
  text(0x60D, "Synchronize");
  anchor("data.abilities.descriptions", 0x620, '[description<"">]2');
  anchor("data.pokemon.moves.descriptions", 0x630, '[description<"">]1');
  anchor("data.pokemon.evolutions", 0x700,
    "[method1: arg1: species1: unused1: method2: arg2: species2: unused2: " +
    "method3: arg3: species3: unused3: method4: arg4: species4: unused4: " +
    "method5: arg5: species5: unused5:]data.pokemon.names");
  anchor("data.pokemon.moves.levelup", 0x760, "[moves<>]data.pokemon.names");
  pointer(0x764, 0x780);
  rom.writeUInt16LE(0x201, 0x780);
  rom.writeUInt16LE(0xFFFF, 0x782);
  anchor("data.trainers.stats", 0x790, "[trainer]0");
  anchor("data.trainers.classes.names", 0x7A0, '[name""13]1');
  text(0x7A0, "Trainer");

  anchor("data.maps.names", 0x800, '[name<"">]1');
  pointer(0x800, 0x830);
  text(0x830, "Route 101");
  anchor("data.maps.banks", 0x840, "[maps<>]1");
  pointer(0x840, 0x850);
  pointer(0x850, 0x880);
  anchor("data.pokemon.wild", 0x900, "[header]!FFFF");
  rom.writeUInt16LE(0xFFFF, 0x914);

  // Slot arrays are separate from their encounter-info structs.
  for (const [field, info, data, count, firstLevel] of [
    [4, 0x980, 0xB00, 12, 1],
    [8, 0x990, 0xB40, 5, 20],
    [12, 0x9A0, 0xB60, 5, 30],
    [16, 0x9B0, 0xB80, 10, 40],
  ]) {
    pointer(0x900 + field, info);
    rom[info] = 20;
    pointer(info + 4, data);
    for (let slot = 0; slot < count; slot += 1) {
      rom[data + slot * 4] = firstLevel + slot;
      rom[data + slot * 4 + 1] = firstLevel + slot + 1;
      rom.writeUInt16LE(1, data + slot * 4 + 2);
    }
  }

  const tomlText = anchors.map(({ Name, Address, Format }) =>
    `[[NamedAnchors]]\nName = ${JSON.stringify(Name)}\nAddress = ${Address}\nFormat = ${JSON.stringify(Format)}`
  ).join("\n\n");
  return { romBytes: rom, tomlText, slug: "test", title: "Test" };
}

test("Gen 3 encounters follow slot pointers and preserve every slot and rod group", () => {
  const result = buildGen3ExportArtifacts(encounterRom());
  const { rates, route101 } = result.dexOutput.encs;
  assert.equal(result.summary.dex_locations, 1);

  for (const [kind, firstLevel, count] of [
    ["grass", 1, 12], ["surf", 20, 5], ["rock_smash", 30, 5],
    ["old_rod", 40, 2], ["good_rod", 42, 3], ["super_rod", 45, 5],
  ]) {
    assert.equal(route101[kind].encs.length, rates[kind].length, kind);
    assert.deepEqual(route101[kind].encs,
      Array.from({ length: count }, (_, index) => ({
        s: "Mew", mn: firstLevel + index, mx: firstLevel + index + 1,
      })), kind);
  }
  assert.ok(result.searchIndex.BattleSearchIndex.some(([id, kind]) =>
    id === "route101" && kind === "location"));
});

test("Gen 3 encounters omit absent or out-of-bounds slot arrays", () => {
  const fixture = encounterRom();
  fixture.romBytes.writeUInt32LE(0, 0x984);
  fixture.romBytes.writeUInt32LE(0x08000FFC, 0x994);
  const { dexOutput } = buildGen3ExportArtifacts(fixture);
  assert.equal(dexOutput.encs.route101.grass, undefined);
  assert.equal(dexOutput.encs.route101.surf, undefined);
  assert.equal(dexOutput.encs.route101.old_rod.encs.length, 2);
});

test("omitting empty or invalid species preserves the other slots' rates", () => {
  const fixture = encounterRom();
  fixture.romBytes.writeUInt16LE(0, 0xB02);
  fixture.romBytes.writeUInt16LE(999, 0xB22);
  const { dexOutput } = buildGen3ExportArtifacts(fixture);
  const table = dexOutput.encs.route101.grass;
  assert.deepEqual(table.rates, [20, 10, 10, 10, 10, 5, 5, 4, 1, 1]);
  assert.equal(table.encs.length, table.rates.length);
  assert.deepEqual(table.encs.map((slot) => slot.mn), [2, 3, 4, 5, 6, 7, 8, 10, 11, 12]);
});
