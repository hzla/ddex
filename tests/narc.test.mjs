import assert from "node:assert/strict";
import test from "node:test";

import { Narc } from "../rom/narc.js";

function makeArchive() {
  const files = [
    new Uint8Array([1, 2, 3, 4]),
    new Uint8Array([5, 6, 7, 8, 9, 10, 11, 12]),
    new Uint8Array([13, 14, 15, 16]),
  ];
  const bytes = new Narc(files).serialize();
  const view = new DataView(bytes.buffer);
  const btnfStart = 16 + view.getUint32(20, true);
  const gmifStart = btnfStart + view.getUint32(btnfStart + 4, true);
  return { files, bytes, view, gmifStart };
}

test("lenient NARC parsing recovers files past a stale final GMIF size", () => {
  const { files, bytes, view, gmifStart } = makeArchive();
  view.setUint32(gmifStart + 4, 8 + 8, true);

  assert.throws(() => Narc.parse(bytes), /beyond GMIF data length/);
  const parsed = Narc.parse(bytes, { allowFileOverrun: true });
  assert.deepEqual(parsed.files, files);
});

test("lenient NARC parsing still bounds genuinely truncated files to the input view", () => {
  const { bytes, gmifStart } = makeArchive();
  const truncated = bytes.subarray(0, gmifStart + 8 + 6);
  const parsed = Narc.parse(truncated, {
    allowSizeMismatch: true,
    allowChunkOverrun: true,
    allowFileOverrun: true,
  });
  assert.deepEqual(parsed.files, [
    new Uint8Array([1, 2, 3, 4]),
    new Uint8Array([5, 6]),
    new Uint8Array(0),
  ]);
});

test("strict and lenient NARC parsing preserve ordinary archives", () => {
  const { files, bytes } = makeArchive();
  assert.deepEqual(Narc.parse(bytes).files, files);
  assert.deepEqual(Narc.parse(bytes, { allowFileOverrun: true }).files, files);
});
