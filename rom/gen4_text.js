// formats/gen4_text.js
// Gen 4 message bank (DPPT/HGSS-style) parser/serializer.
// - Browser ES module, no deps
// - Uint8Array/DataView only
// - Exact byte roundtrip when unmodified (serialize returns original bytes)

function readU16(dv, o) { return dv.getUint16(o, true); }
function readU32(dv, o) { return dv.getUint32(o, true); }
function writeU16(dv, o, v) { dv.setUint16(o, v & 0xFFFF, true); }
function writeU32(dv, o, v) { dv.setUint32(o, v >>> 0, true); }

function eqBytes(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ---- 9-bit compression (same bitpacking style as your Gen5; 0x1FF => terminator) ----
 function decompress9Bit(wordsU16) {
   const out = [];
   let container = 0 >>> 0;
   let bit = 0;

   for (let i = 0; i < wordsU16.length; i++) {
     container |= (wordsU16[i] & 0xFFFF) << bit;
     bit += 16;

     while (bit >= 9) {
       bit -= 9;
       const c = container & 0x1FF;

      if (c === 0x1FF) { out.push(0xFFFF); return out; }
        out.push(c);
        container >>>= 9;
     }
   }
   return out;
 }

 // Python-style Gen4 9-bit decompression:
// - input is an array of u16 words (packed stream) in file order
// - drops the last word BEFORE decompress
// - consumes words by pop() from the end (stack)
// - emits 9-bit codes (0..0x1FF) in an array that will later be pop()'d for decoding
function decompress9Bit_stackPop(packedWordsU16) {
  const s = packedWordsU16.slice(); // copy
  if (s.length) s.pop(); // match python: $string.pop()

  const out = [0];       // match python: $newstring = [0]
  let container = 0 >>> 0;
  let bit = 0;

  while (s.length) {
    container |= (s.pop() & 0xFFFF) << bit;
    bit += 16;

    while (bit >= 9) {
      bit -= 9;
      out.push(container & 0x1FF);
      container >>>= 9;
    }
  }

  return out;
}

function decode9BitByPopping(codes9, symbols) {
  const s = codes9.slice();
  let out = "";

  while (s.length) {
    const c = (s.pop() ?? 0) & 0x1FF;

    if (c === 0x1FF) break;        // terminator in 9-bit domain
    if (c === 0x1FE) {             // variable marker in 9-bit domain
      const count = (s.pop() ?? 0) & 0x1FF;
      const args = [];
      for (let k = 0; k < count; k++) args.push((s.pop() ?? 0) & 0x1FF);
      out += "VAR(" + args.map(String).join(", ") + ")";
      continue;
    }

    const sym = symLookup(symbols, c);
    if (sym != null) out += sym;
    else out += "\\x" + c.toString(16).toUpperCase().padStart(4, "0");
  }

  return out;
}

function decodeTrainerName15Bit(messageWords, startIndex, symbols) {
  let out = "";
  let bit = 0;
  let arrayIndex = startIndex + 1;
  let codesConsumed = 1; // counts words after the 0xF100 marker

  while (arrayIndex < messageWords.length) {
    let curChar = ((messageWords[arrayIndex] >> bit) & 0x1FF) & 0xFFFF;
    bit += 9;

    if (bit >= 15) {
      arrayIndex++;
      codesConsumed++;
      bit -= 15;

      if (bit !== 0 && arrayIndex < messageWords.length) {
        curChar |= ((messageWords[arrayIndex] << (9 - bit)) & 0x1FF);
      }
    }

    if (curChar === 0x1FF) break;

    const sym = symLookup(symbols, curChar);
    out += (sym != null) ? sym : ("\\x" + curChar.toString(16).toUpperCase().padStart(4, "0"));
  }

  return { text: out, wordsConsumedAfterMarker: codesConsumed };
}

function symLookup(symbols, w) {
  if (!symbols) return null;

  // If it's an array
  if (Array.isArray(symbols)) {
    const v = symbols[w];
    return (typeof v === "string") ? v : null;
  }

  // If it's an object map (JSON keys are strings)
  // Try decimal key first (most common)
  let v = symbols[w];
  if (typeof v === "string") return v;

  // Some dumps key as hex strings like "0x12C"
  const hexKey = "0x" + w.toString(16).toUpperCase();
  v = symbols[hexKey];
  if (typeof v === "string") return v;

  // Or "012C"
  const hex4 = w.toString(16).toUpperCase().padStart(4, "0");
  v = symbols[hex4];
  if (typeof v === "string") return v;

  return null;
}

function decodeWordsForward(words, symbols) {
  let out = "";
  for (let i = 0; i < words.length; i++) {
    const w = words[i] & 0xFFFF;

    if (w === 0xFFFF) break;      // -1 terminator
    if (w === 0xFFFE) {           // -2 variable marker
      const count = (words[++i] ?? 0) & 0xFFFF;
      const args = [];
      for (let k = 0; k < count; k++) args.push((words[++i] ?? 0) & 0xFFFF);
      out += "VAR(" + args.map(String).join(", ") + ")";
      continue;
    }

    if (w === 0xF100) {
      const { text, wordsConsumedAfterMarker } = decodeTrainerName15Bit(words, i, symbols);
      out += text;
      i += wordsConsumedAfterMarker; // skips the packed words; loop will i++ next
      continue;
    }

    const sym = symLookup(symbols, w);
    if (sym != null) {
      out += sym;
      continue;
    }

    // fallback
    if (w >= 0x20 && w <= 0x7E) out += String.fromCharCode(w);
    else out += "\\x" + w.toString(16).toUpperCase().padStart(4, "0");
  }
  return out;
}

function decodeGen4Auto(words, symbols) {
   return decodeWordsForward(words, symbols);
}

function compress9Bit(codepointsU16 /* includes 0xFFFF terminator at end */) {
  // Map 0xFFFF => 0x1FF; everything else must be <= 0x1FE
  const symbols = [];
  for (let i = 0; i < codepointsU16.length; i++) {
    const cp = codepointsU16[i] & 0xFFFF;
    if (cp === 0xFFFF) symbols.push(0x1FF);
    else {
      if (cp > 0x1FE) throw new Error(`Cannot 9-bit compress value 0x${cp.toString(16)}`);
      symbols.push(cp);
    }
  }

  const outWords = [];
  let container = 0 >>> 0;
  let bit = 0;
  for (let i = 0; i < symbols.length; i++) {
    container |= (symbols[i] & 0x1FF) << bit;
    bit += 9;
    while (bit >= 16) {
      outWords.push(container & 0xFFFF);
      container >>>= 16;
      bit -= 16;
    }
  }
  if (bit > 0) outWords.push(container & 0xFFFF);
  return outWords;
}

// ---- “text” encoding/decoding ----
// Gen4 banks are indexed through a SYMBOLS table. If you have one, pass it in.
// If you don't, we fall back to:
// - printable ASCII for 0x20..0x7E
// - otherwise \xNNNN
//
// Variables: marker 0xFFFE followed by count then count args.
// We display as VAR(arg1, arg2, ...). (No TEXT_VARIABLE mapping; UI-friendly + roundtrippable.)
function decodeWordsByPopping(stackWords, symbols) {
  // stackWords: array of u16 values in the same order as stored after decryption.
  // We pop() from the end, exactly like the spec.
  const s = stackWords.slice(); // copy so we can pop
  let out = "";

  while (s.length) {
    const w = (s.pop() ?? 0) & 0xFFFF;

    if (w === 0xFFFF) break; // -1
    if (w === 0xFFFE) {      // -2 : variable
      const count = (s.pop() ?? 0) & 0xFFFF;
      const args = [];
      for (let k = 0; k < count; k++) args.push((s.pop() ?? 0) & 0xFFFF);
      out += "VAR(" + args.map(String).join(", ") + ")";
      continue;
    }

    if (w === 0xF100) {
      const { text, wordsConsumedAfterMarker } = decodeTrainerName15Bit(words, i, symbols);
      out += text;
      i += wordsConsumedAfterMarker; // skips the packed words; loop will i++ next
      continue;
    }

    const sym = symLookup(symbols, w);
    if (sym != null) {
      out += sym;
      continue;
    }

    // fallback if symbol missing
    if (w >= 0x20 && w <= 0x7E) out += String.fromCharCode(w);
    else out += "\\x" + w.toString(16).toUpperCase().padStart(4, "0");
  }

  return out;
}

function encodeStringToWords_textOrder(s, symbols) {
  // If symbols provided, build a reverse map for single-char symbols.
  let symRev = null;
  if (symbols) {
    symRev = new Map();
    for (let i = 0; i < symbols.length; i++) {
      const v = symbols[i];
      if (typeof v === "string" && v.length === 1) {
        if (!symRev.has(v)) symRev.set(v, i);
      }
    }
  }

  const out = [];
  for (let i = 0; i < s.length; ) {
    // VAR(...)
    if (s.startsWith("VAR(", i)) {
      const close = s.indexOf(")", i + 4);
      if (close === -1) throw new Error(`Unclosed VAR( at ${i}`);
      const inner = s.slice(i + 4, close).trim();
      const parts = inner.length ? inner.split(",").map(p => p.trim()).filter(Boolean) : [];
      const args = parts.map(p => {
        const v = (p.startsWith("0x") || p.startsWith("0X")) ? parseInt(p, 16) : parseInt(p, 10);
        if (!Number.isFinite(v)) throw new Error(`Bad VAR arg "${p}"`);
        return v & 0xFFFF;
      });
      out.push(0xFFFE, args.length & 0xFFFF, ...args);
      i = close + 1;
      continue;
    }

    // \xNNNN
    if (s[i] === "\\" && s[i + 1] === "x") {
      const hex = s.slice(i + 2, i + 6);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new Error(`Bad \\x escape at ${i}`);
      out.push(parseInt(hex, 16) & 0xFFFF);
      i += 6;
      continue;
    }

    const ch = s[i];
    if (symRev && symRev.has(ch)) {
      out.push(symRev.get(ch) & 0xFFFF);
    } else {
      // fallback: char code as index
      out.push(ch.charCodeAt(0) & 0xFFFF);
    }
    i += 1;
  }

  // Append terminator in text order
  out.push(0xFFFF);
  return out;
}

// ---- Main parse/serialize ----
export function parseGen4MsgBank(u8, opts = {}) {
  const symbols = opts.symbols || null;

  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let off = 0;

  const num = readU16(dv, off); off += 2;
  const seed = readU16(dv, off); off += 2;

  // offsets + sizes are stored as encrypted u32 pairs
  const offsets = new Array(num);
  const sizes = new Array(num);

  for (let i = 1; i <= num; i++) {
    const k16 = (seed * i * 0x2FD) & 0xFFFF;
    const key32 = (k16 | (k16 << 16)) >>> 0;

    const encOff = readU32(dv, off); off += 4;
    const encSz  = readU32(dv, off); off += 4;

    offsets[i - 1] = (encOff ^ key32) >>> 0;
    sizes[i - 1]   = (encSz  ^ key32) >>> 0;
  }

  const entries = [];
  for (let i = 1; i <= num; i++) {
    const entryOffset = offsets[i - 1] >>> 0;
    const sizeWords = sizes[i - 1] >>> 0;

    // decrypt u16 stream in file order
    let key = (0x91BD3 * i) & 0xFFFF;

    const fileOrder = new Array(sizeWords);
    let p = entryOffset;
    for (let j = 0; j < sizeWords; j++) {
      const w = readU16(dv, p); p += 2;
      fileOrder[j] = (w ^ key) & 0xFFFF;
      key = (key + 0x493D) & 0xFFFF;
    }

    let compressed = false;

    // compression marker is at fileOrder[0] in real files per spec (string[1] == 0xF100)
    let fileOrderDecrypted = fileOrder;
    let textOrderWords;

    const text = decodeGen4Auto(fileOrderDecrypted, symbols);



    entries.push({
      index: i - 1,
      offset: entryOffset,
      sizeWords,
      compressed,
      text,
    });
  }

  const original = new Uint8Array(u8); // safe copy for exact roundtrip

  const model = {
    kind: "gen4_msg_bank",
    header: { num, seed },
    entries,
    _original: original,
    _dirty: false,
    _symbols: symbols,

    getText(i) { return entries[i].text; },
    setText(i, t) {
      if (entries[i].text !== t) {
        entries[i].text = t;
        model._dirty = true;
      }
    },
    getEntryMeta(i) {
      const e = entries[i];
      return { compressed: e.compressed };
    },
    setEntryMeta(i, meta) {
      const e = entries[i];
      if (meta && typeof meta.compressed === "boolean" && meta.compressed !== e.compressed) {
        e.compressed = meta.compressed;
        model._dirty = true;
      }
    },

    serialize() {
      if (!model._dirty) return new Uint8Array(model._original);

      const num2 = entries.length;
      const headerLen = 4 + num2 * 8; // u16 num, u16 seed, then num*(u32 off + u32 size)

      // Build decrypted file-order payloads first (per entry)
      const fileOrderPayloads = new Array(num2);
      const sizesWords2 = new Array(num2);

      for (let idx = 0; idx < num2; idx++) {
        const e = entries[idx];

        // 1) string -> text-order u16 stream (includes 0xFFFF terminator at end)
        const textOrder = encodeStringToWords_textOrder(e.text, model._symbols);

        // 2) convert to file-order by reversing
        let fileOrder = textOrder.slice().reverse(); // terminator becomes first element

        if (e.compressed) {
          // For compressed, we pack the *textOrder* (including terminator at end) to 9-bit,
          // then store in file as: [0xF100, ...packedWords, 0xFFFF]
          const packedWords = compress9Bit(textOrder);
          fileOrder = [0xF100, ...packedWords, 0xFFFF];
        }

        fileOrderPayloads[idx] = fileOrder;
        sizesWords2[idx] = fileOrder.length;
      }

      // Compute offsets (absolute from start of file)
      const offsets2 = new Array(num2);
      let cursor = headerLen;
      for (let i = 0; i < num2; i++) {
        offsets2[i] = cursor;
        cursor += sizesWords2[i] * 2;
      }

      const out = new Uint8Array(cursor);
      const dv = new DataView(out.buffer);

      writeU16(dv, 0, num2);
      writeU16(dv, 2, model.header.seed);

      // Write encrypted offsets/sizes
      let t = 4;
      for (let i = 1; i <= num2; i++) {
        const k16 = (model.header.seed * i * 0x2FD) & 0xFFFF;
        const key32 = (k16 | (k16 << 16)) >>> 0;

        writeU32(dv, t, (offsets2[i - 1] ^ key32) >>> 0); t += 4;
        writeU32(dv, t, (sizesWords2[i - 1] ^ key32) >>> 0); t += 4;
      }

      // Write encrypted strings
      for (let i = 1; i <= num2; i++) {
        const fileOrder = fileOrderPayloads[i - 1];
        let key = (0x91BD3 * i) & 0xFFFF;

        let p = offsets2[i - 1];
        for (let j = 0; j < fileOrder.length; j++) {
          const enc = (fileOrder[j] ^ key) & 0xFFFF;
          writeU16(dv, p, enc);
          p += 2;
          key = (key + 0x493D) & 0xFFFF;
        }
      }

      return out;
    },
  };

  return model;
}

export const _dev = { eqBytes };
