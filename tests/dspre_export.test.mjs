import assert from "node:assert/strict";
import test from "node:test";

import { parseEncounterHGSS, parsePackedHgEngineLearnsets } from "../rom/dspre_export.js";

function makeHgssEncounter() {
  const bytes = new Uint8Array(196);
  const view = new DataView(bytes.buffer);
  bytes.set([25, 15, 0, 25, 50, 75]);
  bytes[8] = 3;
  view.setUint16(20, 16, true); // first morning species
  view.setUint16(44, 161, true); // first day species
  view.setUint16(68, 163, true); // first night species
  bytes.set([20, 40], 184); // final super rod slot
  view.setUint16(186, 130, true);
  [16, 72, 90, 129].forEach((species, i) => view.setUint16(188 + i * 2, species, true));
  return bytes;
}

test("preserves HGSS encounters when Sacred Gold omits the final two swarm entries", () => {
  const full = parseEncounterHGSS(makeHgssEncounter());
  const short = parseEncounterHGSS(makeHgssEncounter().subarray(0, 192));

  assert.equal(short.walkingRate, 25);
  assert.equal(short.walkingLevels[0], 3);
  assert.equal(short.morningPokemon[0], 16);
  assert.equal(short.dayPokemon[0], 161);
  assert.equal(short.nightPokemon[0], 163);
  assert.equal(short.superRodPokemon[4], 130);
  assert.equal(short.superRodMinLevels[4], 20);
  assert.equal(short.superRodMaxLevels[4], 40);
  assert.deepEqual(Array.from(full.swarmPokemon), [16, 72, 90, 129]);
  assert.deepEqual(Array.from(short.swarmPokemon), [16, 72, 0, 0]);
  assert.deepEqual({ ...short, swarmPokemon: null }, { ...full, swarmPokemon: null });
});

test("still rejects HGSS records truncated within regular encounters", () => {
  assert.throws(() => parseEncounterHGSS(makeHgssEncounter().subarray(0, 187)), RangeError);
});

function makePackedTable({ blockPairs, blockCount, records }) {
  const u8 = new Uint8Array(blockPairs * blockCount * 4);
  const view = new DataView(u8.buffer);

  for (let pair = 0; pair < blockPairs * blockCount; pair += 1) {
    view.setUint16(pair * 4, 0xFFFF, true);
    view.setUint16(pair * 4 + 2, 0, true);
  }

  for (const [blockIndex, entries] of Object.entries(records)) {
    entries.forEach(({ move, level }, entryIndex) => {
      const off = (Number(blockIndex) * blockPairs + entryIndex) * 4;
      view.setUint16(off, move, true);
      view.setUint16(off + 2, level, true);
    });
  }
  return u8;
}

test("parses a packed HG-Engine table with reserved species capacity", () => {
  const u8 = makePackedTable({
    blockPairs: 5,
    blockCount: 11,
    records: {
      1: [{ move: 10, level: 1 }, { move: 20, level: 7 }],
      2: [{ move: 30, level: 4 }],
      5: [{ move: 40, level: 12 }],
    },
  });
  const logs = [];
  const result = parsePackedHgEngineLearnsets(u8, 6, { log: (line) => logs.push(line) });

  assert.equal(result.length, 6);
  assert.deepEqual(result[0], []);
  assert.deepEqual(result[1], [{ move: 10, level: 1 }, { move: 20, level: 7 }]);
  assert.deepEqual(result[2], [{ move: 30, level: 4 }]);
  assert.deepEqual(result[5], [{ move: 40, level: 12 }]);
  assert.match(logs.join("\n"), /reserved capacity \(blockPairs=5, blocks=11, mons=6\)/);
});

test("preserves exact-size packed HG-Engine parsing", () => {
  const u8 = makePackedTable({
    blockPairs: 5,
    blockCount: 6,
    records: {
      1: [{ move: 10, level: 1 }],
      4: [{ move: 50, level: 25 }],
    },
  });
  const result = parsePackedHgEngineLearnsets(u8, 6);

  assert.equal(result.length, 6);
  assert.deepEqual(result[1], [{ move: 10, level: 1 }]);
  assert.deepEqual(result[4], [{ move: 50, level: 25 }]);
});
