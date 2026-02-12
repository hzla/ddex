// rom.js (ES module, browser-only)

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
  seek(off) {
    assert(Number.isInteger(off) && off >= 0 && off <= this.u8.length, `seek out of range: ${off}`);
    this.off = off;
  }
  tell() { return this.off; }
  _need(n) {
    if (this.off + n > this.u8.length) {
      throw new Error(`Malformed ROM: read past end at 0x${this.off.toString(16)} (need ${n})`);
    }
  }
  u32le() {
    this._need(4);
    const v = this.dv.getUint32(this.off, true);
    this.off += 4;
    return v >>> 0;
  }
  bytes(len) {
    assert(Number.isInteger(len) && len >= 0, "bytes: len must be >= 0");
    this._need(len);
    const out = this.u8.subarray(this.off, this.off + len);
    this.off += len;
    return out;
  }
}

export class BinaryWriter {
  constructor(size) {
    assert(Number.isInteger(size) && size >= 0, "BinaryWriter: bad size");
    this.u8 = new Uint8Array(size);
    this.dv = new DataView(this.u8.buffer);
    this.off = 0;
  }
  tell() { return this.off; }
  _need(n) {
    if (this.off + n > this.u8.length) {
      throw new Error(`BinaryWriter overflow at 0x${this.off.toString(16)} (need ${n}, cap ${this.u8.length})`);
    }
  }
  writeU32le(v) {
    this._need(4);
    this.dv.setUint32(this.off, v >>> 0, true);
    this.off += 4;
  }
  writeBytes(src) {
    assert(src instanceof Uint8Array, "writeBytes: expected Uint8Array");
    this._need(src.length);
    this.u8.set(src, this.off);
    this.off += src.length;
  }
  writeZeros(count) {
    this._need(count);
    // Uint8Array is zero-initialized; just advance.
    this.off += count;
  }
  padTo(alignment) {
    assert((alignment & (alignment - 1)) === 0, "padTo: alignment must be power of two");
    const next = alignUp(this.off, alignment);
    this.writeZeros(next - this.off);
  }
  finish() {
    assert(this.off === this.u8.length, `finish: wrote ${this.off}, expected ${this.u8.length}`);
    return this.u8;
  }
}

function readHeaderTableInfo(u8) {
  // Minimal header parsing for FAT/FNT.
  // Assumption: standard NDS header layout (offsets at 0x40..0x4C).
  assert(u8.length >= 0x50, "Malformed ROM: too small for NDS header fields");

  const r = new BinaryReader(u8);
  r.seek(0x40);
  const fntOffset = r.u32le();
  const fntSize = r.u32le();
  const fatOffset = r.u32le();
  const fatSize = r.u32le();

  // Basic sanity (0 values allowed, but FAT must exist for our API to work)
  assert(fatOffset !== 0 || fatSize !== 0, "Malformed ROM: FAT offset/size are zero");
  assert((fatSize % 8) === 0, `Malformed ROM: FAT size not multiple of 8 (${fatSize})`);
  assert(fatOffset + fatSize <= u8.length, "Malformed ROM: FAT extends beyond ROM size");

  if (fntSize !== 0) {
    assert(fntOffset + fntSize <= u8.length, "Malformed ROM: FNT extends beyond ROM size");
  }

  return { fntOffset, fntSize, fatOffset, fatSize };
}

export class Rom {
  constructor(originalU8, tableInfo, files) {
    this._original = originalU8;      // keep for prefix preservation
    this._ti = tableInfo;             // {fntOffset,fntSize,fatOffset,fatSize}
    this._files = files;              // Uint8Array[] (by file ID)
  }

  static parse(u8) {
    assert(u8 instanceof Uint8Array, "Rom.parse: expected Uint8Array");
    const ti = readHeaderTableInfo(u8);

    const fileCount = ti.fatSize / 8;
    const r = new BinaryReader(u8);
    r.seek(ti.fatOffset);

    const entries = new Array(fileCount);
    for (let i = 0; i < fileCount; i++) {
      const start = r.u32le();
      const end = r.u32le();

      // Allow unused: 0,0
      if (start === 0 && end === 0) {
        entries[i] = { start: 0, end: 0 };
        continue;
      }

      assert(end >= start, `Malformed ROM: FAT[${i}] end < start`);
      assert(end <= u8.length, `Malformed ROM: FAT[${i}] end beyond ROM length`);
      // start==0 with end!=0 is suspicious; treat as malformed
      assert(start !== 0, `Malformed ROM: FAT[${i}] start=0 but end!=0`);
      entries[i] = { start, end };
    }

    // Create zero-copy file views
    const files = new Array(fileCount);
    for (let i = 0; i < fileCount; i++) {
      const { start, end } = entries[i];
      files[i] = (start === 0 && end === 0) ? new Uint8Array(0) : u8.subarray(start, end);
    }

    return new Rom(u8, ti, files);
  }

  getFile(id) {
    assert(Number.isInteger(id), "getFile: id must be integer");
    assert(id >= 0 && id < this._files.length, `getFile: file id out of range (${id})`);
    return this._files[id];
  }

  setFile(id, data) {
    assert(Number.isInteger(id), "setFile: id must be integer");
    assert(id >= 0 && id < this._files.length, `setFile: file id out of range (${id})`);
    assert(data instanceof Uint8Array, "setFile: data must be Uint8Array");
    this._files[id] = data;
  }

  serialize() {
    const { fntOffset, fntSize, fatOffset, fatSize } = this._ti;
    const fileCount = this._files.length;

    // Preserve everything up to the end of FAT and FNT (tables/metadata region).
    const tablesEnd = Math.max(fatOffset + fatSize, fntOffset + fntSize);
    // Also preserve at least the first 0x200 bytes (common header size), if present.
    const headerMin = Math.min(this._original.length, 0x200);
    let prefixLen = Math.max(tablesEnd, headerMin);
    prefixLen = alignUp(prefixLen, 4);

    // Compute packed layout for files (absolute offsets)
    const starts = new Uint32Array(fileCount);
    const ends = new Uint32Array(fileCount);

    let cur = prefixLen;
    for (let i = 0; i < fileCount; i++) {
      const f = this._files[i];
      assert(f instanceof Uint8Array, `serialize: file ${i} is not Uint8Array`);

      cur = alignUp(cur, 4);
      starts[i] = cur;

      cur += f.length;
      ends[i] = cur;
    }
    const totalSize = alignUp(cur, 4);

    const w = new BinaryWriter(totalSize);

    // 1) Write preserved prefix (from original ROM, or zeros if original shorter)
    if (this._original.length >= prefixLen) {
      w.writeBytes(this._original.subarray(0, prefixLen));
    } else {
      // Shouldn't happen for real ROMs, but keep deterministic.
      w.writeBytes(this._original);
      w.writeZeros(prefixLen - this._original.length);
    }

    // 2) Patch FAT in-place within the prefix
    // FAT entries are absolute ROM offsets (IMG=0). :contentReference[oaicite:6]{index=6}
    assert(fatOffset + fatSize <= prefixLen, "Internal: prefix does not include FAT region");
    const fatView = new DataView(w.u8.buffer);
    let p = fatOffset;
    for (let i = 0; i < fileCount; i++) {
      const f = this._files[i];
      if (f.length === 0) {
        // Keep unused style: 0,0
        fatView.setUint32(p + 0, 0, true);
        fatView.setUint32(p + 4, 0, true);
      } else {
        fatView.setUint32(p + 0, starts[i], true);
        fatView.setUint32(p + 4, ends[i], true);
      }
      p += 8;
    }

    // 3) Write packed files at computed locations (writer is currently at prefixLen)
    // We already wrote prefixLen bytes, so w.tell() === prefixLen.
    for (let i = 0; i < fileCount; i++) {
      w.padTo(4);
      const f = this._files[i];
      w.writeBytes(f);
    }
    w.padTo(4);

    return w.finish();
  }
}
