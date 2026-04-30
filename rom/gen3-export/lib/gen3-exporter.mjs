import { abilitiesById, itemsById, monsById, movesById } from "../data/showdown-defaults.mjs";
import { savMoveNames, savPokNames } from "../data/dynamic-calc-enums.mjs";
import { buildDdexSearchIndex } from "./ddex-search-index.mjs";
import { formatAssignedJs, formatSearchIndexJs } from "./file-formats.mjs";
import { parseHmaToml } from "./hma-toml.mjs";

const PHYSICAL_TYPES_GEN3 = new Set([
  "Normal",
  "Fighting",
  "Flying",
  "Poison",
  "Ground",
  "Rock",
  "Bug",
  "Ghost",
  "Steel",
]);

const GEN3_TYPE_NAME_ALIASES = {
  normal: "Normal",
  fight: "Fighting",
  fighting: "Fighting",
  flying: "Flying",
  poison: "Poison",
  ground: "Ground",
  rock: "Rock",
  bug: "Bug",
  ghost: "Ghost",
  steel: "Steel",
  mystery: "???",
  "????": "???",
  fire: "Fire",
  water: "Water",
  grass: "Grass",
  electr: "Electric",
  electric: "Electric",
  psychc: "Psychic",
  psychic: "Psychic",
  ice: "Ice",
  dragon: "Dragon",
  dark: "Dark",
};

const MAP_HEADER_EVENTS_POINTER_OFFSET = 4;
const MAP_EVENTS_OBJECT_COUNT_OFFSET = 0;
const MAP_EVENTS_OBJECTS_POINTER_OFFSET = 4;
const MAP_OBJECT_ENTRY_SIZE = 24;
const MAP_OBJECT_SCRIPT_POINTER_OFFSET = 16;
const TRAINER_BATTLE_SCAN_LIMIT = 4096;
const TRAINER_BATTLE_OPCODE = 0x5C;
const TRAINER_BATTLE_END_OPCODE = 0x6C;
const TRAINER_BATTLE_END_VARIANT = 0x02;
const TRAINER_BATTLE_MAX_VARIANT = 0x0C;
const VS_SEEKER_MATCH_COUNT = 6;
const VS_SEEKER_ENTRY_SIZE = 14;

const NATURES = [
  "Hardy", "Lonely", "Brave", "Adamant", "Naughty",
  "Bold", "Docile", "Relaxed", "Impish", "Lax",
  "Timid", "Hasty", "Serious", "Jolly", "Naive",
  "Modest", "Mild", "Quiet", "Bashful", "Rash",
  "Calm", "Gentle", "Sassy", "Careful", "Quirky",
];

const ASCII_TABLE = {
  " ": 0, A: 187, B: 188, C: 189, D: 190, E: 191, F: 192, G: 193, H: 194, I: 195, J: 196,
  K: 197, L: 198, M: 199, N: 200, O: 201, P: 202, Q: 203, R: 204, S: 205, T: 206, U: 207,
  V: 208, W: 209, X: 210, Y: 211, Z: 212, a: 213, b: 214, c: 215, d: 216, e: 217, f: 218,
  g: 219, h: 220, i: 221, j: 222, k: 223, l: 224, m: 225, n: 226, o: 227, p: 228, q: 229,
  r: 230, s: 231, t: 232, u: 233, v: 234, w: 235, x: 236, y: 237, z: 238, 2: 163, "-": 174,
  "♂": 181, "♀": 182, "&": 45, "+": 46, "=": 53, ";": 54, ".": 173, "’": 180,
};

const SPECIES_DEFAULT_ID_ALIASES = {
  fletchindr: "fletchinder",
  flabb: "flabebe",
  aegislash: "aegislashshield",
  meowscrada: "meowscarada",
  crabminble: "crabominable",
  blacphalon: "blacephalon",
  corvsquire: "corvisquire",
  corvknight: "corviknight",
  baraskewda: "barraskewda",
  centskorch: "centiskorch",
  poltegeist: "polteageist",
  stonjorner: "stonjourner",
};

const SPECIES_DISPLAY_OVERRIDES = {
  "": "?",
  badegg: "Bad Egg",
  warrior: "Warrior",
};
for (const letter of "BCDEFGHIJKLMNOPQRSTUVWXYZ") {
  SPECIES_DISPLAY_OVERRIDES[`unown${letter.toLowerCase()}`] = `Unown-${letter}`;
}

const ITEM_DEFAULT_ID_ALIASES = { pokball: "pokeball" };
const ITEM_DISPLAY_OVERRIDES = {
  pokball: "Poke Ball",
  paralyzheal: "Paralyze Heal",
  lumiosegal: "Lumiose Galette",
  shaloursable: "Shalour Sable",
};

const ABILITY_DEFAULT_ID_ALIASES = {
  neutralgas: "neutralizinggas",
  emergncyexit: "emergencyexit",
  wandringsoul: "wanderingspirit",
  powercnstrct: "powerconstruct",
  watercompact: "watercompaction",
  electricsrge: "electricsurge",
  primordalsea: "primordialsea",
  gorillatctcs: "gorillatactics",
  queenmajesty: "queenlymajesty",
  intrepidswrd: "intrepidsword",
  screencleanr: "screencleaner",
};

const ABILITY_DISPLAY_OVERRIDES = {
  alchemcpower: "Alchemic Power",
  portalpower: "Portal Power",
  valiantshld: "Valiant Shield",
};

const PCS_SPECIAL = {
  0x00: " ",
  0xAB: "!",
  0xAC: "?",
  0xAD: ".",
  0xAE: "-",
  0xB0: "...",
  0xB1: "\"",
  0xB2: "\"",
  0xB3: "'",
  0xB4: "'",
  0xB5: "M",
  0xB6: "F",
  0xB8: ",",
  0xB9: "x",
  0xBA: "/",
  0xE0: "'",
  0xFA: "\n",
  0xFB: "\n",
  0xFE: "\n",
};

for (let index = 0; index < 10; index += 1) PCS_SPECIAL[0xA1 + index] = String(index);
for (let index = 0; index < 26; index += 1) PCS_SPECIAL[0xBB + index] = String.fromCharCode("A".charCodeAt(0) + index);
for (let index = 0; index < 26; index += 1) PCS_SPECIAL[0xD5 + index] = String.fromCharCode("a".charCodeAt(0) + index);

function lastBracketSuffix(text) {
  const index = text.lastIndexOf("]");
  return index === -1 ? text : text.slice(index + 1);
}

class Layout {
  constructor(data) {
    this.general = data.General || {};
    this.showRawIVByte = Boolean(this.general.ShowRawIVByteForTrainer);
    this.anchors = {};
    for (const raw of data.NamedAnchors || []) {
      this.anchors[raw.Name] = {
        name: raw.Name,
        address: Number(raw.Address),
        format: raw.Format,
        offset: Number(raw.Offset || 0),
      };
    }
    this.matchedWords = {};
    for (const raw of data.MatchedWords || []) {
      this.matchedWords[raw.Name] ||= [];
      this.matchedWords[raw.Name].push({
        name: raw.Name,
        address: Number(raw.Address),
        length: Number(raw.Length),
        offset: Number(raw.Offset || 0),
      });
    }
    this.lists = {};
    for (const raw of data.List || []) {
      const values = [];
      const keys = Object.keys(raw).filter((key) => /^\d+$/.test(key)).sort((left, right) => Number(left) - Number(right));
      for (const key of keys) values.push(...raw[key]);
      this.lists[raw.Name] = values;
    }
  }

  anchor(name) {
    if (!this.anchors[name]) throw new Error(`Missing required anchor: ${name}`);
    return this.anchors[name];
  }

  anchorOptional(name) {
    return this.anchors[name] || null;
  }
}

class RomReader {
  constructor(romBytes) {
    this.rom = romBytes instanceof Uint8Array ? romBytes : new Uint8Array(romBytes);
    this.length = this.rom.length;
    this.view = new DataView(this.rom.buffer, this.rom.byteOffset, this.rom.byteLength);
  }

  readU8(offset) {
    return this.view.getUint8(offset);
  }

  readS8(offset) {
    return this.view.getInt8(offset);
  }

  readU16(offset) {
    return this.view.getUint16(offset, true);
  }

  readU32(offset) {
    return this.view.getUint32(offset, true);
  }

  readPointer(offset) {
    const raw = this.readU32(offset);
    if (raw < 0x08000000) return 0;
    const pointer = raw - 0x08000000;
    if (pointer >= this.length) return 0;
    return pointer;
  }

  readBytes(offset, size) {
    return this.rom.slice(offset, offset + size);
  }

  decodeFixedString(offset, size) {
    return decodePcs(this.readBytes(offset, size));
  }

  decodePointerString(pointer) {
    if (!pointer) return "";
    const result = [];
    for (let index = pointer; index < this.length; index += 1) {
      const value = this.rom[index];
      result.push(value);
      if (value === 0xFF) break;
    }
    return decodePcs(Uint8Array.from(result));
  }
}

function decodePcs(data) {
  const pieces = [];
  for (let index = 0; index < data.length; index += 1) {
    const value = data[index];
    if ((value === 0xFF || value === 0x00) && !pieces.length) {
      if (value === 0xFF) break;
    }
    if (value === 0xFF) break;
    if (value === 0xFC && index + 1 < data.length) {
      const control = data[index + 1];
      index += 1;
      if (control === 0x00) pieces.push("{COLOR}");
      else if (control === 0x01) pieces.push("{HIGHLIGHT}");
      else if (control === 0x0F) pieces.push("{CLEAR}");
      else if (control === 0x16 || control === 0x17) pieces.push("{PAUSE}");
      if ((control === 0x08 || control === 0x09 || control === 0x0A) && index + 1 < data.length) {
        index += 1;
      }
      continue;
    }
    if (value === 0xFD && index + 1 < data.length) {
      index += 1;
      continue;
    }
    pieces.push(PCS_SPECIAL[value] || "");
  }
  return normalizeDisplayText(pieces.join(""));
}

function normalizeDisplayText(text) {
  return String(text)
    .replaceAll("{COLOR}", "")
    .replaceAll("{HIGHLIGHT}", "")
    .replaceAll("{CLEAR}", "")
    .replaceAll("{PAUSE}", "")
    .replaceAll("POKeMON", "Pokemon")
    .replaceAll("POKEMON", "Pokemon")
    .replaceAll("\u2642", "-M")
    .replaceAll("\u2640", "-F")
    .replaceAll("♂", "-M")
    .replaceAll("♀", "-F")
    .replaceAll("’", "'")
    .replaceAll("PkMn", "Pokemon")
    .replaceAll("\r", "")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function addWordBreaks(text) {
  return String(text)
    .replace(/(?<=[a-z0-9])(?=[A-Z])/g, " ")
    .replace(/(?<=[A-Z])(?=[A-Z][a-z])/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\bTm(\d+)\b/g, "TM$1")
    .replace(/\bHm(\d+)\b/g, "HM$1")
    .trim();
}

function capitalizeWords(text) {
  return String(text)
    .split(/(\s+|-)/)
    .map((part) => (part && !/^\s+$/.test(part) && part !== "-" ? part.slice(0, 1).toUpperCase() + part.slice(1).toLowerCase() : part))
    .join("");
}

function toId(text) {
  return String(text).toLowerCase().replace(/é/g, "e").replace(/[^a-z0-9]+/g, "");
}

function resolveNameWithDefaults(rawName, defaults, options = {}) {
  const normalized = addWordBreaks(normalizeDisplayText(rawName));
  const key = toId(normalized);
  if (defaults[key]) return defaults[key].name || normalized;
  if (options.idAliases && options.idAliases[key] && defaults[options.idAliases[key]]) {
    return defaults[options.idAliases[key]].name || normalized;
  }
  if (options.displayOverrides && options.displayOverrides[key]) return options.displayOverrides[key];
  return normalized;
}

function parseCountExpr(expr, resolver) {
  const trimmed = String(expr).trim();
  if (/^\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10);
  const tokens = trimmed.match(/[+-]?[^+-]+/g) || [];
  let total = 0;
  for (const rawToken of tokens) {
    const sign = rawToken.startsWith("-") ? -1 : 1;
    const token = rawToken.replace(/^[+-]/, "").trim();
    const value = /^\d+$/.test(token) ? Number.parseInt(token, 10) : resolver(token);
    total += sign * value;
  }
  return total;
}

function extractFixedStringLength(formatString) {
  const match = String(formatString).match(/""(\d+)/);
  if (!match) throw new Error(`Unable to extract fixed string length from ${formatString}`);
  return Number.parseInt(match[1], 10);
}

function splitMoveNameSubstitutions(name) {
  const substitutions = {
    Bubblebeam: "Bubble Beam",
    Doubleslap: "Double Slap",
    Solarbeam: "Solar Beam",
    Sonicboom: "Sonic Boom",
    Poisonpowder: "Poison Powder",
    Thunderpunch: "Thunder Punch",
    Thundershock: "Thunder Shock",
    Ancientpower: "Ancient Power",
    Extremespeed: "Extreme Speed",
    Dragonbreath: "Dragon Breath",
    Dynamicpunch: "Dynamic Punch",
    Grasswhistle: "Grass Whistle",
    Featherdance: "Feather Dance",
    Selfdestruct: "Self-Destruct",
    Softboiled: "Soft-Boiled",
    Vicegrip: "Vise Grip",
    "Hi Jump Kick": "High Jump Kick",
    Smellingsalt: "Smelling Salts",
    "Sand-Attack": "Sand Attack",
  };
  return substitutions[name] || name;
}

function normalizeSpeciesName(name) {
  return resolveNameWithDefaults(name, monsById, {
    idAliases: SPECIES_DEFAULT_ID_ALIASES,
    displayOverrides: SPECIES_DISPLAY_OVERRIDES,
  });
}

function normalizeMoveName(name) {
  const cleaned = normalizeDisplayText(name);
  return resolveNameWithDefaults(cleaned === cleaned.toUpperCase() ? capitalizeWords(cleaned) : cleaned, movesById);
}

function normalizeItemName(name) {
  const cleaned = normalizeDisplayText(name);
  return resolveNameWithDefaults(cleaned === cleaned.toUpperCase() ? capitalizeWords(cleaned) : cleaned, itemsById, {
    idAliases: ITEM_DEFAULT_ID_ALIASES,
    displayOverrides: ITEM_DISPLAY_OVERRIDES,
  });
}

function normalizeAbilityName(name) {
  const cleaned = normalizeDisplayText(name);
  return resolveNameWithDefaults(cleaned === cleaned.toUpperCase() ? capitalizeWords(cleaned) : cleaned, abilitiesById, {
    idAliases: ABILITY_DEFAULT_ID_ALIASES,
    displayOverrides: ABILITY_DISPLAY_OVERRIDES,
  });
}

function normalizeTypeName(name) {
  const cleaned = normalizeDisplayText(name);
  const aliasKey = String(cleaned).toLowerCase().replace(/é/g, "e").replace(/[^a-z0-9?]+/g, "");
  if (GEN3_TYPE_NAME_ALIASES[aliasKey]) return GEN3_TYPE_NAME_ALIASES[aliasKey];
  return cleaned === cleaned.toUpperCase() ? capitalizeWords(cleaned) : cleaned;
}

function normalizeCalcMoveComparisonName(name) {
  const cleaned = normalizeDisplayText(name);
  return splitMoveNameSubstitutions(cleaned === cleaned.toUpperCase() ? capitalizeWords(cleaned) : cleaned);
}

function normalizeCalcSpeciesComparisonName(name) {
  const cleaned = normalizeDisplayText(name);
  return cleaned === cleaned.toUpperCase() ? capitalizeWords(cleaned) : cleaned;
}

function buildReplacementMaps(referenceNames, romCompareNames, romOutputNames, normalizeReference, normalizeRomCompare) {
  const displayReplacements = {};
  const idReplacements = {};
  const placeholders = new Set(["?", "-----"]);
  for (let index = 1; index < Math.min(referenceNames.length, romCompareNames.length, romOutputNames.length); index += 1) {
    const referenceName = normalizeReference(referenceNames[index]);
    const romCompareName = normalizeRomCompare(romCompareNames[index]);
    const romName = romOutputNames[index];
    if (!referenceName || !romCompareName || !romName || placeholders.has(referenceName) || placeholders.has(romCompareName) || placeholders.has(romName) || toId(referenceName) === toId(romCompareName)) continue;
    displayReplacements[referenceName] = romName;
    const referenceId = toId(referenceName);
    const romId = toId(romName);
    if (referenceId && romId) idReplacements[referenceId] = romId;
  }
  return [displayReplacements, idReplacements];
}

function prettifyLocationName(name) {
  const cleaned = normalizeDisplayText(name).replaceAll("\\CC0000", " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return cleaned;
  return cleaned
    .split(" ")
    .map((token) => {
      if (/^(?:[A-Za-z]\.){2,}$/.test(token)) return token.toUpperCase();
      return token.slice(0, 1).toUpperCase() + token.slice(1).toLowerCase();
    })
    .join(" ");
}

function normalizeTrainerDisplayName(name) {
  const cleaned = normalizeDisplayText(name).trim();
  return cleaned === cleaned.toUpperCase() ? capitalizeWords(cleaned) : cleaned;
}

function ensureNumberedTrainerSuffixSpacing(name) {
  return /\d+$/.test(name) ? `${name} ` : name;
}

function buildTrainerSetLabel(level, visibleName, duplicateIndex) {
  const duplicateSuffix = "*".repeat(Math.max(0, duplicateIndex - 1));
  return `Lvl ${level}${duplicateSuffix} ${visibleName}`;
}

function buildTrainerSetLabelWithLocation(level, visibleName, duplicateIndex, locationName = "") {
  const baseLabel = buildTrainerSetLabel(level, locationName ? String(visibleName).trimEnd() : visibleName, duplicateIndex);
  return locationName ? `${baseLabel} - ${locationName}` : baseLabel;
}

function addTrainerLocation(mapping, trainerId, locationName) {
  if (!Number.isInteger(trainerId) || trainerId <= 0 || !locationName) return;
  mapping[trainerId] ||= [];
  if (!mapping[trainerId].includes(locationName)) mapping[trainerId].push(locationName);
}

function scanTrainerBattleId(rom, pointer) {
  const end = Math.min(rom.length - 3, pointer + TRAINER_BATTLE_SCAN_LIMIT);
  for (let offset = pointer; offset <= end; offset += 1) {
    if (rom[offset] === TRAINER_BATTLE_END_OPCODE && rom[offset + 1] === TRAINER_BATTLE_END_VARIANT) return null;
    if (rom[offset] === TRAINER_BATTLE_OPCODE && rom[offset + 1] <= TRAINER_BATTLE_MAX_VARIANT) {
      return rom[offset + 2] | (rom[offset + 3] << 8);
    }
  }
  return null;
}

function ivByteToStatIv(value) {
  return Math.min(31, Math.max(0, Math.floor((value * 31 / 255) + 0.5)));
}

function computeTrainerHash(name) {
  let total = 0;
  for (const char of String(name).toUpperCase()) total += ASCII_TABLE[char] || 0;
  return total;
}

function computeTrainerNatures(trainerName, pokemonNames, typeValue) {
  const trainerHash = computeTrainerHash(trainerName);
  let accumulatedHash = 0;
  const results = [];
  for (const pokemonName of pokemonNames) {
    let pokemonHash = accumulatedHash;
    const normalized = String(pokemonName)
      .toUpperCase()
      .replaceAll("-M", "♂")
      .replaceAll("-F", "♀")
      .replaceAll("'", "’");
    for (const char of normalized) pokemonHash += ASCII_TABLE[char] || 0;
    const totalHash = pokemonHash + trainerHash;
    accumulatedHash = totalHash;
    const pid = (totalHash * 256) + typeValue;
    results.push({ nature: NATURES[pid % 25], pid, totalHash });
  }
  return results;
}

function buildSpeciesAbilitySlots(species, abilityNames) {
  const slots = {};
  const ordered = [];
  if (species.abilityIds[0] && species.abilityIds[0] < abilityNames.length) {
    slots["0"] = abilityNames[species.abilityIds[0]];
    ordered.push(slots["0"]);
  }
  if (
    species.abilityIds[1] &&
    species.abilityIds[1] < abilityNames.length &&
    abilityNames[species.abilityIds[1]] !== slots["0"]
  ) {
    slots["1"] = abilityNames[species.abilityIds[1]];
    ordered.push(slots["1"]);
  }
  if (
    species.abilityIds[2] &&
    species.abilityIds[2] < abilityNames.length &&
    !ordered.includes(abilityNames[species.abilityIds[2]])
  ) {
    slots.H = abilityNames[species.abilityIds[2]];
    ordered.push(slots.H);
  }
  return [slots, ordered];
}

function chooseAbilityFromPid(speciesSlots, pid, abilityMode = null) {
  const normalSlots = ["0", "1"].filter((key) => key in speciesSlots).map((key) => speciesSlots[key]);
  const allSlots = normalSlots.concat("H" in speciesSlots ? [speciesSlots.H] : []);
  if (!allSlots.length) return "";
  if (abilityMode === "Ability1") return speciesSlots["0"] || allSlots[0];
  if (abilityMode === "Ability2") return speciesSlots["1"] || speciesSlots["0"] || allSlots[0];
  if (abilityMode === "Hidden") return speciesSlots.H || allSlots[0];
  if (abilityMode === "RandomAny") return allSlots[pid % allSlots.length];
  if (normalSlots.length <= 1) return normalSlots[0] || allSlots[0];
  return normalSlots[pid & 1];
}

function dedupePreserveOrder(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function defaultMoveNames(levelUp, moveNames, level) {
  const available = levelUp
    .filter(([learnedLevel, moveId]) => learnedLevel <= level && moveId > 0 && moveId < moveNames.length)
    .map(([, moveId]) => moveNames[moveId]);
  return available.slice(-4);
}

function evoToDdex(methodName, arg, extra, itemNames, moveNames, typeNames) {
  const normalized = methodName.toLowerCase();
  if (methodName === "Happiness") return ["levelFriendship", ""];
  if (methodName === "Happy Day" || methodName === "Happy Night") return ["levelExtra", methodName];
  if (methodName === "Level") return ["level", arg];
  if (methodName === "Trade") return ["trade", ""];
  if (methodName === "Trade Item") return ["trade", itemNames[arg] || arg];
  if (methodName === "Stone" || methodName === "Use Item") return ["useItem", itemNames[arg] || arg];
  if (methodName.includes("Move")) return ["levelMove", moveNames[arg] || arg];
  if (methodName === "Beauty") return ["levelExtra", "Beauty"];
  if (methodName.includes("Happiness")) return ["levelFriendship", ""];
  if (methodName.includes("Trade")) return ["trade", arg ? (itemNames[arg] || "") : ""];
  if (methodName.includes("Item") || methodName.includes("Stone")) return ["item", itemNames[arg] || arg];
  if (methodName.includes("Type")) return ["levelExtra", `${methodName}: ${typeNames[arg] || String(arg)}`];
  if (normalized.startsWith("level") && arg) return ["levelExtra", `L${arg} ${methodName}`];
  return ["levelExtra", arg ? `${methodName}: ${arg}` : methodName];
}

function duplicateLocationIds(names) {
  const counts = {};
  return names.map((name) => {
    const base = toId(name);
    counts[base] = (counts[base] || 0) + 1;
    if (counts[base] === 1) return [base, name];
    return [`${base}section${counts[base]}`, `${name} Section ${counts[base]}`];
  });
}

function splitFishingEncounters(encounters) {
  return {
    old_rod: encounters.slice(0, 2),
    good_rod: encounters.slice(2, 5),
    super_rod: encounters.slice(5, 10),
  };
}

function globalGen3Rates() {
  return {
    grass: [20, 20, 10, 10, 10, 10, 5, 5, 4, 4, 1, 1],
    surf: [60, 30, 5, 4, 1],
    rock_smash: [60, 30, 5, 4, 1],
    old_rod: [70, 30],
    good_rod: [60, 20, 20],
    super_rod: [40, 40, 15, 4, 1],
  };
}

function parseLevelUpPacked(rom, pointer) {
  const entries = [];
  for (let offset = pointer; offset + 2 <= rom.length; offset += 2) {
    const value = rom[offset] | (rom[offset + 1] << 8);
    if (value === 0xFFFF) break;
    entries.push([value >> 9, value & 0x01FF]);
  }
  return entries;
}

function parseLevelUpWide(rom, pointer) {
  const entries = [];
  for (let offset = pointer; offset + 4 <= rom.length; offset += 4) {
    const moveId = rom[offset] | (rom[offset + 1] << 8);
    const level = rom[offset + 2] | (rom[offset + 3] << 8);
    if (moveId === 0xFFFF && level === 0xFFFF) break;
    entries.push([level, moveId]);
  }
  return entries;
}

function parseLevelUpJambo(rom, pointer) {
  const entries = [];
  for (let offset = pointer; offset + 3 <= rom.length; offset += 3) {
    const chunk = rom.slice(offset, offset + 3);
    if (chunk[0] === 0x00 && chunk[1] === 0x00 && chunk[2] === 0xFF) break;
    entries.push([chunk[2], chunk[0] | (chunk[1] << 8)]);
  }
  return entries;
}

function scoreLevelUpEntries(entries, moveCount) {
  if (!entries.length) return 0;
  let score = 0;
  const sample = entries.slice(0, 16);
  for (const [level, moveId] of sample) {
    if (moveId > 0 && moveId < moveCount) score += 2;
    else if (moveId === 0) score -= 2;
    else score -= 4;
    if (level >= 1 && level <= 100) score += 2;
    else if (level === 0) score -= 3;
    else score -= 4;
  }
  if (new Set(sample.map(([level]) => level)).size >= 4) score += 4;
  return score;
}

function parseWildBlock(reader, pointer, slots) {
  if (!pointer) return null;
  const encounters = [];
  const start = pointer + 4;
  for (let slot = 0; slot < slots; slot += 1) {
    encounters.push({
      species: reader.readU16(start + slot * 4 + 2),
      mn: reader.readU8(start + slot * 4),
      mx: reader.readU8(start + slot * 4 + 1),
    });
  }
  return { rate: reader.readU8(pointer), encs: encounters };
}

function parseWildFishBlock(reader, pointer) {
  return parseWildBlock(reader, pointer, 10);
}

class ExportContext {
  constructor(romBytes, tomlText) {
    this.layout = new Layout(parseHmaToml(tomlText));
    this.reader = new RomReader(romBytes);
    this._counts = {};
    this._cache = {};
  }

  readConstant(name) {
    const entries = this.layout.matchedWords[name];
    if (!entries?.length) throw new Error(`Missing matched word constant: ${name}`);
    const match = entries[0];
    let value = 0;
    const bytes = this.reader.readBytes(match.address + match.offset, match.length);
    for (let index = 0; index < bytes.length; index += 1) value |= bytes[index] << (index * 8);
    return value;
  }

  resolveCount(name) {
    if (name in this._counts) return this._counts[name];
    if (this.layout.anchors[name]) {
      const count = parseCountExpr(lastBracketSuffix(this.layout.anchor(name).format), (token) => this.resolveCount(token));
      this._counts[name] = count;
      return count;
    }
    if (this.layout.matchedWords[name]) {
      const count = this.readConstant(name);
      this._counts[name] = count;
      return count;
    }
    throw new Error(`Unknown count expression token: ${name}`);
  }

  fixedStringTable(anchorName) {
    const cacheKey = `fixed:${anchorName}`;
    if (cacheKey in this._cache) return this._cache[cacheKey];
    const anchor = this.layout.anchor(anchorName);
    const count = this.resolveCount(anchorName);
    const size = extractFixedStringLength(anchor.format);
    const values = [];
    for (let index = 0; index < count; index += 1) {
      values.push(this.reader.decodeFixedString(anchor.address + index * size, size));
    }
    this._cache[cacheKey] = values;
    return values;
  }

  pointerStringTable(anchorName, countExpr = null) {
    const cacheKey = `ptr:${anchorName}:${countExpr || ""}`;
    if (cacheKey in this._cache) return this._cache[cacheKey];
    const anchor = this.layout.anchor(anchorName);
    const count = countExpr ? parseCountExpr(countExpr, (token) => this.resolveCount(token)) : this.resolveCount(anchorName);
    const values = [];
    for (let index = 0; index < count; index += 1) {
      values.push(this.reader.decodePointerString(this.reader.readPointer(anchor.address + index * 4)));
    }
    this._cache[cacheKey] = values;
    return values;
  }

  speciesNames() {
    return this.fixedStringTable("data.pokemon.names").map((value) => normalizeSpeciesName(value));
  }

  speciesNamesByNationalDex() {
    if (this._cache.speciesNamesByNationalDex) return this._cache.speciesNamesByNationalDex;
    const names = this.speciesNames();
    const anchor = this.layout.anchorOptional("data.pokedex.national");
    if (!anchor) {
      this._cache.speciesNamesByNationalDex = names;
      return names;
    }
    const count = this.resolveCount("data.pokedex.national");
    const values = [""];
    for (let index = 0; index < count; index += 1) {
      const speciesId = this.reader.readU16(anchor.address + index * 2);
      values.push(speciesId >= 0 && speciesId < names.length ? names[speciesId] : "");
    }
    this._cache.speciesNamesByNationalDex = values;
    return values;
  }

  moveNames() {
    return this.fixedStringTable("data.pokemon.moves.names").map((value) => splitMoveNameSubstitutions(normalizeMoveName(value)));
  }

  abilityNames() {
    return this.fixedStringTable("data.abilities.names").map((value) => normalizeAbilityName(value));
  }

  trainerClassNames() {
    return this.fixedStringTable("data.trainers.classes.names").map((value) => normalizeDisplayText(value));
  }

  typeNames() {
    if (this._cache.types) return this._cache.types;
    const anchor = this.layout.anchor("data.pokemon.type.names");
    const size = extractFixedStringLength(anchor.format);
    const count = parseCountExpr(lastBracketSuffix(anchor.format), (token) => this.resolveCount(token));
    const values = [];
    for (let index = 0; index < count; index += 1) {
      values.push(normalizeTypeName(this.reader.decodeFixedString(anchor.address + index * size, size)));
    }
    this._cache.types = values;
    return values;
  }

  natureNames() {
    return this.pointerStringTable("data.pokemon.natures.names").map((value) => normalizeDisplayText(value));
  }

  abilityDescriptions() {
    return this.pointerStringTable("data.abilities.descriptions", "data.abilities.names");
  }

  moveDescriptions() {
    return this.pointerStringTable("data.pokemon.moves.descriptions", lastBracketSuffix(this.layout.anchor("data.pokemon.moves.descriptions").format));
  }

  itemStats() {
    if (this._cache.itemStats) return this._cache.itemStats;
    const anchor = this.layout.anchor("data.items.stats");
    const count = this.resolveCount("data.items.stats");
    const items = [];
    for (let index = 0; index < count; index += 1) {
      const start = anchor.address + index * 44;
      items.push({
        id: index,
        name: normalizeItemName(this.reader.decodeFixedString(start, 13)),
        desc: this.reader.decodePointerString(this.reader.readPointer(start + 20)),
      });
    }
    this._cache.itemStats = items;
    return items;
  }

  moveStats() {
    if (this._cache.moveStats) return this._cache.moveStats;
    const anchor = this.layout.anchor("data.pokemon.moves.stats.battle");
    const names = this.moveNames();
    const typeNames = this.typeNames();
    const hasCategory = anchor.format.includes("category.movecategory");
    const shiftedLayout = !hasCategory ? this.usesShiftedMoveLayout(anchor, typeNames, names) : false;
    const moves = [];
    for (let index = 0; index < names.length; index += 1) {
      const start = anchor.address + index * 12;
      let category = null;
      if (hasCategory || shiftedLayout) {
        const categoryByte = this.reader.readU8(start + 10);
        category = categoryByte < 3 ? ["Physical", "Special", "Status"][categoryByte] : null;
      }
      const powerOffset = shiftedLayout ? 2 : 1;
      const typeOffset = shiftedLayout ? 3 : 2;
      const accuracyOffset = shiftedLayout ? 4 : 3;
      const ppOffset = shiftedLayout ? 5 : 4;
      const priorityOffset = shiftedLayout ? 8 : 7;
      moves.push({
        name: names[index],
        num: index,
        typeId: this.reader.readU8(start + typeOffset),
        power: this.reader.readU8(start + powerOffset),
        accuracy: this.reader.readU8(start + accuracyOffset),
        pp: this.reader.readU8(start + ppOffset),
        priority: this.reader.readS8(start + priorityOffset),
        category,
      });
    }
    this._cache.moveStats = moves;
    return moves;
  }

  usesShiftedMoveLayout(anchor, typeNames, names) {
    if ("moveStatsShiftedLayout" in this._cache) return this._cache.moveStatsShiftedLayout;
    const sampleEnd = Math.min(names.length, 26);
    let standardScore = 0;
    let shiftedScore = 0;
    let shiftedCategoryScore = 0;
    for (let index = 1; index < sampleEnd; index += 1) {
      const start = anchor.address + index * 12;
      const standardType = this.reader.readU8(start + 2);
      const standardAccuracy = this.reader.readU8(start + 3);
      const standardPp = this.reader.readU8(start + 4);
      const shiftedType = this.reader.readU8(start + 3);
      const shiftedAccuracy = this.reader.readU8(start + 4);
      const shiftedPp = this.reader.readU8(start + 5);
      const shiftedCategory = this.reader.readU8(start + 10);

      if (standardType < typeNames.length && (standardAccuracy <= 100 || standardAccuracy === 255) && standardPp <= 64) {
        standardScore += 1;
      }
      if (shiftedType < typeNames.length && (shiftedAccuracy <= 100 || shiftedAccuracy === 255) && shiftedPp <= 64) {
        shiftedScore += 1;
        if (shiftedCategory < 3) shiftedCategoryScore += 1;
      }
    }
    const usesShifted = shiftedScore > standardScore && shiftedCategoryScore >= Math.max(3, Math.floor((sampleEnd - 1) / 2));
    this._cache.moveStatsShiftedLayout = usesShifted;
    return usesShifted;
  }

  speciesStats() {
    if (this._cache.speciesStats) return this._cache.speciesStats;
    const anchor = this.layout.anchor("data.pokemon.stats");
    const names = this.speciesNames();
    const hasHiddenAbility = anchor.format.includes("hiddenAbility.");
    const result = [];
    for (let index = 0; index < names.length; index += 1) {
      const start = anchor.address + index * 28;
      result.push({
        name: names[index],
        num: index,
        bs: {
          hp: this.reader.readU8(start),
          at: this.reader.readU8(start + 1),
          df: this.reader.readU8(start + 2),
          sp: this.reader.readU8(start + 3),
          sa: this.reader.readU8(start + 4),
          sd: this.reader.readU8(start + 5),
        },
        typeIds: [this.reader.readU8(start + 6), this.reader.readU8(start + 7)],
        itemIds: [this.reader.readU16(start + 12), this.reader.readU16(start + 14)],
        abilityIds: [
          this.reader.readU8(start + 22),
          this.reader.readU8(start + 23),
          hasHiddenAbility ? this.reader.readU8(start + 26) : 0,
        ],
      });
    }
    this._cache.speciesStats = result;
    return result;
  }

  evolutions() {
    if (this._cache.evolutions) return this._cache.evolutions;
    const anchor = this.layout.anchor("data.pokemon.evolutions");
    const speciesCount = this.resolveCount("data.pokemon.names");
    const slotCount = (anchor.format.match(/\bmethod[0-9A-Fa-f]*:/g) || []).length;
    const result = [];
    for (let speciesIndex = 0; speciesIndex < speciesCount; speciesIndex += 1) {
      const start = anchor.address + speciesIndex * slotCount * 8;
      const entries = [];
      for (let slot = 0; slot < slotCount; slot += 1) {
        const offset = start + slot * 8;
        const method = this.reader.readU16(offset);
        const arg = this.reader.readU16(offset + 2);
        const target = this.reader.readU16(offset + 4);
        const extra = this.reader.readU16(offset + 6);
        if (!method || !target) continue;
        entries.push({ method, arg, target, extra });
      }
      result.push(entries);
    }
    this._cache.evolutions = result;
    return result;
  }

  levelUpMoves() {
    if (this._cache.levelUpMoves) return this._cache.levelUpMoves;
    const anchor = this.layout.anchor("data.pokemon.moves.levelup");
    const speciesCount = this.resolveCount("data.pokemon.names");
    const moveCount = this.resolveCount("data.pokemon.moves.names");
    let layoutKind = "packed";
    if (anchor.format.includes("!0000FF")) layoutKind = "jambo";
    else layoutKind = this.detectLevelUpLayout(anchor, speciesCount, moveCount);
    const result = [];
    for (let speciesIndex = 0; speciesIndex < speciesCount; speciesIndex += 1) {
      const pointer = this.reader.readPointer(anchor.address + speciesIndex * 4);
      let entries = [];
      if (pointer) {
        if (layoutKind === "jambo") entries = parseLevelUpJambo(this.reader.rom, pointer);
        else if (layoutKind === "wide") entries = parseLevelUpWide(this.reader.rom, pointer);
        else entries = parseLevelUpPacked(this.reader.rom, pointer);
      }
      result.push(entries);
    }
    this._cache.levelUpMoves = result;
    return result;
  }

  detectLevelUpLayout(anchor, speciesCount, moveCount) {
    if (this._cache.levelUpLayoutKind) return this._cache.levelUpLayoutKind;
    const sampleSpecies = Math.min(speciesCount, 12);
    let packedScore = 0;
    let wideScore = 0;
    for (let speciesIndex = 1; speciesIndex < sampleSpecies; speciesIndex += 1) {
      const pointer = this.reader.readPointer(anchor.address + speciesIndex * 4);
      if (!pointer) continue;
      packedScore += scoreLevelUpEntries(parseLevelUpPacked(this.reader.rom, pointer), moveCount);
      wideScore += scoreLevelUpEntries(parseLevelUpWide(this.reader.rom, pointer), moveCount);
    }
    this._cache.levelUpLayoutKind = wideScore > packedScore ? "wide" : "packed";
    return this._cache.levelUpLayoutKind;
  }

  moveList(anchorName) {
    const cacheKey = `moveList:${anchorName}`;
    if (cacheKey in this._cache) return this._cache[cacheKey];
    const anchor = this.layout.anchor(anchorName);
    const count = this.resolveCount(anchorName);
    const values = [];
    for (let index = 0; index < count; index += 1) values.push(this.reader.readU16(anchor.address + index * 2));
    this._cache[cacheKey] = values;
    return values;
  }

  compatibilityTable(anchorName, moveCount) {
    const cacheKey = `compat:${anchorName}:${moveCount}`;
    if (cacheKey in this._cache) return this._cache[cacheKey];
    const anchor = this.layout.anchor(anchorName);
    const speciesCount = this.resolveCount("data.pokemon.names");
    const bytesPerEntry = Math.floor((moveCount + 7) / 8);
    const rows = [];
    for (let speciesIndex = 0; speciesIndex < speciesCount; speciesIndex += 1) {
      const start = anchor.address + speciesIndex * bytesPerEntry;
      const row = [];
      for (let moveIndex = 0; moveIndex < moveCount; moveIndex += 1) {
        const byte = this.reader.readU8(start + Math.floor(moveIndex / 8));
        if (byte & (1 << (moveIndex % 8))) row.push(moveIndex);
      }
      rows.push(row);
    }
    this._cache[cacheKey] = rows;
    return rows;
  }

  trainerRecords() {
    if (this._cache.trainers) return this._cache.trainers;
    const anchor = this.layout.anchor("data.trainers.stats");
    const count = this.resolveCount("data.trainers.stats");
    const trainers = [];
    for (let trainerId = 0; trainerId < count; trainerId += 1) {
      const start = anchor.address + trainerId * 40;
      trainers.push({
        trainerId,
        structType: this.reader.readU8(start),
        classId: this.reader.readU8(start + 1),
        name: normalizeDisplayText(this.reader.decodeFixedString(start + 4, 12)),
        introGender: this.reader.readU8(start + 2),
        itemIds: [0, 1, 2, 3].map((slot) => this.reader.readU16(start + 16 + slot * 2)),
        isDouble: this.reader.readU32(start + 24) !== 0,
        ai: this.reader.readU32(start + 28),
        partyCount: this.reader.readU32(start + 32),
        partyPointer: this.reader.readPointer(start + 36),
      });
    }
    this._cache.trainers = trainers;
    return trainers;
  }

  trainerParty(trainer) {
    const includeMoves = Boolean(trainer.structType & 1);
    const includeItem = Boolean(trainer.structType & 2);
    const length = includeMoves ? 16 : 8;
    const party = [];
    for (let index = 0; index < trainer.partyCount; index += 1) {
      const start = trainer.partyPointer + index * length;
      const itemId = includeItem ? this.reader.readU16(start + 6) : 0;
      const moveIds = [];
      if (includeMoves) {
        const moveOffset = includeItem ? 8 : 6;
        for (let slot = 0; slot < 4; slot += 1) moveIds.push(this.reader.readU16(start + moveOffset + slot * 2));
      }
      party.push({
        ivSpread: this.reader.readU16(start),
        level: this.reader.readU16(start + 2),
        speciesId: this.reader.readU16(start + 4),
        itemId,
        moveIds,
      });
    }
    return party;
  }

  trainerEvs() {
    const anchor = this.layout.anchorOptional("data.trainers.evs");
    if (!anchor) return null;
    if (this._cache.trainerEvs) return this._cache.trainerEvs;
    const count = parseCountExpr(lastBracketSuffix(anchor.format), (token) => this.resolveCount(token));
    const natures = this.natureNames();
    const trainerAbilities = this.layout.lists.trainerabilities || ["Hidden", "Ability1", "Ability2", "RandomNormal", "RandomAny"];
    const rows = [];
    for (let index = 0; index < count; index += 1) {
      const start = anchor.address + index * 10;
      const abilityIndex = this.reader.readU8(start + 9);
      rows.push({
        nature: natures[this.reader.readU8(start)] || "",
        ivs: this.reader.readU8(start + 1),
        evs: {
          hp: this.reader.readU8(start + 2),
          at: this.reader.readU8(start + 3),
          df: this.reader.readU8(start + 4),
          sp: this.reader.readU8(start + 5),
          sa: this.reader.readU8(start + 6),
          sd: this.reader.readU8(start + 7),
        },
        ball: this.reader.readU8(start + 8),
        abilityMode: trainerAbilities[abilityIndex] || "",
      });
    }
    this._cache.trainerEvs = rows;
    return rows;
  }

  mapSectionNames() {
    const anchor = this.layout.anchor("data.maps.names");
    if (anchor.format.startsWith("[name<\"\">]")) {
      return this.pointerStringTable("data.maps.names").map((value) => prettifyLocationName(value));
    }
    const count = this.resolveCount("data.maps.names");
    const names = [];
    for (let index = 0; index < count; index += 1) {
      const pointer = this.reader.readPointer(anchor.address + index * 8 + 4);
      names.push(prettifyLocationName(this.reader.decodePointerString(pointer)));
    }
    return names;
  }

  bankMapNameLookup() {
    if (this._cache.bankMapLookup) return this._cache.bankMapLookup;
    const names = this.mapSectionNames();
    const mapAnchor = this.layout.anchor("data.maps.banks");
    const bankCount = parseCountExpr(lastBracketSuffix(mapAnchor.format), (token) => this.resolveCount(token));
    const match = mapAnchor.format.match(/regionSectionID\.data\.maps\.names(?:\+(\d+))?/);
    const sectionOffset = match ? Number.parseInt(match[1] || "0", 10) : 0;
    const lookup = {};
    for (let bank = 0; bank < bankCount; bank += 1) {
      const bankPointer = this.reader.readPointer(mapAnchor.address + bank * 4);
      if (!bankPointer) continue;
      for (let mapIndex = 0; mapIndex < 512; mapIndex += 1) {
        const headerPointer = this.reader.readPointer(bankPointer + mapIndex * 4);
        if (!headerPointer) {
          if (mapIndex > 0) break;
          continue;
        }
        const sectionId = this.reader.readU8(headerPointer + 20);
        const nameIndex = sectionId - sectionOffset;
        if (nameIndex >= 0 && nameIndex < names.length) lookup[`${bank}:${mapIndex}`] = names[nameIndex];
      }
    }
    this._cache.bankMapLookup = lookup;
    return lookup;
  }

  vsSeekerRows() {
    const anchor = this.layout.anchorOptional("data.trainers.vsseeker");
    if (!anchor) return [];
    if (this._cache.vsSeekerRows) return this._cache.vsSeekerRows;
    const count = parseCountExpr(lastBracketSuffix(anchor.format), (token) => this.resolveCount(token));
    const rows = [];
    for (let index = 0; index < count; index += 1) {
      const start = anchor.address + (index * VS_SEEKER_ENTRY_SIZE);
      rows.push({
        matches: Array.from({ length: VS_SEEKER_MATCH_COUNT }, (_value, matchIndex) => this.reader.readU16(start + (matchIndex * 2))),
        bank: this.reader.readU8(start + 12),
        map: this.reader.readU8(start + 13),
      });
    }
    this._cache.vsSeekerRows = rows;
    return rows;
  }

  trainerLocationLookup() {
    if (this._cache.trainerLocationLookup) return this._cache.trainerLocationLookup;
    const bankMapLookup = this.bankMapNameLookup();
    const trainerLocations = {};

    for (const row of this.vsSeekerRows()) {
      const locationName = bankMapLookup[`${row.bank}:${row.map}`];
      if (!locationName) continue;
      for (const trainerId of row.matches) addTrainerLocation(trainerLocations, trainerId, locationName);
    }

    const mapAnchor = this.layout.anchor("data.maps.banks");
    const bankCount = parseCountExpr(lastBracketSuffix(mapAnchor.format), (token) => this.resolveCount(token));
    for (let bank = 0; bank < bankCount; bank += 1) {
      const bankPointer = this.reader.readPointer(mapAnchor.address + (bank * 4));
      if (!bankPointer) continue;
      for (let mapIndex = 0; mapIndex < 512; mapIndex += 1) {
        const headerPointer = this.reader.readPointer(bankPointer + (mapIndex * 4));
        if (!headerPointer) {
          if (mapIndex > 0) break;
          continue;
        }
        const locationName = bankMapLookup[`${bank}:${mapIndex}`];
        if (!locationName) continue;
        const eventsPointer = this.reader.readPointer(headerPointer + MAP_HEADER_EVENTS_POINTER_OFFSET);
        if (!eventsPointer) continue;
        const objectCount = this.reader.readU8(eventsPointer + MAP_EVENTS_OBJECT_COUNT_OFFSET);
        const objectsPointer = this.reader.readPointer(eventsPointer + MAP_EVENTS_OBJECTS_POINTER_OFFSET);
        if (!objectCount || !objectsPointer) continue;
        for (let objectIndex = 0; objectIndex < objectCount; objectIndex += 1) {
          const objectStart = objectsPointer + (objectIndex * MAP_OBJECT_ENTRY_SIZE);
          const scriptPointer = this.reader.readPointer(objectStart + MAP_OBJECT_SCRIPT_POINTER_OFFSET);
          if (!scriptPointer) continue;
          const trainerId = scanTrainerBattleId(this.reader.rom, scriptPointer);
          if (trainerId !== null) addTrainerLocation(trainerLocations, trainerId, locationName);
        }
      }
    }

    const finalized = {};
    for (const [trainerId, locations] of Object.entries(trainerLocations)) {
      if (locations.length) finalized[trainerId] = locations.join(" / ");
    }
    this._cache.trainerLocationLookup = finalized;
    return finalized;
  }

  wildEncounters() {
    if (this._cache.wildEncounters) return this._cache.wildEncounters;
    const anchor = this.layout.anchor("data.pokemon.wild");
    const entries = [];
    for (let offset = anchor.address; offset + 28 <= this.reader.length; offset += 20) {
      const bank = this.reader.readU8(offset);
      const map = this.reader.readU8(offset + 1);
      const grassPtr = this.reader.readPointer(offset + 4);
      const surfPtr = this.reader.readPointer(offset + 8);
      const treePtr = this.reader.readPointer(offset + 12);
      const fishPtr = this.reader.readPointer(offset + 16);
      if (bank === 0xFF && map === 0xFF && !grassPtr && !surfPtr && !treePtr && !fishPtr) break;
      const entry = {
        bank,
        map,
        grass: parseWildBlock(this.reader, grassPtr, 12),
        surf: parseWildBlock(this.reader, surfPtr, 5),
        tree: parseWildBlock(this.reader, treePtr, 5),
        fish: parseWildFishBlock(this.reader, fishPtr),
      };
      if (!entry.grass && !entry.surf && !entry.tree && !entry.fish && bank === 0 && map === 0) break;
      entries.push(entry);
    }
    this._cache.wildEncounters = entries;
    return entries;
  }
}

function buildCalcOutput(ctx, title) {
  const rawMoveNames = ctx.fixedStringTable("data.pokemon.moves.names");
  const speciesNames = ctx.speciesNames();
  const moveNames = ctx.moveNames();
  const typeNames = ctx.typeNames();
  const abilityNames = ctx.abilityNames();
  const itemNames = ctx.itemStats().map((item) => item.name);
  const speciesStats = ctx.speciesStats();
  const moveStats = ctx.moveStats();
  const levelUp = ctx.levelUpMoves();
  const trainers = ctx.trainerRecords();
  const trainerClassNames = ctx.trainerClassNames();
  const trainerEvs = ctx.trainerEvs();
  const trainerLocationLookup = ctx.trainerLocationLookup();
  const poksReplacements = {};
  const pokReplacements = {};
  const [moveReplacementsDisplay, moveReplacementsIds] = buildReplacementMaps(
    savMoveNames,
    rawMoveNames,
    moveNames,
    (name) => normalizeCalcMoveComparisonName(name),
    (name) => normalizeCalcMoveComparisonName(name)
  );
  const moveReplacements = { ...moveReplacementsDisplay, ...moveReplacementsIds };

  const poks = {};
  const speciesSlotMap = {};
  for (const species of speciesStats.slice(1)) {
    const [slots] = buildSpeciesAbilitySlots(species, abilityNames);
    speciesSlotMap[species.num] = slots;
    poks[species.name] = {
      bs: species.bs,
      types: dedupePreserveOrder(
        species.typeIds.filter((typeId) => typeId >= 0 && typeId < typeNames.length).map((typeId) => typeNames[typeId])
      ).slice(0, 2),
      abilities: slots,
    };
  }

  const moves = {};
  for (const move of moveStats.slice(1)) {
    const moveType = typeNames[move.typeId] || "Normal";
    let category = move.category;
    if (!category) category = move.power === 0 ? "Status" : (PHYSICAL_TYPES_GEN3.has(moveType) ? "Physical" : "Special");
    moves[move.name] = {
      basePower: move.power,
      type: moveType,
      category,
      pp: move.pp,
      accuracy: move.accuracy,
      priority: move.priority,
      e_id: move.num,
    };
  }

  const formattedSets = {};
  const visibleCounts = {};
  for (const trainer of trainers) {
    let className = trainerClassNames[trainer.classId] || `Class ${trainer.classId}`;
    className = normalizeTrainerDisplayName(className);
    const trainerName = normalizeTrainerDisplayName(trainer.name);
    let visibleName = className && trainerName ? `${className} ${trainerName}` : (className || trainerName);
    visibleCounts[visibleName] = (visibleCounts[visibleName] || 0) + 1;
    if (visibleCounts[visibleName] > 1) {
      visibleName = ensureNumberedTrainerSuffixSpacing(`${visibleName} ${visibleCounts[visibleName]}`);
    }
    const typeValue = trainer.isDouble ? 0x80 : ((trainer.introGender & 1) ? 0x78 : 0x88);
    const party = ctx.trainerParty(trainer);
    const trainerResults = computeTrainerNatures(
      trainer.name,
      party.filter((member) => member.speciesId < speciesNames.length).map((member) => speciesNames[member.speciesId]),
      typeValue
    );
    let extraRow = null;
    if (trainerEvs) {
      if (trainer.trainerId < trainerEvs.length) extraRow = trainerEvs[trainer.trainerId];
      else if (trainer.classId < trainerEvs.length) extraRow = trainerEvs[trainer.classId];
    }
    const duplicateLevelSpeciesCounts = {};
    for (let index = 0; index < party.length; index += 1) {
      const member = party[index];
      if (member.speciesId <= 0 || member.speciesId >= speciesNames.length) continue;
      const speciesName = speciesNames[member.speciesId];
      const duplicateKey = `${member.level}:${speciesName}`;
      duplicateLevelSpeciesCounts[duplicateKey] = (duplicateLevelSpeciesCounts[duplicateKey] || 0) + 1;
      const explicitMoves = member.moveIds.filter((moveId) => moveId > 0 && moveId < moveNames.length).map((moveId) => moveNames[moveId]);
      const finalMoves = explicitMoves.length ? explicitMoves : defaultMoveNames(levelUp[member.speciesId], moveNames, member.level);
      const natureData = trainerResults[index] || { nature: "Hardy", pid: 0 };
      const slots = speciesSlotMap[member.speciesId] || {};
      const itemName = member.itemId > 0 && member.itemId < itemNames.length ? itemNames[member.itemId] : "-";
      const evs = extraRow ? extraRow.evs : { hp: 0, at: 0, df: 0, sa: 0, sd: 0, sp: 0 };
      const label = buildTrainerSetLabelWithLocation(
        member.level,
        visibleName,
        duplicateLevelSpeciesCounts[duplicateKey],
        trainerLocationLookup[trainer.trainerId] || ""
      );
      formattedSets[speciesName] ||= {};
      formattedSets[speciesName][label] = {
        level: member.level,
        tr_id: trainer.trainerId,
        ai: trainer.ai,
        battle_type: trainer.isDouble ? "Doubles" : "Singles",
        reward_item: "",
        form: "",
        item: itemName,
        ivs: {
          hp: ivByteToStatIv(member.ivSpread),
          at: ivByteToStatIv(member.ivSpread),
          df: ivByteToStatIv(member.ivSpread),
          sa: ivByteToStatIv(member.ivSpread),
          sd: ivByteToStatIv(member.ivSpread),
          sp: ivByteToStatIv(member.ivSpread),
        },
        nature: extraRow?.nature || natureData.nature,
        moves: finalMoves,
        sub_index: index,
        ability: chooseAbilityFromPid(slots, natureData.pid, extraRow?.abilityMode || null),
        evs,
      };
    }
  }

  return {
    title,
    poks_replacements: poksReplacements,
    pok_replacements: pokReplacements,
    move_replacements: moveReplacements,
    formatted_sets: formattedSets,
    poks,
    moves,
  };
}

function buildDexOutput(ctx) {
  const speciesNames = ctx.speciesNames();
  const moveNames = ctx.moveNames();
  const abilityNames = ctx.abilityNames();
  const typeNames = ctx.typeNames();
  const itemStats = ctx.itemStats();
  const itemNames = itemStats.map((item) => item.name);
  const moveDescriptions = ctx.moveDescriptions();
  const abilityDescriptions = ctx.abilityDescriptions();
  const speciesStats = ctx.speciesStats();
  const moveStats = ctx.moveStats();
  const evolutions = ctx.evolutions();
  const levelUp = ctx.levelUpMoves();
  const tmIds = ctx.layout.anchorOptional("data.pokemon.moves.tms") ? ctx.moveList("data.pokemon.moves.tms") : [];
  const hmIds = ctx.layout.anchorOptional("data.pokemon.moves.hms") ? ctx.moveList("data.pokemon.moves.hms") : [];
  const tutorIds = ctx.layout.anchorOptional("data.pokemon.moves.tutors") ? ctx.moveList("data.pokemon.moves.tutors") : [];
  const tmCompat = tmIds.length ? ctx.compatibilityTable("data.pokemon.moves.tmcompatibility", tmIds.length) : speciesNames.map(() => []);
  const tutorCompat = tutorIds.length && ctx.layout.anchorOptional("data.pokemon.moves.tutorcompatibility")
    ? ctx.compatibilityTable("data.pokemon.moves.tutorcompatibility", tutorIds.length)
    : speciesNames.map(() => []);
  const evolutionNames = ctx.layout.lists.evolutionmethods || [];

  const poks = {};
  for (const species of speciesStats.slice(1)) {
    const [, orderedAbilities] = buildSpeciesAbilitySlots(species, abilityNames);
    const learnset = levelUp[species.num]
      .filter(([, moveId]) => moveId > 0 && moveId < moveNames.length)
      .map(([level, moveId]) => [level, moveNames[moveId]]);
    const tms = [];
    if (species.num < tmCompat.length) {
      for (const moveIndex of tmCompat[species.num]) {
        const moveId = tmIds[moveIndex];
        if (moveId > 0 && moveId < moveNames.length) tms.push(moveNames[moveId]);
      }
    }
    const tutors = [];
    if (species.num < tutorCompat.length) {
      for (const moveIndex of tutorCompat[species.num]) {
        const moveId = tutorIds[moveIndex];
        if (moveId > 0 && moveId < moveNames.length) tutors.push(moveNames[moveId]);
      }
    }
    const entry = {
      name: species.name,
      num: species.num,
      types: dedupePreserveOrder(
        species.typeIds.filter((typeId) => typeId >= 0 && typeId < typeNames.length).map((typeId) => typeNames[typeId])
      ).slice(0, 2),
      bs: species.bs,
      abs: orderedAbilities,
      items: [
        species.itemIds[0] > 0 && species.itemIds[0] < itemNames.length ? itemNames[species.itemIds[0]] : null,
        species.itemIds[1] > 0 && species.itemIds[1] < itemNames.length ? itemNames[species.itemIds[1]] : null,
        null,
      ],
      learnset_info: { learnset, tms, tutors },
    };
    const evoTargets = [];
    const evoMethods = [];
    const evoParams = [];
    for (const evo of evolutions[species.num]) {
      const methodName = evolutionNames[evo.method] || `Method ${evo.method}`;
      const [method, param] = evoToDdex(methodName, evo.arg, evo.extra, itemNames, moveNames, typeNames);
      evoTargets.push(speciesNames[evo.target] || String(evo.target));
      evoMethods.push(method);
      evoParams.push(param);
    }
    if (evoTargets.length) {
      entry.evos = evoTargets;
      entry.evoMethods = evoMethods;
      entry.evoParams = evoParams;
    }
    poks[species.name] = entry;
  }

  const moves = {};
  for (const move of moveStats.slice(1)) {
    const moveType = typeNames[move.typeId] || "Normal";
    let category = move.category;
    if (!category) category = move.power === 0 ? "Status" : (PHYSICAL_TYPES_GEN3.has(moveType) ? "Physical" : "Special");
    moves[move.name] = {
      name: move.name,
      t: moveType,
      bp: move.power,
      cat: category,
      pp: move.pp,
      acc: move.accuracy,
      prio: move.priority,
      desc: move.num > 0 && move.num - 1 < moveDescriptions.length ? moveDescriptions[move.num - 1] : "",
      e_id: move.num,
    };
  }

  const abilities = {};
  for (let abilityId = 1; abilityId < abilityNames.length; abilityId += 1) {
    const name = abilityNames[abilityId];
    abilities[toId(name)] = { name, desc: abilityDescriptions[abilityId] || "" };
  }

  const items = {};
  for (const item of itemStats.slice(1)) items[toId(item.name)] = { name: item.name, desc: item.desc };

  const bankMapLookup = ctx.bankMapNameLookup();
  const wildEntries = ctx.wildEncounters();
  const names = wildEntries.map((entry) => bankMapLookup[`${entry.bank}:${entry.map}`] || `Bank ${entry.bank} Map ${entry.map}`);
  const locationIds = duplicateLocationIds(names);
  const encs = { rates: globalGen3Rates() };
  for (let index = 0; index < wildEntries.length; index += 1) {
    const [locationId, locationName] = locationIds[index];
    const entry = wildEntries[index];
    const locationRecord = { name: locationName };
    if (entry.grass) {
      locationRecord.grass = {
        encs: entry.grass.encs.filter((slot) => slot.species > 0 && slot.species < speciesNames.length).map((slot) => ({
          s: speciesNames[slot.species],
          mn: slot.mn,
          mx: slot.mx,
        })),
      };
    }
    if (entry.surf) {
      locationRecord.surf = {
        encs: entry.surf.encs.filter((slot) => slot.species > 0 && slot.species < speciesNames.length).map((slot) => ({
          s: speciesNames[slot.species],
          mn: slot.mn,
          mx: slot.mx,
        })),
      };
    }
    if (entry.tree) {
      locationRecord.rock_smash = {
        encs: entry.tree.encs.filter((slot) => slot.species > 0 && slot.species < speciesNames.length).map((slot) => ({
          s: speciesNames[slot.species],
          mn: slot.mn,
          mx: slot.mx,
        })),
      };
    }
    if (entry.fish) {
      const split = splitFishingEncounters(entry.fish.encs);
      for (const [bucket, encounters] of Object.entries(split)) {
        locationRecord[bucket] = {
          encs: encounters.filter((slot) => slot.species > 0 && slot.species < speciesNames.length).map((slot) => ({
            s: speciesNames[slot.species],
            mn: slot.mn,
            mx: slot.mx,
          })),
        };
      }
    }
    encs[locationId] = locationRecord;
  }

  void hmIds;
  return { poks, moves, abilities, items, encs };
}

function buildSummary(ctx, calcOutput, dexOutput) {
  const summary = {
    species: ctx.speciesNames().length - 1,
    moves: ctx.moveNames().length - 1,
    abilities: ctx.abilityNames().length - 1,
    items: ctx.itemStats().length - 1,
    trainers: ctx.trainerRecords().length,
  };
  if (calcOutput) {
    summary.calc_species = Object.keys(calcOutput.poks).length;
    summary.calc_moves = Object.keys(calcOutput.moves).length;
    summary.calc_formatted_set_species = Object.keys(calcOutput.formatted_sets).length;
  }
  if (dexOutput) {
    summary.dex_species = Object.keys(dexOutput.poks).length;
    summary.dex_moves = Object.keys(dexOutput.moves).length;
    summary.dex_locations = Object.keys(dexOutput.encs).length - 1;
  }
  return summary;
}

export function normalizeSlug(name) {
  const base = String(name || "").replace(/\.[^.]+$/, "");
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return slug || "rom";
}

export function titleFromName(name) {
  const base = String(name || "").replace(/\.[^.]+$/, "");
  return base
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ") || "ROM";
}

export function buildGen3ExportArtifacts({ romBytes, tomlText, slug, title }) {
  const ctx = new ExportContext(romBytes, tomlText);
  const normalizedSlug = normalizeSlug(slug || title);
  const normalizedTitle = title || titleFromName(slug);
  const calcOutput = buildCalcOutput(ctx, normalizedTitle);
  const dexOutput = buildDexOutput(ctx);
  const searchIndex = buildDdexSearchIndex(dexOutput);
  const summary = buildSummary(ctx, calcOutput, dexOutput);
  return {
    slug: normalizedSlug,
    title: normalizedTitle,
    calcOutput,
    dexOutput,
    searchIndex,
    summary,
    files: {
      calc: {
        filename: `${normalizedSlug}.js`,
        text: formatAssignedJs("backup_data", calcOutput),
      },
      dex: {
        filename: `${normalizedSlug}.js`,
        text: formatAssignedJs("overrides", dexOutput),
      },
      searchIndex: {
        filename: `${normalizedSlug}_searchindex.js`,
        text: formatSearchIndexJs(searchIndex),
      },
    },
  };
}
