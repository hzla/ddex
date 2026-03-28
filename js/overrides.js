const ROM_CACHE_FLAG = "romOverrides";
const ROM_KEYS = {
  overrides: "overrides",
  searchIndex: "searchindex",
  searchIndexOffset: "searchindex_offset",
  searchIndexCount: "searchindex_count",
  title: "gameTitle",
  expanded: "romExpanded",
};

var params = new URLSearchParams(window.location.search);
var gameParam = params.get("game");
var game = gameParam || (isRomOverrideActive() ? null : localStorage.game);
var gameTitles = {
	"vintagewhiteplus": "Vintage White+",
	"blazeblack2redux": "Blaze Black/Volt White 2 Redux",
	"blindingwhite2": "Blinding White 2",
	"cascadewhite": "Cascade White",
	"cascadewhite2": "Cascade White",
	"renegadeplatinum": "Renegade Platinum",
  "sterlingsilver": "Sterling Silver",
  "pokemonnull": "Pokemon Null",
  "reignitedruby": "Reignited Ruby",
  "platinumkaizo": "Platinum Kaizo"
}

if (game && gameTitles[game]) {
  maybeApplyRomFamilyFromTitle(gameTitles[game]);
}

var unrecognizedPoks = {}

var truncatedSpeciesNames = {
	"fletcinder": "fletchinder"
}

if (!window.DDEX_BASE_POKEDEX_KEYS && window.BattlePokedex) {
	window.DDEX_BASE_POKEDEX_KEYS = Object.keys(window.BattlePokedex).sort();
	window.DDEX_BASE_POKEDEX_SET = {};
	for (const key of window.DDEX_BASE_POKEDEX_KEYS) {
		window.DDEX_BASE_POKEDEX_SET[key] = 1;
	}
}

function isRomOverrideActive() {
  return localStorage[ROM_CACHE_FLAG] === "1";
}

function setDexTitle(title) {
  const fullTitle = title ? `${title} Dex` : "Dynamic Dex";
  document.title = fullTitle;
  if (!title) return;
  const el = document.getElementById("dex-title");
  if (el) {
    el.textContent = fullTitle;
  }
}

function setDexTitleFromStorage() {
  const gameKey = localStorage.game;
  if (gameKey && gameTitles[gameKey]) {
    setDexTitle(gameTitles[gameKey]);
    return true;
  }
  const romTitle = localStorage.romTitle;
  if (romTitle) {
    const displayTitle = toTitleCaseWords(romTitle);
    setDexTitle(displayTitle || romTitle);
    return true;
  }
  
  return false;
}

function maybeApplyRomFamilyFromTitle(title) {
  if (!title) return;
  const normalized = String(title).trim().toLowerCase();
  if (normalized === "renegade platinum") {
    localStorage.romFamily = "Plat";
  } else if (normalized === "sterling silver") {
    localStorage.romFamily = "HGSS";
  }
}

function applySearchIndex(searchIndex, offsets, counts) {
  if (Array.isArray(searchIndex)) window.BattleSearchIndex = searchIndex;
  if (Array.isArray(offsets)) window.BattleSearchIndexOffset = offsets;
  if (counts && typeof counts === "object") window.BattleSearchCountIndex = counts;
}

function applyRomOverridesFromCache() {
  if (!isRomOverrideActive()) return false;
  try {
    const overrides = normalizeOverrideSpeciesPayload(JSON.parse(localStorage[ROM_KEYS.overrides] || "null"));
    window.overrides = overrides
    const searchIndex = JSON.parse(localStorage[ROM_KEYS.searchIndex] || "null");
    const searchIndexOffset = JSON.parse(localStorage[ROM_KEYS.searchIndexOffset] || "null");
    const searchIndexCount = JSON.parse(localStorage[ROM_KEYS.searchIndexCount] || "null");
    const title = localStorage[ROM_KEYS.title];
    if (!overrides || !searchIndex || !searchIndexOffset || !searchIndexCount) return false;
    overrideDexData(overrides);
    applySearchIndex(searchIndex, searchIndexOffset, searchIndexCount);
    const displayTitle = toTitleCaseWords(title);
    setDexTitle(displayTitle || title);
    maybeApplyRomFamilyFromTitle(title);
    window.DDEX_ROM_OVERRIDES = { overrides, searchIndex, searchIndexOffset, searchIndexCount, title };
    console.log("Loaded ROM overrides from cache");
    return true;
  } catch (e) {
    console.warn("Failed to load ROM overrides from cache", e);
    return false;
  }
}

function setGameDexTitle(gameKey) {
  const title = gameTitles[gameKey];
  if (!title) return;
  setDexTitle(title);
  maybeApplyRomFamilyFromTitle(title);
}

async function applyGameOverridesFromCache() {
  if (isRomOverrideActive()) return false;
  if (!localStorage.overrides) return false;
  const gameKey = localStorage.game;
  if (!gameKey || !gameTitles[gameKey]) return false;
  try {
    let parsedOverrides = JSON.parse(localStorage.overrides || "null");
    if (!parsedOverrides) return false;
    parsedOverrides = normalizeOverrideSpeciesPayload(parsedOverrides);
    parsedOverrides = await loadOptionalCustomDescriptionOverrides(gameKey, parsedOverrides);
    window.overrides = parsedOverrides;
    overrides = parsedOverrides;
    localStorage.overrides = JSON.stringify(parsedOverrides);
    overrideDexData(parsedOverrides);
    setGameDexTitle(gameKey);
    console.log("Loaded game overrides from cache");
    return true;
  } catch (e) {
    console.warn("Failed to load game overrides from cache", e);
    return false;
  }
}

function clearRomCache() {
  localStorage.removeItem(ROM_CACHE_FLAG);
  localStorage.removeItem(ROM_KEYS.overrides);
  localStorage.removeItem(ROM_KEYS.searchIndex);
  localStorage.removeItem(ROM_KEYS.searchIndexOffset);
  localStorage.removeItem(ROM_KEYS.searchIndexCount);
  localStorage.removeItem(ROM_KEYS.title);
  localStorage.removeItem(ROM_KEYS.expanded);
  localStorage.removeItem("romTitle");
  localStorage.removeItem("romFamily");
  localStorage.removeItem("romVersion");
  localStorage.removeItem("gameTitle");
  window.DDEX_ROM_BACKUP_DATA = null;
  window.DDEX_ROM_DEBUG = null;
}

$(document).on('click', '#reset-cache', function() {
  delete localStorage.overrides
  clearRomCache();
  localStorage.removeItem("game");
  location.reload()
})

function setRomStatus(msg, isErr) {
  const prefix = isErr ? "[error] " : "";
  if (isErr) {
    console.error(`${prefix}${msg}`);
    return;
  }
  if (/\.\.\.\s*$/.test(String(msg || ""))) {
    console.log(msg);
  }
}

function getRomOverridePayload() {
  if (window.DDEX_ROM_OVERRIDES) return window.DDEX_ROM_OVERRIDES;
  if (localStorage[ROM_CACHE_FLAG] !== "1") return null;
  try {
    const overrides = normalizeOverrideSpeciesPayload(JSON.parse(localStorage[ROM_KEYS.overrides] || "null"));
    const searchIndex = JSON.parse(localStorage[ROM_KEYS.searchIndex] || "null");
    const searchIndexOffset = JSON.parse(localStorage[ROM_KEYS.searchIndexOffset] || "null");
    const searchIndexCount = JSON.parse(localStorage[ROM_KEYS.searchIndexCount] || "null");
    const title = localStorage[ROM_KEYS.title] || "rom";
    if (!overrides || !searchIndex || !searchIndexOffset || !searchIndexCount) return null;
    return { overrides, searchIndex, searchIndexOffset, searchIndexCount, title };
  } catch (e) {
    console.warn("Failed to read ROM overrides from cache", e);
    return null;
  }
}

function formatOverridesFile(overridesData) {
  const serialized = JSON.stringify(overridesData)
    .replace(/♀/g, "-F")
    .replace(/♂/g, "-M");
  return `var overrides = ${serialized};`;
}

function formatSearchIndexFile(payload) {
  return [
    "// DO NOT EDIT - automatically built with build-tools/build-indexes",
    "",
    `exports.BattleSearchIndex = ${JSON.stringify(payload.searchIndex)};`,
    "",
    `exports.BattleSearchIndexOffset = ${JSON.stringify(payload.searchIndexOffset)};`,
    "",
    `exports.BattleSearchCountIndex = ${JSON.stringify(payload.searchIndexCount)};`,
    "",
    "exports.BattleArticleTitles = {};",
    "",
  ].join("\n");
}

function formatBackupDataFile(backupData) {
  return JSON.stringify(backupData, (key, value) => (key === "_meta" ? undefined : value));
}

function isAllCapsSpeciesName(name) {
  const text = String(name || "").trim();
  if (!text) return false;
  return /[A-Z]/.test(text) && text === text.toUpperCase();
}

function resolveCanonicalSpeciesName(name) {
  const text = String(name || "").trim();
  if (!text) return "";
  if (/^nidoran(?:-?f|♀)$/i.test(text)) return "Nidoran-F";
  if (/^nidoran(?:-?m|♂)$/i.test(text)) return "Nidoran-M";
  const speciesId = cleanString(text);
  if (!speciesId || !window.BattlePokedex) return "";
  const dexEntry = window.BattlePokedex[speciesId];
  return dexEntry && dexEntry.name ? dexEntry.name : "";
}

function normalizeSpeciesReferenceName(name) {
  const text = String(name || "").trim();
  if (!text) return text;
  return resolveCanonicalSpeciesName(text) || text;
}

function normalizeOverrideSpeciesPayload(overridesData) {
  if (!overridesData || typeof overridesData !== "object") return overridesData;
  const nextOverrides = { ...overridesData };
  const poks = overridesData.poks;
  if (!poks || typeof poks !== "object") return nextOverrides;
  const normalizedPoks = {};
  for (const [speciesName, value] of Object.entries(poks)) {
    const canonicalName = normalizeSpeciesReferenceName(speciesName);
    const nextValue =
      value && typeof value === "object" && !Array.isArray(value)
        ? { ...value }
        : value;
    if (nextValue && typeof nextValue === "object" && !Array.isArray(nextValue)) {
      if (typeof nextValue.name !== "undefined") {
        nextValue.name = normalizeSpeciesReferenceName(nextValue.name);
      }
      if (typeof nextValue.prevo !== "undefined") {
        nextValue.prevo = normalizeSpeciesReferenceName(nextValue.prevo);
      }
      if (Array.isArray(nextValue.evos)) {
        nextValue.evos = nextValue.evos.map((evo) => normalizeSpeciesReferenceName(evo));
      }
      if (typeof nextValue.baseSpecies !== "undefined") {
        nextValue.baseSpecies = normalizeSpeciesReferenceName(nextValue.baseSpecies);
      }
      if (Array.isArray(nextValue.otherFormes)) {
        nextValue.otherFormes = nextValue.otherFormes.map((forme) => normalizeSpeciesReferenceName(forme));
      }
      if (Array.isArray(nextValue.formeOrder)) {
        nextValue.formeOrder = nextValue.formeOrder.map((forme) => normalizeSpeciesReferenceName(forme));
      }
    }
    normalizedPoks[canonicalName] = nextValue;
  }
  nextOverrides.poks = normalizedPoks;
  return nextOverrides;
}

function normalizeBackupFormattedSetSpecies(backupData) {
  if (!backupData || typeof backupData !== "object") return backupData;
  function normalizeSpeciesKeyMap(mapValue) {
    if (!mapValue || typeof mapValue !== "object") return mapValue;
    const normalizedMap = {};
    for (const [speciesName, value] of Object.entries(mapValue)) {
      const canonicalName = isAllCapsSpeciesName(speciesName)
        ? resolveCanonicalSpeciesName(speciesName) || speciesName
        : speciesName;
      const existingValue = normalizedMap[canonicalName];
      if (
        existingValue &&
        typeof existingValue === "object" &&
        !Array.isArray(existingValue) &&
        value &&
        typeof value === "object" &&
        !Array.isArray(value)
      ) {
        Object.assign(existingValue, value);
      } else {
        normalizedMap[canonicalName] = value;
      }
    }
    return normalizedMap;
  }

  return {
    ...backupData,
    formatted_sets: normalizeSpeciesKeyMap(backupData.formatted_sets),
    poks: normalizeSpeciesKeyMap(backupData.poks),
  };
}

function toggleBackupGlitchedSpeciesRedirects(backupData, useGlitchedSpeciesRedirects = true) {
  if (useGlitchedSpeciesRedirects !== false) return backupData;
  if (!backupData || typeof backupData !== "object") return backupData;
  const redirects = backupData._meta && backupData._meta.glitched_species_redirects;
  if (!redirects || typeof redirects !== "object") return backupData;
  const reverseRedirects = {};
  for (const [sourceName, redirectedName] of Object.entries(redirects)) {
    if (!sourceName || !redirectedName || reverseRedirects[redirectedName]) continue;
    reverseRedirects[redirectedName] = sourceName;
  }
  const formattedSets = {};
  for (const [speciesName, setMap] of Object.entries(backupData.formatted_sets || {})) {
    const nextSpeciesName = reverseRedirects[speciesName] || speciesName;
    const existing = formattedSets[nextSpeciesName];
    if (
      existing &&
      typeof existing === "object" &&
      !Array.isArray(existing) &&
      setMap &&
      typeof setMap === "object" &&
      !Array.isArray(setMap)
    ) {
      Object.assign(existing, setMap);
    } else {
      formattedSets[nextSpeciesName] = setMap;
    }
  }
  return {
    ...backupData,
    formatted_sets: formattedSets,
  };
}

function downloadTextFile(filename, contents, mimeType = "text/javascript") {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function formatRomGrowthsAndExpYieldsFile(payload, options = {}) {
  const growthsVarName = options.growthsVarName || "sav_pok_growths";
  const expYieldVarName = options.expYieldVarName || "expYields";
  const growths = Array.isArray(payload && payload.growths) ? payload.growths : [];
  const expYields = payload && payload.expYields && typeof payload.expYields === "object"
    ? payload.expYields
    : {};
  return [
    `${growthsVarName} = ${JSON.stringify(growths)};`,
    "",
    `${expYieldVarName} = ${JSON.stringify(expYields, null, 2)};`,
    "",
  ].join("\n");
}

function readRomGameCode(arrayBuffer) {
  try {
    const u8 = new Uint8Array(arrayBuffer);
    return new TextDecoder("ascii")
      .decode(u8.subarray(0x0c, 0x10))
      .replace(/\0/g, "")
      .trim();
  } catch (e) {
    return "";
  }
}

function safeFileBase(name) {
  if (!name) return "rom";
  if (typeof toID === "function") {
    const id = toID(name);
    return id || "rom";
  }
  const id = String(name).toLowerCase().replace(/[^a-z0-9]+/g, "");
  return id || "rom";
}

function toTitleCaseWords(name) {
  const base = String(name || "").trim();
  if (!base) return "";
  const words = base
    .replace(/\.nds$/i, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/);
  return words
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : ""))
    .join(" ");
}

window.downloadRomOverrideFiles = function (baseName) {
  const payload = getRomOverridePayload();
  if (!payload) {
    console.warn("No ROM overrides found. Load a ROM via file upload first.");
    return false;
  }
  const base = safeFileBase(baseName || payload.title);
  const normalizedPayload =
    payload && typeof payload === "object"
      ? { ...payload, overrides: normalizeOverrideSpeciesPayload(payload.overrides) }
      : payload;
  downloadTextFile(`${base}.js`, formatOverridesFile(normalizedPayload.overrides));
  downloadTextFile(`${base}_searchindex.js`, formatSearchIndexFile(normalizedPayload));
  console.log(`Downloaded overrides for ${payload.title || base} as ${base}.js and ${base}_searchindex.js`);
  return true;
};

window.downloadRomBackupData = function (baseName, options) {
  const payload = window.DDEX_ROM_BACKUP_DATA;
  if (!payload) {
    console.warn("No ROM backup_data found. Load a ROM via file upload first.");
    return false;
  }
  const config =
    baseName && typeof baseName === "object" && !Array.isArray(baseName)
      ? baseName
      : options && typeof options === "object" && !Array.isArray(options)
        ? options
        : typeof options === "boolean"
          ? { useGlitchedSpeciesRedirects: options }
          : {};
  const fallbackTitle = localStorage.romTitle || localStorage[ROM_KEYS.title] || payload.title || "rom";
  const exportTitle =
    typeof baseName === "string" || typeof baseName === "number"
      ? String(baseName)
      : fallbackTitle;
  const base = safeFileBase(exportTitle || fallbackTitle);
  const filename = `${base}_npoint_data.json`;
  const useGlitchedSpeciesRedirects = config.useGlitchedSpeciesRedirects !== false;
  const backupPayload = payload && typeof payload === "object"
    ? normalizeBackupFormattedSetSpecies(
        toggleBackupGlitchedSpeciesRedirects(
          { ...payload, title: exportTitle },
          useGlitchedSpeciesRedirects
        )
      )
    : payload;
  downloadTextFile(filename, formatBackupDataFile(backupPayload), "application/json");
  console.log(
    `Downloaded backup_data as ${filename} (title="${exportTitle}", useGlitchedSpeciesRedirects=${useGlitchedSpeciesRedirects})`
  );
  return true;
};

window.downloadRomGrowthsAndExpYields = function (baseName, options) {
  const payload = window.DDEX_ROM_INCLUDES;
  if (!payload || !Array.isArray(payload.growths) || !payload.expYields) {
    console.warn("No ROM growth/exp-yield data found. Load a Gen 4 ROM via file upload first.");
    return false;
  }
  const config =
    baseName && typeof baseName === "object" && !Array.isArray(baseName)
      ? baseName
      : options && typeof options === "object" && !Array.isArray(options)
        ? options
        : {};
  const fallbackTitle = localStorage.romTitle || localStorage[ROM_KEYS.title] || "rom";
  const exportTitle =
    typeof baseName === "string" || typeof baseName === "number"
      ? String(baseName)
      : fallbackTitle;
  const base = safeFileBase(exportTitle || fallbackTitle);
  const filename = config.filename || `${base}_growths_expyields.js`;
  downloadTextFile(filename, formatRomGrowthsAndExpYieldsFile(payload, config), "text/javascript");
  console.log(
    `Downloaded growths/exp yields as ${filename} (growths=${payload.growths.length}, expYields=${Object.keys(payload.expYields).length})`
  );
  return true;
};

window.downloadRomFileByPath = async function (path, filename) {
  if (!window.__DDEX_LAST_ROM_BUFFER) {
    console.warn("No ROM buffer found. Load a ROM via file upload first.");
    return false;
  }
  try {
    await ensureRomExporterLoaded();
    if (typeof window.readRomFileByPath !== "function") {
      console.warn("ROM reader not available. Ensure /rom/loader.js is loaded.");
      return false;
    }
    const fileBuffer = await window.readRomFileByPath(window.__DDEX_LAST_ROM_BUFFER, path);
    const name = filename || path.replace(/\//g, "_");
    const blob = new Blob([fileBuffer], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    console.log(`Downloaded ${path} as ${name}`);
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
};

window.downloadRomLearnsetNarc = function (filename) {
  return window.downloadRomFileByPath("a/0/3/3", filename || "a_0_3_3.narc");
};

window.listRomTextBanks = function () {
  if (!window.DDEX_ROM_TEXTS) {
    console.warn("No ROM text banks found. Load a ROM via file upload first.");
    return [];
  }
  return Object.keys(window.DDEX_ROM_TEXTS);
};

window.getRomTextBank = function (key) {
  if (!window.DDEX_ROM_TEXTS) {
    console.warn("No ROM text banks found. Load a ROM via file upload first.");
    return null;
  }
  if (!key) return window.DDEX_ROM_TEXTS;
  return window.DDEX_ROM_TEXTS[key];
};

window.listRomTrainersWithNonZeroAbilitySlot = function () {
  const matches = window.DDEX_ROM_DEBUG && window.DDEX_ROM_DEBUG.trainersWithNonZeroAbilitySlot;
  if (!Array.isArray(matches)) {
    console.warn("No trainer ability-slot debug data found. Load a Gen 4 ROM via file upload first.");
    return [];
  }
  const trainerIds = matches.map((entry) => entry.trainerId);
  const rows = matches.flatMap((entry) =>
    (entry.pokemon || []).map((pokemon) => ({
      trainerId: entry.trainerId,
      trainerClass: entry.trainerClass,
      trainerName: entry.trainerName,
      battleType: entry.battleType,
      subIndex: pokemon.subIndex,
      species: pokemon.species,
      level: pokemon.level,
      abilitySlot: pokemon.abilitySlot,
      ability: pokemon.ability,
    }))
  );
  if (rows.length) console.table(rows);
  console.log(`Trainer IDs with non-zero ability slot (${trainerIds.length}):`, trainerIds);
  return trainerIds;
};

window.debugRomTrainerAbilitySlots = window.listRomTrainersWithNonZeroAbilitySlot;

let romModulesLoaded = false;
async function ensureRomModulesLoaded() {
  if (romModulesLoaded) return;
  if (
    window.__DDEX_BOOTSTRAP__ &&
    typeof window.__DDEX_BOOTSTRAP__.ensureRomTools === "function"
  ) {
    await window.__DDEX_BOOTSTRAP__.ensureRomTools();
    romModulesLoaded = true;
    return;
  }
  romModulesLoaded = true;
}

async function ensureRomExporterLoaded() {
  if (typeof window.buildOverridesFromRom === "function") return;
  if (window.__romLoaderReady) return;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("ROM exporter module not loaded. Make sure /rom/loader.js is reachable."));
    }, 3000);
    window.addEventListener(
      "rom-loader-ready",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true }
    );
  });
  if (typeof window.buildOverridesFromRom !== "function") {
    throw new Error("ROM exporter module not loaded. Make sure /rom/loader.js is reachable.");
  }
}

$(document).on('change', '#rom-upload', async function(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    setRomStatus("Loading ROM...");
    await ensureRomModulesLoaded();
    await ensureRomExporterLoaded();
    const buf = await file.arrayBuffer();
    window.__DDEX_LAST_ROM_BUFFER = buf;
    window.DDEX_ROM_INCLUDES = null;
    window.DDEX_ROM_DEBUG = null;
    const result = await window.buildOverridesFromRom(buf, { log: (msg) => setRomStatus(msg) });
    const normalizedOverrides = normalizeOverrideSpeciesPayload(result.overrides);
    result.overrides = normalizedOverrides;
    window.overrides = normalizedOverrides;
    overrideDexData(normalizedOverrides);
    applySearchIndex(result.searchIndex, result.searchIndexOffset, result.searchIndexCount);
    const rawRomName = String(file.name || "").replace(/\.nds$/i, "") || result.romTitle || "rom";
    const displayRomTitle = toTitleCaseWords(rawRomName);
    setDexTitle(displayRomTitle || rawRomName);
    maybeApplyRomFamilyFromTitle(rawRomName);
    window.DDEX_ROM_TEXTS = result.texts || null;
    window.DDEX_ROM_BACKUP_DATA = result.backupData || null;
    window.DDEX_ROM_INCLUDES = result.includes || null;
    window.DDEX_ROM_DEBUG = result.debug || null;
    if (result.itemLocationStats) {
      setRomStatus(`Item locations (event=${result.itemLocationStats.eventScriptCount}, script=${result.itemLocationStats.scriptParseCount})`);
    }

    localStorage[ROM_CACHE_FLAG] = "1";
    localStorage[ROM_KEYS.overrides] = JSON.stringify(normalizedOverrides);
    localStorage[ROM_KEYS.searchIndex] = JSON.stringify(result.searchIndex);
    localStorage[ROM_KEYS.searchIndexOffset] = JSON.stringify(result.searchIndexOffset);
    localStorage[ROM_KEYS.searchIndexCount] = JSON.stringify(result.searchIndexCount);
    localStorage[ROM_KEYS.title] = rawRomName;
    localStorage.romTitle = rawRomName;
    if (result.romFamily) {
      localStorage.romFamily = result.romFamily;
    } else {
      localStorage.removeItem("romFamily");
    }
    if (result.romVersion) {
      localStorage.romVersion = result.romVersion;
    } else {
      localStorage.removeItem("romVersion");
    }
    if (result.romExpanded) {
      localStorage.romExpanded = "1";
    } else {
      localStorage.removeItem("romExpanded");
    }
    localStorage.removeItem("game");
    // window.location.href = "/";
  } catch (err) {
    setRomStatus(err.message || String(err), true);
  }
});

function findOverrideKeyByNormalizedName(recordMap, normalizedName) {
  if (!recordMap || !normalizedName) return null;
  for (const key in recordMap) {
    if (cleanString(key) === normalizedName) {
      return key;
    }
  }
  return null;
}

function buildMoveOverrideFromBase(moveId) {
  const baseMove = BattleMovedex && BattleMovedex[moveId];
  if (!baseMove) return null;
  const desc = baseMove.desc || baseMove.shortDesc || "";
  return {
    name: baseMove.name,
    t: baseMove.type,
    bp: baseMove.basePower,
    cat: baseMove.category,
    pp: baseMove.pp,
    acc: baseMove.accuracy,
    prio: baseMove.priority,
    desc,
    oldDesc: desc,
  };
}

function buildAbilityOverrideFromBase(abilityId) {
  const baseAbility = BattleAbilities && BattleAbilities[abilityId];
  if (!baseAbility) return null;
  const desc = baseAbility.desc || baseAbility.shortDesc || "";
  return {
    name: baseAbility.name,
    desc,
    oldDesc: desc,
  };
}

function buildItemOverrideFromBase(itemId) {
  const baseItem = BattleItems && BattleItems[itemId];
  if (!baseItem) return null;
  const desc = baseItem.desc || baseItem.shortDesc || "";
  return {
    name: baseItem.name,
    desc,
    oldDesc: desc,
  };
}

function applyCustomDescriptionOverrides(baseOverrides, customData) {
  if (!baseOverrides || typeof baseOverrides !== "object") return baseOverrides;
  if (!customData || typeof customData !== "object") return baseOverrides;

  const nextOverrides = {
    ...baseOverrides,
    moves: { ...(baseOverrides.moves || {}) },
    abilities: { ...(baseOverrides.abilities || {}) },
    items: { ...(baseOverrides.items || {}) },
  };

  const moveDescs = customData.moveDescs;
  if (moveDescs && typeof moveDescs === "object") {
    for (const [moveName, desc] of Object.entries(moveDescs)) {
      if (typeof desc !== "string") continue;
      const moveId = cleanString(moveName);
      if (!moveId) continue;
      const existingKey = findOverrideKeyByNormalizedName(nextOverrides.moves, moveId);
      const baseRecord = existingKey
        ? nextOverrides.moves[existingKey]
        : buildMoveOverrideFromBase(moveId);
      if (!baseRecord) continue;
      const recordKey = existingKey || baseRecord.name || moveName;
      nextOverrides.moves[recordKey] = { ...baseRecord, desc };
    }
  }

  const abilityDescs = customData.abilityDescs;
  if (abilityDescs && typeof abilityDescs === "object") {
    for (const [abilityName, desc] of Object.entries(abilityDescs)) {
      if (typeof desc !== "string") continue;
      const abilityId = cleanString(abilityName);
      if (!abilityId) continue;
      const existingKey = findOverrideKeyByNormalizedName(nextOverrides.abilities, abilityId);
      const recordKey = existingKey || abilityId;
      const baseRecord = existingKey
        ? nextOverrides.abilities[existingKey]
        : buildAbilityOverrideFromBase(abilityId);
      if (!baseRecord) continue;
      nextOverrides.abilities[recordKey] = { ...baseRecord, desc };
    }
  }

  const itemDescs = customData.itemDescs;
  if (itemDescs && typeof itemDescs === "object") {
    for (const [itemName, desc] of Object.entries(itemDescs)) {
      if (typeof desc !== "string") continue;
      const itemId = cleanString(itemName);
      if (!itemId) continue;
      const existingKey = findOverrideKeyByNormalizedName(nextOverrides.items, itemId);
      const recordKey = existingKey || itemId;
      const baseRecord = existingKey
        ? nextOverrides.items[existingKey]
        : buildItemOverrideFromBase(itemId);
      if (!baseRecord) continue;
      nextOverrides.items[recordKey] = { ...baseRecord, desc };
    }
  }

  const itemLocations = customData.itemLocations;
  if (itemLocations && typeof itemLocations === "object") {
    for (const [itemName, customLocations] of Object.entries(itemLocations)) {
      if (typeof customLocations !== "string") continue;
      const itemId = cleanString(itemName);
      if (!itemId) continue;
      const existingKey = findOverrideKeyByNormalizedName(nextOverrides.items, itemId);
      const recordKey = existingKey || itemId;
      const baseRecord = existingKey
        ? nextOverrides.items[existingKey]
        : buildItemOverrideFromBase(itemId);
      if (!baseRecord) continue;
      nextOverrides.items[recordKey] = { ...baseRecord, customLocations };
    }
  }

  return nextOverrides;
}

async function loadOptionalCustomDescriptionOverrides(gameName, baseOverrides) {
  if (!gameName || !baseOverrides) return baseOverrides;
  window.customOverrides = null;

  const loaded = await checkAndLoadScript(`/data/overrides/${gameName}_customdesc.js`, {
    onNotFound: (src) => console.log(`Not found: ${src}`),
  });
  if (!loaded || !window.customOverrides) {
    return baseOverrides;
  }

  return applyCustomDescriptionOverrides(baseOverrides, window.customOverrides);
}

async function hydrateCachedOverrides(routeInfo) {
  const requestedGame = (routeInfo && routeInfo.game) || gameParam;
  if (requestedGame) {
    localStorage.removeItem("gameTitle");
    game = requestedGame;
    if (gameTitles[requestedGame]) {
      setGameDexTitle(requestedGame);
    }
    return false;
  }

  const appliedRomOverrides = applyRomOverridesFromCache();
  if (!appliedRomOverrides) {
    await applyGameOverridesFromCache();
  }
  setDexTitleFromStorage();
  return appliedRomOverrides;
}

async function loadRequestedGameOverrides(gameName) {
  if (!gameName) return false;
  game = gameName;
  if (gameTitles[gameName]) {
    setGameDexTitle(gameName);
  }

  const overridesLoaded = await checkAndLoadScript(`/data/overrides/${gameName}.js`, {
    onNotFound: (src) => console.log(`Not found: ${src}`),
  });
  if (!overridesLoaded) return false;

  let normalizedOverrides = normalizeOverrideSpeciesPayload(overrides);
  normalizedOverrides = await loadOptionalCustomDescriptionOverrides(gameName, normalizedOverrides);
  window.overrides = normalizedOverrides;
  overrides = normalizedOverrides;
  overrideDexData(normalizedOverrides);
  localStorage.overrides = JSON.stringify(normalizedOverrides);
  localStorage.game = gameName;
  console.log("Stored override data in cache");

  await checkAndLoadScript(`/data/overrides/${gameName}_searchindex.js`, {
    onLoad: () => {
      console.log(`search index loaded for ${gameName}`);
    },
    onNotFound: (src) => console.log(`Not found: ${src}`),
  });

  return true;
}

function overrideDexData(dexOverides) {
	monOverrides = dexOverides.poks
	moveOverrides = dexOverides.moves
	abilityOverrides = dexOverides.abilities
	itemOverrides = dexOverides.items

	console.log("Overriding Ability data...")
	overrideAbilityData(abilityOverrides)

	console.log("Overriding Item data...")
	overrideItemData(itemOverrides)

	console.log("Overriding mon data...")
	overrideMonData(monOverrides)

	console.log("Overriding move data...")
	overrideMoveData(moveOverrides)

	console.log("Overriding enc data...")
	BattleLocationdex = dexOverides.encs

	encTypes = getEncounterTypes(BattleLocationdex)
}

function getEncounterRateSlots(location, encType) {
  if (
    location &&
    location[encType] &&
    Array.isArray(location[encType].rates)
  ) {
    return location[encType].rates;
  }
  if (
    BattleLocationdex &&
    BattleLocationdex.rates &&
    Array.isArray(BattleLocationdex.rates[encType])
  ) {
    return BattleLocationdex.rates[encType];
  }
  return [];
}

function isEncounterTypeRecord(value) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    ("encs" in value || "rates" in value)
  );
}

function getEncounterTypes(locationDex) {
  const types = [];
  const seen = {};
  const rates = locationDex && locationDex.rates ? locationDex.rates : {};

  for (const encType in rates) {
    if (seen[encType]) continue;
    seen[encType] = true;
    types.push(encType);
  }

  for (const locationId in locationDex || {}) {
    if (locationId === "rates") continue;
    const location = locationDex[locationId];
    if (!location || typeof location !== "object") continue;
    for (const key in location) {
      if (key === "name" || seen[key]) continue;
      if (!isEncounterTypeRecord(location[key])) continue;
      seen[key] = true;
      types.push(key);
    }
  }

  return types;
}

function overrideAbilityData(abilityOverrides) {
	for (let abName in abilityOverrides) {
		let abId = cleanString(abName)

		if (typeof BattleAbilities[abId] != "undefined") {
			BattleAbilities[abId].desc = abilityOverrides[abName].desc
			BattleAbilities[abId].shortDesc = abilityOverrides[abName].desc
		} else {
			BattleAbilities[abId] = abilityOverrides[abName]
			BattleAbilities[abId].shortDesc = abilityOverrides[abName].desc
			BattleAbilities[abId].flags = {}
		}
	}
}

function overrideItemData(itemOverrides) {
	for (let itemName in itemOverrides) {
		let itemId = cleanString(itemName)
		let itemDesc = itemOverrides[itemName].desc

		if (typeof BattleItems[itemId] != "undefined") {
			if (typeof itemDesc === "string") {
				BattleItems[itemId].desc = itemDesc.replaceAll('\\n', " ")
				BattleItems[itemId].shortDesc = BattleItems[itemId].desc
			}
			BattleItems[itemId]["location"] = itemOverrides[itemName]["location"]
			BattleItems[itemId].customLocations = itemOverrides[itemName].customLocations
			BattleItems[itemId].rewards = itemOverrides[itemName].rewards
		} else {
			BattleItems[itemId] = itemOverrides[itemName]
			if (typeof itemDesc === "string" && typeof BattleItems[itemId].shortDesc == "undefined") {
				BattleItems[itemId].shortDesc = itemDesc.replaceAll('\\n', " ")
			}
		}
	}
}

function overrideMoveData(moveOverrides) {
	let movCount = 934
	let customMoveCount = 0
	for (let moveName in moveOverrides) {
		let moveId = cleanString(moveName)
		let moveData = moveOverrides[moveName]

		if (typeof BattleMovedex[moveId] != "undefined") {
			BattleMovedex[moveId].type = moveData.t
			BattleMovedex[moveId].basePower = moveData.bp
			BattleMovedex[moveId].category = moveData.cat
			BattleMovedex[moveId].pp = moveData.pp
			BattleMovedex[moveId].accuracy = moveData.acc
			BattleMovedex[moveId].priority = moveData.prio
			BattleMovedex[moveId].desc = moveData.desc
			BattleMovedex[moveId].shortDesc = moveData.desc
		} else {
			customMoveCount += 1
			BattleMovedex[moveId] = {}

			// Override Fields
			BattleMovedex[moveId].type = moveData.t
			BattleMovedex[moveId].basePower = moveData.bp
			BattleMovedex[moveId].category = moveData.cat
			BattleMovedex[moveId].pp = moveData.pp
			BattleMovedex[moveId].accuracy = moveData.acc
			BattleMovedex[moveId].priority = moveData.prio
			BattleMovedex[moveId].desc = moveData.desc
			BattleMovedex[moveId].shortDesc = moveData.desc

			// New Fields
			BattleMovedex[moveId].name = moveData.name
			BattleMovedex[moveId].num = movCount + customMoveCount
			BattleMovedex[moveId].flags = {}
			BattleMovedex[moveId].contestType = ""
		}

	}
}


function overrideMonData(monOverrides) {
	let monCount = 1025
	let customMonCount = 0
	for (let speciesName in monOverrides) {
		
		let speciesId = cleanString(speciesName)
		let monData = monOverrides[speciesName]
		
		if (truncatedSpeciesNames[speciesId]) {
			speciesId = truncatedSpeciesNames[speciesId]
		}

		if (typeof BattlePokedex[speciesId] == "undefined") {
			customMonCount += 1
			BattlePokedex[speciesId] = {
				name: monData.name,
				num: monCount + customMonCount,
				tier: "obtainable",
				abilities: {},
				baseStats: {},
			}
			BattleLearnsets[speciesId] = {}
			unrecognizedPoks[speciesId] = 1
		}
		if (Array.isArray(monData.types) && monData.types.length) {
			BattlePokedex[speciesId].types = monData.types
		}
		BattlePokedex[speciesId].abilities[0] = monData.abs[0]
		BattlePokedex[speciesId].abilities[1] = monData.abs[1]
		BattlePokedex[speciesId].abilities["H"] = monData.abs[2]
		BattlePokedex[speciesId].wildItems = monData.items
		BattlePokedex[speciesId].tier = "obtainable"
		BattlePokedex[speciesId].baseStats = {
			hp: monData.bs.hp,
			atk: monData.bs.at,
			def: monData.bs.df,
			spa: monData.bs.sa,
			spd: monData.bs.sd,
			spe: monData.bs.sp,	
		}
		BattlePokedex[speciesId].evos = monData.evos

		BattlePokedex[speciesId].evoMethods = monData.evoMethods
		BattlePokedex[speciesId].evoParams = monData.evoParams

		let lvlUpMoves = monData.learnset_info.learnset
		let tms = monData.learnset_info.tms
		let tutors = monData.learnset_info.tutors


		BattleLearnsets[speciesId].learnset = {}


		for (let mv of lvlUpMoves) {
			let mvId = cleanString(mv[1])
			let level = mv[0]

			BattleLearnsets[speciesId].learnset[mvId] ||= []
			BattleLearnsets[speciesId].learnset[mvId].push(`L${level}`)
		}

		for (let mv of tms) {
			let mvId = cleanString(mv)

			BattleLearnsets[speciesId].learnset[mvId] ||= []
			BattleLearnsets[speciesId].learnset[mvId].push(`M`)
		}

		if (tutors) {
			for (let mv of tutors) {
				let mvId = cleanString(mv)
	
				BattleLearnsets[speciesId].learnset[mvId] ||= []
				BattleLearnsets[speciesId].learnset[mvId].push(`T`)
			}

		}
		

		// console.log(BattleLearnsets[speciesId].learnset)

		// Set optional fields
		for (let field of ["evoLevel", "evoType", "evoCondition"]) {
			if (typeof monData[field] != "undefined") {
				BattlePokedex[speciesId][field] = monData[field]
			}
		}

		// Set Abilities
		let abilityData = {}
		for (let abIndex in monData.abs) {
			if (abIndex == 0) {
				abilityData["0"] = monData.abs[abIndex]
			}
			if (abIndex == 1) {
				abilityData["1"] = monData.abs[abIndex]
			}
			if (abIndex == 2) {
				abilityData["H"] = monData.abs[abIndex]
			}
		}
		
	}
}




function cleanString(str) {
  if (str) {
    return str.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  } else {
    return "";
  }
  
};

function checkAndLoadScript(src, options = {}) {
    const {
        onLoad = null,
        onError = null,
        onNotFound = null,
        timeout = 10000
    } = options;

    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        if (window.DDEXPaths && typeof window.DDEXPaths.withBase === "function") {
          src = window.DDEXPaths.withBase(src);
        }
        script.src = src;
        script.type = 'text/javascript';
        
        let timeoutId;
        let resolved = false;

        // Set up timeout
        if (timeout > 0) {
            timeoutId = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    console.error(`Timeout loading: ${src}`);
                    if (onError) onError(src, new Error('Timeout'));
                    resolve(false);
                }
            }, timeout);
        }

        script.onload = () => {
            if (!resolved) {
                resolved = true;
                if (timeoutId) clearTimeout(timeoutId);
                console.log(`Successfully loaded: ${src}`);
                if (onLoad) onLoad(src);
                resolve(true);
            }
        };
        
        script.onerror = (error) => {
            if (!resolved) {
                resolved = true;
                if (timeoutId) clearTimeout(timeoutId);
                console.log(`File not found or failed to load: ${src}`);
                if (onNotFound) onNotFound(src, error);
                resolve(false);
            }
        };
        
        // Add script to document head
        document.head.appendChild(script);
    });
}

function moveSubs() {
	return {
	    "faintattack": "feintattack",
	    "smellingsalt": "smellingsalts",
	    "vicegrip": "visegrip",
	    "hijumpkick": "highjumpkick",
	}
}

        // # "Fletchinder","Crabominable","Blacephalon","Corvisquire","Corviknight","Barraskewda","Centiskorch",
        // # "Polteageist","Stonjourner","Basculegion","Meowscarada","Squawkabilly","Kilowattrel","Brambleghast","Dudunsparce","Poltchageist",
        // # "Fezandipiti","Continental","Archipelago"
function unabv(speciesName) {
	let abvs = {
		"fletcinder": "fletchinder"
	}
	if (abvs[speciesName]) {
		return abvs[speciesName]
	} else {
		return speciesName
	}
}

function containsAll(a, b) {
  const setA = new Set(a);
  return b.every(v => setA.has(v));
}

const hasOverlap = (a, b) => a.some(v => b.includes(v));

function getOverlap(a, b) {
  const setB = new Set(b);
  return [...new Set(a.filter(v => setB.has(v)))];
}

function snakeToTitleCase(str) {
  return str
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

window.DDEX_OVERRIDES_API = {
  applyGameOverridesFromCache,
  applyRomOverridesFromCache,
  applySearchIndex,
  checkAndLoadScript,
  clearRomCache,
  hydrateCachedOverrides,
  loadRequestedGameOverrides,
  overrideDexData,
  setDexTitleFromStorage,
};

function highlightChanged(oldStr, newStr) {
  oldStr = String(oldStr ?? "");
  newStr = String(newStr ?? "");

  // Escape first so we can safely inject spans
  const esc = Dex.escapeHTML;

  if (!oldStr) return esc(newStr);
  if (oldStr === newStr) return esc(newStr);

  // Fast path: appended text (your example)
  if (newStr.startsWith(oldStr)) {
    const same = newStr.slice(0, oldStr.length);
    const added = newStr.slice(oldStr.length);
    return esc(same) + `<span class="desc-diff">${esc(added)}</span>`;
  }

  // General path: highlight the differing middle (prefix + suffix match)
  let i = 0;
  const minLen = Math.min(oldStr.length, newStr.length);
  while (i < minLen && oldStr[i] === newStr[i]) i++;

  let j = 0;
  while (
    j < minLen - i &&
    oldStr[oldStr.length - 1 - j] === newStr[newStr.length - 1 - j]
  ) j++;

  const prefix = newStr.slice(0, i);
  const changed = newStr.slice(i, newStr.length - j);
  const suffix = newStr.slice(newStr.length - j);

  if (!changed) return esc(newStr); // fallback

  return (
    esc(prefix) +
    `<span class="desc-diff">${esc(changed)}</span>` +
    esc(suffix)
  );
}
