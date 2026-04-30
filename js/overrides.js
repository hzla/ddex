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
var GAME_SOURCE_ALIASES = {
  "sterlingsilver117": "sterlingsilver",
};
var game = normalizeGameSourceKey(gameParam) || (isRomOverrideActive() ? null : normalizeGameSourceKey(localStorage.game));
var gameTitles = {
	"vintagewhiteplus": "Vintage White+",
	"blazeblack2redux": "Blaze Black/Volt White 2 Redux",
	"blindingwhite2": "Blinding White 2",
	"cascadewhite": "Cascade White",
	"cascadewhite2": "Cascade White",
	"renegadeplatinum": "Renegade Platinum",
  "sterlingsilver": "Sterling Silver",
  "sterlingsilver117": "Sterling Silver",
  "pokemonnull": "Pokemon Null",
  "reignitedruby": "Reignited Ruby",
  "platinumkaizo": "Platinum Kaizo",
  "cascadewhitedev": "Cascade White Dev",
  "sacredgoldstormsilver": "Sacred Gold",
  "autumnred": "Autumn Red"
}

function normalizeGameSourceKey(gameKey) {
  if (!gameKey) return "";
  var normalized = String(gameKey).trim().toLowerCase();
  return GAME_SOURCE_ALIASES[normalized] || normalized;
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
  const storedGameKey = localStorage.game;
  const titleGameKey = storedGameKey && gameTitles[storedGameKey]
    ? storedGameKey
    : normalizeGameSourceKey(storedGameKey);
  if (titleGameKey && gameTitles[titleGameKey]) {
    setDexTitle(gameTitles[titleGameKey]);
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
  const titleKey = gameTitles[gameKey] ? gameKey : normalizeGameSourceKey(gameKey);
  const title = gameTitles[titleKey];
  if (!title) return;
  setDexTitle(title);
  maybeApplyRomFamilyFromTitle(title);
}

async function applyGameOverridesFromCache() {
  if (isRomOverrideActive()) return false;
  if (!localStorage.overrides) return false;
  const gameKey = localStorage.game;
  const sourceGameKey = normalizeGameSourceKey(gameKey);
  if (!sourceGameKey || !(gameTitles[gameKey] || gameTitles[sourceGameKey])) return false;
  try {
    let parsedOverrides = JSON.parse(localStorage.overrides || "null");
    if (!parsedOverrides) return false;
    parsedOverrides = normalizeOverrideSpeciesPayload(parsedOverrides);
    parsedOverrides = await loadOptionalCustomDescriptionOverrides(sourceGameKey, parsedOverrides);
    window.overrides = parsedOverrides;
    overrides = parsedOverrides;
    localStorage.overrides = JSON.stringify(parsedOverrides);
    localStorage.game = sourceGameKey;
    overrideDexData(parsedOverrides);
    setGameDexTitle(gameKey || sourceGameKey);
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
  window.DDEX_ROM_OVERRIDES = null;
  window.DDEX_ROM_BACKUP_DATA = null;
  window.DDEX_ROM_DEBUG = null;
}

function clearMissedLocationCache() {
  var prefix = "ddexNuzlockeMissedLocationsV1";
  for (var i = localStorage.length - 1; i >= 0; i--) {
    var key = localStorage.key(i);
    if (key && key.indexOf(prefix) === 0) {
      localStorage.removeItem(key);
    }
  }
}

function clearManualCaughtCache() {
  var prefix = "ddexNuzlockeManualCaughtV1";
  for (var i = localStorage.length - 1; i >= 0; i--) {
    var key = localStorage.key(i);
    if (key && key.indexOf(prefix) === 0) {
      localStorage.removeItem(key);
    }
  }
}

$(document).on('click', '#reset-cache', function() {
  delete localStorage.overrides
  clearRomCache();
  clearMissedLocationCache();
  clearManualCaughtCache();
  localStorage.removeItem("game");
  location.reload()
})

function setRomStatus(msg, isErr) {
  const prefix = isErr ? "[error] " : "";
  if (isErr) {
    console.error(`${prefix}${msg}`);
    return;
  }
  console.log(msg);
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

function stripFileExtension(name) {
  return String(name || "").replace(/\.[^.]+$/i, "");
}

function toTitleCaseWords(name) {
  const base = stripFileExtension(name).trim();
  if (!base) return "";
  const words = base
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/);
  return words
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : ""))
    .join(" ");
}

function getUploadedFiles(input) {
  return Array.from((input && input.files) || []).filter(Boolean);
}

function findUploadedFile(files, pattern) {
  return files.find((file) => pattern.test(String(file && file.name)));
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
    await ensureGen4ExporterLoaded();
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

async function ensureGen4ExporterLoaded() {
  if (typeof window.buildOverridesFromRom === "function") return;
  if (
    window.DDEX_ROM_TOOLS &&
    typeof window.DDEX_ROM_TOOLS.ensureGen4Loaded === "function"
  ) {
    await window.DDEX_ROM_TOOLS.ensureGen4Loaded();
  }
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

async function ensureGen3ExporterLoaded() {
  if (typeof window.buildOverridesFromGen3Rom === "function") return;
  if (
    window.DDEX_ROM_TOOLS &&
    typeof window.DDEX_ROM_TOOLS.ensureGen3Loaded === "function"
  ) {
    await window.DDEX_ROM_TOOLS.ensureGen3Loaded();
  }
  if (typeof window.buildOverridesFromGen3Rom !== "function") {
    throw new Error("Gen 3 exporter module not loaded. Make sure /rom/gen3-loader.js is reachable.");
  }
}

function applyImportedRomPayload(result, options = {}) {
  const normalizedOverrides = normalizeOverrideSpeciesPayload(result.overrides);
  const rawRomTitle = String(result.title || options.fallbackTitle || "rom").trim() || "rom";
  const displayRomTitle = toTitleCaseWords(rawRomTitle);

  window.__DDEX_LAST_ROM_BUFFER = options.lastRomBuffer || null;
  window.overrides = normalizedOverrides;
  overrideDexData(normalizedOverrides);
  applySearchIndex(result.searchIndex, result.searchIndexOffset, result.searchIndexCount);
  setDexTitle(displayRomTitle || rawRomTitle);
  maybeApplyRomFamilyFromTitle(rawRomTitle);

  window.DDEX_ROM_TEXTS = result.texts || null;
  window.DDEX_ROM_BACKUP_DATA = result.backupData || null;
  window.DDEX_ROM_INCLUDES = result.includes || null;
  window.DDEX_ROM_DEBUG = result.debug || null;
  window.DDEX_ROM_OVERRIDES = {
    overrides: normalizedOverrides,
    searchIndex: result.searchIndex,
    searchIndexOffset: result.searchIndexOffset,
    searchIndexCount: result.searchIndexCount,
    title: rawRomTitle,
  };

  localStorage[ROM_CACHE_FLAG] = "1";
  localStorage[ROM_KEYS.overrides] = JSON.stringify(normalizedOverrides);
  localStorage[ROM_KEYS.searchIndex] = JSON.stringify(result.searchIndex);
  localStorage[ROM_KEYS.searchIndexOffset] = JSON.stringify(result.searchIndexOffset);
  localStorage[ROM_KEYS.searchIndexCount] = JSON.stringify(result.searchIndexCount);
  localStorage[ROM_KEYS.title] = rawRomTitle;
  localStorage.romTitle = rawRomTitle;

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
}

async function importGen4RomFiles(files) {
  const file = findUploadedFile(files, /\.nds$/i);
  if (!file) {
    throw new Error("Select a `.nds` ROM file, or include a `.toml` layout file for Gen 3 import.");
  }

  setRomStatus("Loading Gen 4 ROM...");
  await ensureRomModulesLoaded();
  await ensureGen4ExporterLoaded();
  const buf = await file.arrayBuffer();
  const result = await window.buildOverridesFromRom(buf, { log: (msg) => setRomStatus(msg) });
  const rawRomName = stripFileExtension(file.name) || result.romTitle || "rom";

  applyImportedRomPayload(result, {
    fallbackTitle: rawRomName,
    lastRomBuffer: buf,
  });

  if (result.itemLocationStats) {
    setRomStatus(`Item locations (event=${result.itemLocationStats.eventScriptCount}, script=${result.itemLocationStats.scriptParseCount})`);
  }
}

async function importGen3RomFiles(files) {
  const romFile = findUploadedFile(files, /\.gba$/i);
  const tomlFile = findUploadedFile(files, /\.toml$/i);
  if (!romFile || !tomlFile) {
    throw new Error("Select one `.gba` ROM file and one `.toml` layout file for Gen 3 import.");
  }

  setRomStatus("Loading Gen 3 ROM and layout...");
  await ensureRomModulesLoaded();
  await ensureGen3ExporterLoaded();
  const [romBuffer, tomlText] = await Promise.all([
    romFile.arrayBuffer(),
    tomlFile.text(),
  ]);
  const rawRomName = stripFileExtension(romFile.name) || "rom";
  setRomStatus("Generating Gen 3 overrides and search index...");
  const result = window.buildOverridesFromGen3Rom(romBuffer, tomlText, {
    slug: safeFileBase(rawRomName),
    title: toTitleCaseWords(rawRomName) || rawRomName,
  });

  applyImportedRomPayload(result, {
    fallbackTitle: result.title || rawRomName,
    lastRomBuffer: null,
  });

  if (result.summary) {
    setRomStatus(`Gen 3 export ready (${result.summary.dex_species || 0} species, ${result.summary.dex_locations || 0} locations).`);
  }
}

$(document).on('change', '#rom-upload', async function(e) {
  const files = getUploadedFiles(e.target);
  if (!files.length) return;
  try {
    if (findUploadedFile(files, /\.toml$/i)) {
      await importGen3RomFiles(files);
    } else {
      await importGen4RomFiles(files);
    }
  } catch (err) {
    setRomStatus(err.message || String(err), true);
  } finally {
    e.target.value = "";
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
  const override = {
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
  if (Object.prototype.hasOwnProperty.call(baseMove, "e_id")) {
    override.e_id = baseMove.e_id;
  }
  if (Object.prototype.hasOwnProperty.call(baseMove, "e_chance")) {
    override.e_chance = baseMove.e_chance;
  }
  return override;
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
    game = normalizeGameSourceKey(requestedGame);
    if (gameTitles[requestedGame] || gameTitles[game]) {
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
  const sourceGameName = normalizeGameSourceKey(gameName);
  if (!sourceGameName) return false;
  game = sourceGameName;
  if (gameTitles[gameName] || gameTitles[sourceGameName]) {
    setGameDexTitle(gameName);
  }

  const overridesLoaded = await checkAndLoadScript(`/data/overrides/${sourceGameName}.js`, {
    onNotFound: (src) => console.log(`Not found: ${src}`),
  });
  if (!overridesLoaded) return false;

  let normalizedOverrides = normalizeOverrideSpeciesPayload(overrides);
  normalizedOverrides = await loadOptionalCustomDescriptionOverrides(sourceGameName, normalizedOverrides);
  window.overrides = normalizedOverrides;
  overrides = normalizedOverrides;
  overrideDexData(normalizedOverrides);
  localStorage.overrides = JSON.stringify(normalizedOverrides);
  localStorage.game = sourceGameName;
  console.log("Stored override data in cache");

  await checkAndLoadScript(`/data/overrides/${sourceGameName}_searchindex.js`, {
    onLoad: () => {
      console.log(`search index loaded for ${sourceGameName}`);
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
			if (Object.prototype.hasOwnProperty.call(moveData, "e_id")) {
				BattleMovedex[moveId].e_id = moveData.e_id
			}
			if (Object.prototype.hasOwnProperty.call(moveData, "e_chance")) {
				BattleMovedex[moveId].e_chance = moveData.e_chance
			}
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
			if (Object.prototype.hasOwnProperty.call(moveData, "e_id")) {
				BattleMovedex[moveId].e_id = moveData.e_id
			}
			if (Object.prototype.hasOwnProperty.call(moveData, "e_chance")) {
				BattleMovedex[moveId].e_chance = moveData.e_chance
			}
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
		if (
			typeof monData.catchRate != "undefined" &&
			monData.catchRate !== null &&
			monData.catchRate !== "" &&
			Number.isFinite(Number(monData.catchRate))
		) {
			BattlePokedex[speciesId].catchRate = Number(monData.catchRate)
		}
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
		BattlePokedex[speciesId].evoMethodIds = monData.evoMethodIds

		const learnsetInfo =
			monData.learnset_info && typeof monData.learnset_info === "object"
				? monData.learnset_info
				: {}
		let lvlUpMoves = Array.isArray(learnsetInfo.learnset) ? learnsetInfo.learnset : []
		let tms = Array.isArray(learnsetInfo.tms) ? learnsetInfo.tms : []
		let tutors = Array.isArray(learnsetInfo.tutors) ? learnsetInfo.tutors : []

		if (typeof BattleLearnsets[speciesId] == "undefined" || !BattleLearnsets[speciesId]) {
			BattleLearnsets[speciesId] = {}
		}
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
