import assert from "node:assert/strict";
import test from "node:test";

import { parsePackedHgEngineLearnsets } from "../rom/dspre_export.js";

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
