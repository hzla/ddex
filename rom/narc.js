// narc.js (ES module, browser-only)

function ascii4(u8, off) {
  if (off + 4 > u8.length) return "";
  return String.fromCharCode(u8[off], u8[off + 1], u8[off + 2], u8[off + 3]);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function alignUp(n, a) {
  return (n + (a - 1)) & ~(a - 1);
}

export class BinaryReader {
  constructor(u8) {
    assert(u8 instanceof Uint8Array, "BinaryReader: expected Uint8Array");
    this.u8 = u8;
    this.dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    this.off = 0;
  }
  tell() { return this.off; }
  seek(off) {
    assert(Number.isInteger(off) && off >= 0 && off <= this.u8.length, `BinaryReader.seek: out of range ${off}`);
    this.off = off;
  }
  skip(n) { this.seek(this.off + n); }

  _need(n) {
    if (this.off + n > this.u8.length) {
      throw new Error(`Malformed input: read past end at 0x${this.off.toString(16)} (need ${n}, len ${this.u8.length})`);
    }
  }

  u8le() { this._need(1); return this.u8[this.off++]; }
  u16le() { this._need(2); const v = this.dv.getUint16(this.off, true); this.off += 2; return v; }
  u32le() { this._need(4); const v = this.dv.getUint32(this.off, true); this.off += 4; return v; }

  bytes(len) {
    assert(Number.isInteger(len) && len >= 0, "BinaryReader.bytes: len must be >= 0");
    this._need(len);
    const out = this.u8.subarray(this.off, this.off + len);
    this.off += len;
    return out;
  }

  peekAscii4() { return ascii4(this.u8, this.off); }
}

export class BinaryWriter {
  constructor(size) {
    assert(Number.isInteger(size) && size >= 0, "BinaryWriter: size must be >= 0");
    this.u8 = new Uint8Array(size);
    this.dv = new DataView(this.u8.buffer, this.u8.byteOffset, this.u8.byteLength);
    this.off = 0;
  }
  tell() { return this.off; }
  _need(n) {
    if (this.off + n > this.u8.length) {
      throw new Error(`BinaryWriter overflow at 0x${this.off.toString(16)} (need ${n}, cap ${this.u8.length})`);
    }
  }
  writeU8(v) { this._need(1); this.u8[this.off++] = v & 0xFF; }
  writeU16le(v) { this._need(2); this.dv.setUint16(this.off, v & 0xFFFF, true); this.off += 2; }
  writeU32le(v) { this._need(4); this.dv.setUint32(this.off, v >>> 0, true); this.off += 4; }
  writeAscii4(s) {
    assert(typeof s === "string" && s.length === 4, "writeAscii4: expected 4-char string");
    this._need(4);
    for (let i = 0; i < 4; i++) this.u8[this.off++] = s.charCodeAt(i) & 0xFF;
  }
  writeBytes(src) {
    assert(src instanceof Uint8Array, "writeBytes: expected Uint8Array");
    this._need(src.length);
    this.u8.set(src, this.off);
    this.off += src.length;
  }
  padTo(alignment, padByte = 0) {
    assert((alignment & (alignment - 1)) === 0, "padTo: alignment must be power of two");
    const next = alignUp(this.off, alignment);
    while (this.off < next) this.writeU8(padByte);
  }
  finish() {
    assert(this.off === this.u8.length, `BinaryWriter.finish: wrote ${this.off}, expected ${this.u8.length}`);
    return this.u8;
  }
}

function parseChunk(r, expectedMagic, opts = {}) {
  const start = r.tell();
  const magic = r.peekAscii4();
  assert(magic === expectedMagic, `Malformed input: expected chunk '${expectedMagic}' at 0x${start.toString(16)}, found '${magic}'`);
  r.skip(4);
  const size = r.u32le();
  assert(size >= 8, `Malformed input: chunk '${expectedMagic}' size < 8 (${size})`);
  let end = start + size;
  if (end > r.u8.length) {
    if (opts.allowChunkOverrun) {
      end = r.u8.length;
    } else {
      assert(false, `Malformed input: chunk '${expectedMagic}' overruns file (end 0x${end.toString(16)})`);
    }
  }
  return { start, size, end };
}

function makeMinimalBTNFChunk(fileCount) {
  // BTNF payload (after 8-byte chunk header) is an FNT:
  // Directory table: 1 entry (root) of 8 bytes:
  //   u32 subtableOffset (from FNT base = start of dir table)
  //   u16 firstFileId
  //   u16 parentOrDirCount (root uses total dir count)
  // Then root subtable: 0x00 terminator (no names)
  //
  // This is valid and sufficient for ID-based access.
  const dirCount = 1;
  const dirTableSize = dirCount * 8; // 8
  const subtable = new Uint8Array([0x00]);
  const payloadSize = dirTableSize + subtable.length; // 9
  const chunkSizeUnpadded = 8 + payloadSize;
  const chunkSize = alignUp(chunkSizeUnpadded, 4);
  const w = new BinaryWriter(chunkSize);

  w.writeAscii4("BTNF");
  w.writeU32le(chunkSize);

  // FNT base begins immediately after this chunk header (offset 8 within chunk)
  // Root directory entry
  w.writeU32le(dirTableSize);   // subtableOffset = after dir table
  w.writeU16le(0);              // firstFileId
  w.writeU16le(dirCount);       // root: total number of directories
  w.writeBytes(subtable);

  w.padTo(4, 0);
  return w.finish();
}

export class Narc {
  constructor(files = [], btnfRaw = null, originalFileCount = null) {
    this.files = files;
    this._btnfRaw = btnfRaw; // includes 'BTNF' + size + payload + padding
    this._originalFileCount = originalFileCount;
  }

  static parse(u8, opts = {}) {
    assert(u8 instanceof Uint8Array, "Narc.parse: expected Uint8Array");
    const allowSizeMismatch = !!opts.allowSizeMismatch;
    const allowChunkOverrun = !!opts.allowChunkOverrun;
    const allowFileOverrun = !!opts.allowFileOverrun;
    const r = new BinaryReader(u8);

    assert(r.peekAscii4() === "NARC", "Malformed input: missing 'NARC' magic");
    r.skip(4);
    const bom = r.u16le();
    assert(bom === 0xFFFE, `Malformed input: unexpected BOM 0x${bom.toString(16)} (expected 0xFFFE)`);
    const ver = r.u16le();
    assert(ver === 0x0100, `Malformed input: unexpected version 0x${ver.toString(16)} (expected 0x0100)`);
    const fileSize = r.u32le();
    if (!allowSizeMismatch) {
      assert(fileSize === u8.length, `Malformed input: header fileSize ${fileSize} != buffer length ${u8.length}`);
    }
    const headerSize = r.u16le();
    assert(headerSize === 0x0010, `Malformed input: unexpected headerSize 0x${headerSize.toString(16)} (expected 0x0010)`);
    const chunkCount = r.u16le();
    assert(chunkCount === 3, `Malformed input: expected 3 chunks, got ${chunkCount}`);

    // Chunks in strict order
    const btaf = parseChunk(r, "BTAF", { allowChunkOverrun });
    const btafCount = r.u32le(); // at offset btaf.start+8
    // Validate BTAF has enough room for entries
    const btafEntriesBytes = btafCount * 8;
    const btafExpectedMin = 12 + btafEntriesBytes; // 4 magic + 4 size + 4 count + entries
    assert(btaf.size >= btafExpectedMin, `Malformed input: BTAF too small for ${btafCount} files (size ${btaf.size})`);

    const starts = new Uint32Array(btafCount);
    const ends = new Uint32Array(btafCount);
    for (let i = 0; i < btafCount; i++) {
      starts[i] = r.u32le();
      ends[i] = r.u32le();
      assert(ends[i] >= starts[i], `Malformed input: BTAF entry ${i} has end < start`);
    }
    // Skip any extra padding in BTAF chunk
    r.seek(btaf.end);

    const btnf = parseChunk(r, "BTNF", { allowChunkOverrun });
    // Preserve BTNF chunk bytes verbatim
    const btnfRaw = u8.subarray(btnf.start, btnf.end);
    r.seek(btnf.end);

    const gmif = parseChunk(r, "GMIF", { allowChunkOverrun });
    const gmifDataStart = gmif.start + 8;
    let gmifDataEnd = gmif.end;
    const gmifDataLen = gmifDataEnd - gmifDataStart;
    assert(gmifDataLen >= 0, "Malformed input: GMIF size invalid");

    // Slice files (zero-copy views into original buffer)
    const files = new Array(btafCount);
    for (let i = 0; i < btafCount; i++) {
      let s = starts[i];
      let e = ends[i];
      if (e > gmifDataLen || s > gmifDataLen) {
        if (allowFileOverrun) {
          if (s > gmifDataLen) s = gmifDataLen;
          if (e > gmifDataLen) e = gmifDataLen;
        } else {
          assert(false, `Malformed input: file ${i} end offset ${e} beyond GMIF data length ${gmifDataLen}`);
        }
      }
      const absS = gmifDataStart + s;
      const absE = gmifDataStart + e;
      files[i] = u8.subarray(absS, absE);
    }

    return new Narc(files, btnfRaw, btafCount);
  }

  getFile(i) {
    assert(Number.isInteger(i), "getFile: index must be integer");
    assert(i >= 0 && i < this.files.length, `getFile: index out of range (${i})`);
    return this.files[i];
  }

  setFile(i, data) {
    assert(Number.isInteger(i), "setFile: index must be integer");
    assert(i >= 0 && i < this.files.length, `setFile: index out of range (${i})`);
    assert(data instanceof Uint8Array, "setFile: data must be Uint8Array");
    this.files[i] = data;
  }

  addFile(data) {
    assert(data instanceof Uint8Array, "addFile: data must be Uint8Array");
    this.files.push(data);
    return this.files.length - 1;
  }

  removeFile(i) {
    assert(Number.isInteger(i), "removeFile: index must be integer");
    assert(i >= 0 && i < this.files.length, `removeFile: index out of range (${i})`);
    this.files.splice(i, 1);
  }

  serialize() {
    const fileCount = this.files.length;

    // Decide BTNF chunk
    let btnfChunk;
    if (this._btnfRaw && this._originalFileCount === fileCount) {
      // Reuse exactly to preserve filenames/structure (minimal BTNF preservation requirement)
      btnfChunk = this._btnfRaw;
    } else {
      btnfChunk = makeMinimalBTNFChunk(fileCount);
    }

    // Compute GMIF layout + BTAF offsets
    const starts = new Uint32Array(fileCount);
    const ends = new Uint32Array(fileCount);

    let gmifDataLen = 0;
    for (let i = 0; i < fileCount; i++) {
      const f = this.files[i];
      assert(f instanceof Uint8Array, `serialize: file ${i} is not Uint8Array`);
      gmifDataLen = alignUp(gmifDataLen, 4);
      starts[i] = gmifDataLen;
      gmifDataLen += f.length;
      ends[i] = gmifDataLen;
    }
    gmifDataLen = alignUp(gmifDataLen, 4);

    const btafSize = alignUp(12 + fileCount * 8, 4);
    const gmifSize = 8 + gmifDataLen;

    const totalSize = 16 + btafSize + btnfChunk.length + gmifSize;

    const w = new BinaryWriter(totalSize);

    // NARC header
    w.writeAscii4("NARC");
    w.writeU16le(0xFFFE);
    w.writeU16le(0x0100);
    w.writeU32le(totalSize);
    w.writeU16le(0x0010);
    w.writeU16le(0x0003);

    // BTAF
    w.writeAscii4("BTAF");
    w.writeU32le(btafSize);
    w.writeU32le(fileCount);
    for (let i = 0; i < fileCount; i++) {
      w.writeU32le(starts[i]);
      w.writeU32le(ends[i]);
    }
    w.padTo(4, 0);

    // BTNF (as decided)
    w.writeBytes(btnfChunk);

    // GMIF
    w.writeAscii4("GMIF");
    w.writeU32le(gmifSize);

    let cur = 0;
    for (let i = 0; i < fileCount; i++) {
      const f = this.files[i];
      const target = starts[i];
      while (cur < target) { w.writeU8(0); cur++; }
      w.writeBytes(f);
      cur += f.length;
    }
    while (cur < gmifDataLen) { w.writeU8(0); cur++; }

    return w.finish();
  }
}
