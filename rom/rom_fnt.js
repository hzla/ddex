// rom_fnt.js (ES module)

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

class Reader {
  constructor(u8, base = 0, limit = u8.length) {
    this.u8 = u8;
    this.dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    this.base = base;
    this.limit = limit;
  }
  _need(off, n) {
    if (off < this.base || off + n > this.limit) {
      throw new Error(`Invalid FNT: out of bounds read at 0x${off.toString(16)} (need ${n})`);
    }
  }
  u8at(off) { this._need(off, 1); return this.u8[off]; }
  u16le(off) { this._need(off, 2); return this.dv.getUint16(off, true); }
  u32le(off) { this._need(off, 4); return this.dv.getUint32(off, true) >>> 0; }
  bytes(off, len) { this._need(off, len); return this.u8.subarray(off, off + len); }
}

function bytesToString(b) {
  // Minimal single-byte decoding
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
}

function normalizePath(input) {
  assert(typeof input === "string", "Path must be a string");
  let p = input.trim().replaceAll("\\", "/");
  if (p.startsWith("/")) p = p.slice(1);
  assert(p.length > 0, "Path is empty");
  const segs = p.split("/");
  const out = [];
  for (const seg of segs) {
    assert(seg.length > 0, "Invalid path: empty segment");
    assert(seg !== "." && seg !== "..", "Invalid path: '.' and '..' are not allowed");
    out.push(seg);
  }
  return out;
}

function parseFNT(romU8, fntOffset, fntSize) {
  assert(Number.isInteger(fntOffset) && Number.isInteger(fntSize), "Internal: bad FNT bounds");
  assert(fntSize > 0, "Invalid FNT: size is zero");
  assert(fntOffset + fntSize <= romU8.length, "Invalid FNT: extends beyond ROM");

  const r = new Reader(romU8, fntOffset, fntOffset + fntSize);

  const rootEntryOff = fntOffset + 0;
  const rootSubOff = r.u32le(rootEntryOff + 0);
  const rootFirstFileId = r.u16le(rootEntryOff + 4);
  const dirCount = r.u16le(rootEntryOff + 6);

  assert(dirCount >= 1 && dirCount <= 4096, `Invalid FNT: dirCount out of range (${dirCount})`);
  const dirTableBytes = dirCount * 8;
  assert(dirTableBytes <= fntSize, "Invalid FNT: directory table exceeds FNT size");
  assert(rootSubOff < fntSize, "Invalid FNT: root subtable offset out of range");

  // Read directory entries
  const dirEntries = new Array(dirCount);
  for (let i = 0; i < dirCount; i++) {
    const off = fntOffset + i * 8;
    const subOff = r.u32le(off + 0);
    const firstFileId = r.u16le(off + 4);
    const parentOrCount = r.u16le(off + 6);

    assert(subOff < fntSize, `Invalid FNT: dir ${i} subtable offset out of range`);
    if (i === 0) {
      // root: parentOrCount is dirCount (already validated)
      assert(parentOrCount === dirCount, "Invalid FNT: root dirCount mismatch");
    } else {
      assert((parentOrCount & 0xF000) === 0xF000, `Invalid FNT: dir ${i} parentDirId not in 0xF000..`);
      const parentIndex = parentOrCount - 0xF000;
      assert(parentIndex >= 0 && parentIndex < dirCount, `Invalid FNT: dir ${i} parentDirId out of range`);
    }

    dirEntries[i] = { subOff, firstFileId, parentOrCount };
  }

  // Traverse directories, build maps.
  const pathToId = new Map();      // "a/0/1/6" => id
  const idToPath = [];             // sparse array

  // stack items: { dirIndex, pathPrefix } where prefix is "" or "a/0"
  const stack = [{ dirIndex: 0, pathPrefix: "" }];
  const seenDirs = new Uint8Array(dirCount);

  while (stack.length) {
    const { dirIndex, pathPrefix } = stack.pop();
    if (seenDirs[dirIndex]) continue;
    seenDirs[dirIndex] = 1;

    const entry = dirEntries[dirIndex];
    let pos = fntOffset + entry.subOff;
    let fileId = entry.firstFileId;

    // Parse subtable entries until 0x00
    for (;;) {
      const lenType = r.u8at(pos); pos += 1;
      if (lenType === 0x00) break;

      const isDir = (lenType & 0x80) !== 0;
      const nameLen = lenType & 0x7F;
      assert(nameLen > 0, "Invalid FNT: zero-length name entry");

      const nameBytes = r.bytes(pos, nameLen); pos += nameLen;
      const name = bytesToString(nameBytes);

      if (isDir) {
        const childDirId = r.u16le(pos); pos += 2;
        assert((childDirId & 0xF000) === 0xF000, "Invalid FNT: childDirId not in 0xF000..");
        const childIndex = childDirId - 0xF000;
        assert(childIndex >= 0 && childIndex < dirEntries.length, "Invalid FNT: childDirId out of range");

        const childPrefix = pathPrefix ? `${pathPrefix}/${name}` : name;
        stack.push({ dirIndex: childIndex, pathPrefix: childPrefix });
      } else {
        const filePath = pathPrefix ? `${pathPrefix}/${name}` : name;
        // Record mapping
        pathToId.set(filePath, fileId);
        if (idToPath[fileId] == null) idToPath[fileId] = filePath;
        fileId++;
      }
    }
  }

  return {
    pathToId,
    idToPath,
    rootFirstFileId, // not required, but kept for debugging
    dirCount
  };
}

export function installFntPathSupport(RomClass) {
  assert(typeof RomClass === "function", "installFntPathSupport: RomClass must be a class/function");

  // Lazy parse cache so large ROMs don't do extra work unless path ops used
  function ensureFntParsed(rom) {
    if (rom._fntParsed) return;
    assert(rom._ti && Number.isInteger(rom._ti.fntOffset) && Number.isInteger(rom._ti.fntSize),
      "Rom instance missing _ti.{fntOffset,fntSize} (expected from Milestone 2)");
    const { fntOffset, fntSize } = rom._ti;
    rom._fnt = parseFNT(rom._original, fntOffset, fntSize);
    rom._fntParsed = true;
  }

  RomClass.prototype.resolvePathToId = function (path) {
    ensureFntParsed(this);
    const segs = normalizePath(path);
    const norm = segs.join("/");

    // Optional "data/..." support: not special-cased; it resolves only if present in FNT.
    const id = this._fnt.pathToId.get(norm);
    if (id == null) throw new Error(`Path not found in FNT: ${norm}`);
    // Also validate against current FAT-derived file count
    if (id < 0 || id >= this._files.length) throw new Error(`Resolved file id out of range: ${id} for ${norm}`);
    return id;
  };

  RomClass.prototype.resolveIdToPath = function (id) {
    ensureFntParsed(this);
    assert(Number.isInteger(id), "resolveIdToPath: id must be integer");
    if (id < 0 || id >= this._files.length) throw new Error(`resolveIdToPath: file id out of range (${id})`);
    const p = this._fnt.idToPath[id];
    return (p == null) ? null : p;
  };

  RomClass.prototype.getFileByPath = function (path) {
    const id = this.resolvePathToId(path);
    return this.getFile(id);
  };

  RomClass.prototype.setFileByPath = function (path, data) {
    const id = this.resolvePathToId(path);
    return this.setFile(id, data);
  };

  return RomClass;
}
