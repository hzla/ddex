const ROM_CACHE_FLAG = "romOverrides";
const ROM_SOURCE_GEN_KEY = "ddexRomSourceGen";
const DDEX_CALC_READY_MESSAGE_TYPE = "ddex:calc-ready";
const DDEX_CALC_SYNC_MESSAGE_TYPE = "ddex:calc-sync";
const DDEX_CALC_SYNC_STARTED_MESSAGE_TYPE = "ddex:calc-sync-started";
const DDEX_CALC_SYNC_ERROR_MESSAGE_TYPE = "ddex:calc-sync-error";
const ROM_KEYS = {
  overrides: "overrides",
  searchIndex: "searchindex",
  searchIndexOffset: "searchindex_offset",
  searchIndexCount: "searchindex_count",
  title: "gameTitle",
  expanded: "romExpanded",
};

window.DDEX_ROM_SOURCE_GEN = Number(localStorage.getItem(ROM_SOURCE_GEN_KEY) || "0") || null;

const ddexCalcBridgeState = {
  calcWindow: null,
  calcReady: false,
  pendingSyncPayload: null,
  status: "",
};

function isLocalDdexCalcBridge() {
  return window.location.hostname === "localhost" && window.location.port === "3000";
}

function getDdexCalcOrigin() {
  if (isLocalDdexCalcBridge()) {
    return "http://localhost:3001";
  }
  return "https://hzla.github.io";
}

function getDdexCalcPath() {
  if (isLocalDdexCalcBridge()) {
    return "/";
  }
  return "/Dynamic-Calc-Decomps/";
}

function emitCalcBridgeStateChange() {
  if (!window.DDEXCalcBridge || typeof window.DDEXCalcBridge.getState !== "function") {
    return;
  }
  window.dispatchEvent(
    new CustomEvent("ddex:calc-bridge-state", {
      detail: window.DDEXCalcBridge.getState(),
    })
  );
}

function setCalcBridgeStatus(status) {
  ddexCalcBridgeState.status = String(status || "");
  emitCalcBridgeStateChange();
}

var params = new URLSearchParams(window.location.search);
var gameParam = params.get("game");
var GAME_SOURCE_ALIASES = {
  "platinumreduxhc": "platinumredux",
  "sterlingsilver117": "sterlingsilver",
  "unbound": "pokemonunbound",
};
var game = normalizeGameSourceKey(gameParam) || (isRomOverrideActive() ? null : normalizeGameSourceKey(localStorage.game));
var gameTitles = {
	"vintagewhiteplus": "Vintage White+",
	"blazeblack2redux": "Blaze Black/Volt White 2 Redux",
	"blindingwhite2": "Blinding White 2",
	"cascadewhite": "Cascade White",
	"cascadewhite2": "Cascade White",
	"renegadeplatinum": "Renegade Platinum",
  "platinumredux": "Platinum Redux",
  "sterlingsilver": "Sterling Silver",
  "sterlingsilver117": "Sterling Silver",
  "pokemonnull": "Pokemon Null",
  "pokemonunbound": "Pokemon Unbound",
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
  if (normalized === "renegade platinum" || normalized === "platinum redux") {
    localStorage.romFamily = "Plat";
  } else if (normalized === "sterling silver") {
    localStorage.romFamily = "HGSS";
  }
}

function applySearchIndex(searchIndex, offsets, counts) {
  if (Array.isArray(searchIndex)) window.BattleSearchIndex = searchIndex;
  if (Array.isArray(offsets)) window.BattleSearchIndexOffset = offsets;
  if (counts && typeof counts === "object") window.BattleSearchCountIndex = counts;
  applyLocationSearchAliasesToSearchIndex();
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
    window.DDEX_ROM_SOURCE_GEN = Number(localStorage.getItem(ROM_SOURCE_GEN_KEY) || "0") || null;
    window.DDEX_ROM_OVERRIDES = { overrides, searchIndex, searchIndexOffset, searchIndexCount, title };
    emitCalcBridgeStateChange();
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
  localStorage.removeItem(ROM_SOURCE_GEN_KEY);
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
  window.DDEX_ROM_SOURCE_GEN = null;
  window.DDEX_ROM_OVERRIDES = null;
  window.DDEX_ROM_BACKUP_DATA = null;
  window.DDEX_ROM_DEBUG = null;
  emitCalcBridgeStateChange();
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

function clearNuzlockeEncounterCache() {
  localStorage.removeItem("ddexNuzlockeEncounterCacheV1");
}

$(document).on('click', '#reset-cache', function() {
  delete localStorage.overrides
  clearRomCache();
  clearMissedLocationCache();
  clearManualCaughtCache();
  clearNuzlockeEncounterCache();
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

function getRomSourceGen() {
  if (window.DDEX_ROM_SOURCE_GEN === 3 || window.DDEX_ROM_SOURCE_GEN === 4) {
    return window.DDEX_ROM_SOURCE_GEN;
  }
  const storedGen = Number(localStorage.getItem(ROM_SOURCE_GEN_KEY) || "0");
  if (storedGen === 3 || storedGen === 4) return storedGen;
  if (window.DDEX_ROM_BACKUP_DATA) {
    return (localStorage.romFamily || "").trim() ? 4 : 3;
  }
  return null;
}

function getCalcBridgeConfig() {
  const sourceGen = getRomSourceGen();
  if (!sourceGen) return null;
  const sharedConfig = {
    gen: 8,
    critGen: 3,
    sourceType: "full",
    baseGame: "",
    mechanics: "vanilla",
    customPoks: true,
  };
  if (sourceGen === 4) {
    return {
      ...sharedConfig,
      damageGen: 4,
      typeChart: 4,
      switchIn: 4,
      gameSwitchIn: 4,
    };
  }
  return {
    ...sharedConfig,
    damageGen: 3,
    typeChart: 3,
    switchIn: 3,
    gameSwitchIn: 3,
  };
}

function getCalcBridgeBackupData() {
  const payload = window.DDEX_ROM_BACKUP_DATA;
  if (!payload) return null;
  return normalizeBackupFormattedSetSpecies(
    toggleBackupGlitchedSpeciesRedirects(
      { ...payload, title: localStorage.romTitle || localStorage[ROM_KEYS.title] || payload.title || "rom" },
      true
    )
  );
}

function getCalcBridgeScriptPayload() {
  const backupPayload = getCalcBridgeBackupData();
  if (!backupPayload) return null;
  const exportTitle = backupPayload.title || localStorage.romTitle || localStorage[ROM_KEYS.title] || "rom";
  const base = safeFileBase(exportTitle);
  return {
    title: exportTitle,
    fileName: `${base}_npoint_data.js`,
    scriptText: `var backup_data = ${formatBackupDataFile(backupPayload)};`,
  };
}

function buildCalcBridgeUrl() {
  const config = getCalcBridgeConfig();
  if (!config) return null;
  const url = new URL(getDdexCalcPath(), getDdexCalcOrigin());
  url.searchParams.set("dev", "1");
  url.searchParams.set("forceBlankConfig", "1");
  url.searchParams.set("gen", String(config.gen));
  url.searchParams.set("dmgGen", String(config.damageGen));
  url.searchParams.set("types", String(config.typeChart));
  url.searchParams.set("critGen", String(config.critGen));
  url.searchParams.set("switchIn", String(config.switchIn));
  url.searchParams.set("ddexBridgeOrigin", window.location.origin);
  return url.toString();
}

function postCalcBridgePayload(payload) {
  if (!ddexCalcBridgeState.calcWindow || ddexCalcBridgeState.calcWindow.closed) {
    ddexCalcBridgeState.calcReady = false;
    ddexCalcBridgeState.calcWindow = null;
    ddexCalcBridgeState.pendingSyncPayload = null;
    setCalcBridgeStatus("Open Calc first.");
    return false;
  }
  ddexCalcBridgeState.calcWindow.postMessage(payload, getDdexCalcOrigin());
  return true;
}

function handleCalcBridgeMessage(event) {
  if (event.origin !== getDdexCalcOrigin()) return;
  if (ddexCalcBridgeState.calcWindow && event.source !== ddexCalcBridgeState.calcWindow) return;
  const data = event.data || {};
  if (!data || typeof data.type !== "string") return;

  if (data.type === DDEX_CALC_READY_MESSAGE_TYPE) {
    ddexCalcBridgeState.calcWindow = event.source || ddexCalcBridgeState.calcWindow;
    ddexCalcBridgeState.calcReady = true;
    setCalcBridgeStatus("Calc ready.");
    if (ddexCalcBridgeState.pendingSyncPayload) {
      const pendingPayload = ddexCalcBridgeState.pendingSyncPayload;
      ddexCalcBridgeState.pendingSyncPayload = null;
      if (postCalcBridgePayload(pendingPayload)) {
        setCalcBridgeStatus("Syncing calc data...");
      }
    }
    return;
  }

  if (data.type === DDEX_CALC_SYNC_STARTED_MESSAGE_TYPE) {
    setCalcBridgeStatus("Calc data synced. The calc is reloading.");
    return;
  }

  if (data.type === DDEX_CALC_SYNC_ERROR_MESSAGE_TYPE) {
    setCalcBridgeStatus(data.error ? `Sync failed: ${data.error}` : "Sync failed.");
  }
}

window.addEventListener("message", handleCalcBridgeMessage);

window.DDEXCalcBridge = {
  getState: function () {
    return {
      calcReady: !!ddexCalcBridgeState.calcReady,
      hasCalcWindow: !!(ddexCalcBridgeState.calcWindow && !ddexCalcBridgeState.calcWindow.closed),
      hasCalcData: !!window.DDEX_ROM_BACKUP_DATA,
      hasDexData: !!getRomOverridePayload(),
      romSourceGen: getRomSourceGen(),
      status: ddexCalcBridgeState.status,
    };
  },
  openCalc: function () {
    const url = buildCalcBridgeUrl();
    if (!url) {
      setCalcBridgeStatus("Load a Gen 3 or Gen 4 ROM first.");
      return false;
    }
    const calcWindow = window.open(url, "ddex-dynamic-calc");
    if (!calcWindow) {
      setCalcBridgeStatus("The calc tab was blocked. Allow pop-ups and try again.");
      return false;
    }
    ddexCalcBridgeState.calcWindow = calcWindow;
    ddexCalcBridgeState.calcReady = false;
    setCalcBridgeStatus("Opening calc tab...");
    return true;
  },
  syncToCalc: function () {
    const config = getCalcBridgeConfig();
    const scriptPayload = getCalcBridgeScriptPayload();
    if (!config || !scriptPayload) {
      setCalcBridgeStatus("Load a ROM with calc export data first.");
      return false;
    }
    const syncPayload = {
      type: DDEX_CALC_SYNC_MESSAGE_TYPE,
      config: config,
      fileName: scriptPayload.fileName,
      sourceGen: getRomSourceGen(),
      scriptText: scriptPayload.scriptText,
      title: scriptPayload.title,
    };
    if (!ddexCalcBridgeState.calcWindow || ddexCalcBridgeState.calcWindow.closed) {
      setCalcBridgeStatus("Open Calc first.");
      return false;
    }
    if (!ddexCalcBridgeState.calcReady) {
      ddexCalcBridgeState.pendingSyncPayload = syncPayload;
      setCalcBridgeStatus("Waiting for the calc tab to finish loading...");
      return true;
    }
    ddexCalcBridgeState.pendingSyncPayload = null;
    if (postCalcBridgePayload(syncPayload)) {
      setCalcBridgeStatus("Syncing calc data...");
      return true;
    }
    return false;
  },
};

emitCalcBridgeStateChange();

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

window.downloadLoadedRomOverlay = async function (overlayId, filename) {
  if (!window.__DDEX_LAST_ROM_BUFFER) {
    console.warn("No ROM buffer found. Load a ROM via file upload first.");
    return false;
  }
  try {
    await ensureGen4ExporterLoaded();
    if (typeof window.readRomOverlayById !== "function") {
      console.warn("ROM overlay reader not available. Ensure /rom/loader.js is loaded.");
      return false;
    }
    const overlayInfo = await window.readRomOverlayById(window.__DDEX_LAST_ROM_BUFFER, overlayId);
    const romTitle = localStorage.romTitle || (window.DDEX_ROM_OVERRIDES && window.DDEX_ROM_OVERRIDES.title) || "rom";
    const normalizedOverlayId = Number.parseInt(String(overlayInfo.overlayId), 10);
    const downloadName = filename || `${String(romTitle).replace(/[^a-z0-9._-]+/gi, "_")}_overlay_${String(normalizedOverlayId).padStart(4, "0")}.bin`;
    const blob = new Blob([overlayInfo.data], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = downloadName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    const result = {
      overlayId: normalizedOverlayId,
      fileId: overlayInfo.fileId,
      compressed: overlayInfo.compressed,
      ramAddress: overlayInfo.ramAddress,
      ramSize: overlayInfo.ramSize,
      byteLength: overlayInfo.data.byteLength,
      fileName: downloadName,
    };
    console.log(`Downloaded overlay ${normalizedOverlayId} as ${downloadName}`, result);
    return result;
  } catch (err) {
    console.error(err);
    return false;
  }
};

window.downloadLoadedRomOverlay5 = function (filename) {
  return window.downloadLoadedRomOverlay(5, filename);
};

window.downloadLoadedRomUndergroundOverlay = function (filename) {
  return window.downloadLoadedRomOverlay(23, filename);
};

window.listLoadedRomOverlays = async function () {
  if (!window.__DDEX_LAST_ROM_BUFFER) {
    console.warn("No ROM buffer found. Load a ROM via file upload first.");
    return [];
  }
  try {
    await ensureGen4ExporterLoaded();
    if (typeof window.listRomOverlays !== "function") {
      console.warn("ROM overlay table reader not available. Ensure /rom/loader.js is loaded.");
      return [];
    }
    const overlays = await window.listRomOverlays(window.__DDEX_LAST_ROM_BUFFER);
    if (typeof console !== "undefined" && console.table) {
      console.table(overlays);
    }
    return overlays;
  } catch (err) {
    console.error(err);
    return [];
  }
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
  const sourceGen = Number(options.sourceGen || result.sourceGen || 0) || null;

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
  window.DDEX_ROM_SCRIPT_TEXTS = result.scriptTexts || null;
  window.DDEX_ROM_ITEM_SCRIPT_DEBUG = result.debug && result.debug.itemScriptReferences
    ? result.debug.itemScriptReferences
    : null;
  window.DDEX_ROM_ITEM_LOCATION_DEBUG = result.debug && result.debug.itemLocations
    ? result.debug.itemLocations
    : null;
  window.DDEX_ROM_WILD_HELD_ITEM_DEBUG = result.debug && result.debug.wildHeldItemReferences
    ? result.debug.wildHeldItemReferences
    : null;
  window.DDEX_ROM_MINING_DEBUG = result.debug && result.debug.miningTable
    ? result.debug.miningTable
    : null;
  window.DDEX_ROM_SOURCE_GEN = sourceGen;
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
  if (sourceGen) {
    localStorage.setItem(ROM_SOURCE_GEN_KEY, String(sourceGen));
  } else {
    localStorage.removeItem(ROM_SOURCE_GEN_KEY);
  }

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
  emitCalcBridgeStateChange();
}

function normalizeLoadedRomDebugItemKey(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeLoadedRomDebugItemRequest(rawRequest) {
  if (typeof rawRequest === "number" && Number.isFinite(rawRequest)) {
    return { requestedItemId: rawRequest, requestedName: null };
  }

  if (typeof rawRequest === "string") {
    const trimmed = rawRequest.trim();
    if (/^\d+$/.test(trimmed)) {
      return { requestedItemId: Number.parseInt(trimmed, 10), requestedName: null };
    }
    return { requestedItemId: null, requestedName: trimmed };
  }

  if (rawRequest && typeof rawRequest === "object") {
    if (Number.isFinite(rawRequest.itemId)) {
      return { requestedItemId: Number(rawRequest.itemId), requestedName: rawRequest.name || null };
    }
    if (typeof rawRequest.id === "number" && Number.isFinite(rawRequest.id)) {
      return { requestedItemId: Number(rawRequest.id), requestedName: rawRequest.name || null };
    }
    if (typeof rawRequest.name === "string" && rawRequest.name.trim()) {
      return { requestedItemId: null, requestedName: rawRequest.name.trim() };
    }
  }

  return { requestedItemId: null, requestedName: String(rawRequest || "").trim() || null };
}

function getLoadedRomItemNames() {
  const itemNames = window.DDEX_ROM_TEXTS && Array.isArray(window.DDEX_ROM_TEXTS.itemNames)
    ? window.DDEX_ROM_TEXTS.itemNames
    : null;
  if (!itemNames || !itemNames.length) {
    throw new Error("No loaded ROM item text table is available. Import a Gen 4 ROM first.");
  }
  return itemNames;
}

function getLoadedRomScriptTexts() {
  const scriptTexts = window.DDEX_ROM_SCRIPT_TEXTS;
  if (!scriptTexts || typeof scriptTexts !== "object") {
    throw new Error("No loaded ROM script text export is available. Import a Gen 4 ROM first.");
  }
  return scriptTexts;
}

function getLoadedRomMiningDebug() {
  const miningDebug = window.DDEX_ROM_MINING_DEBUG || (window.DDEX_ROM_DEBUG && window.DDEX_ROM_DEBUG.miningTable);
  if (!miningDebug || typeof miningDebug !== "object") {
    throw new Error("No loaded ROM mining table debug data is available. Import a Gen 4 ROM first.");
  }
  return miningDebug;
}

function getLoadedRomItemLocationDebug() {
  const itemLocationDebug = window.DDEX_ROM_ITEM_LOCATION_DEBUG || (window.DDEX_ROM_DEBUG && window.DDEX_ROM_DEBUG.itemLocations);
  return itemLocationDebug && itemLocationDebug.byItem ? itemLocationDebug : null;
}

function getLoadedRomWildHeldItemDebug() {
  const wildHeldItemDebug =
    window.DDEX_ROM_WILD_HELD_ITEM_DEBUG ||
    (window.DDEX_ROM_DEBUG && window.DDEX_ROM_DEBUG.wildHeldItemReferences);
  return wildHeldItemDebug && wildHeldItemDebug.byItemId ? wildHeldItemDebug : null;
}

function cloneLoadedRomHeaderRecord(record) {
  return record ? { ...record } : record;
}

function dedupeLoadedRomHeaderRecords(records) {
  const normalized = Array.isArray(records) ? records : [];
  const out = [];
  const seen = new Set();
  for (let i = 0; i < normalized.length; i += 1) {
    const record = normalized[i];
    if (!record) continue;
    const key = [
      record.headerID,
      record.eventFileID,
      record.scriptFileID,
      record.locationRaw,
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cloneLoadedRomHeaderRecord(record));
  }
  out.sort(function(a, b) {
    const aHeader = Number.isFinite(a.headerID) ? a.headerID : Number.POSITIVE_INFINITY;
    const bHeader = Number.isFinite(b.headerID) ? b.headerID : Number.POSITIVE_INFINITY;
    if (aHeader !== bHeader) return aHeader - bHeader;
    return String(a.locationRaw || "").localeCompare(String(b.locationRaw || ""));
  });
  return out;
}

function summarizeLoadedRomHeaderIds(records) {
  const headerRecords = dedupeLoadedRomHeaderRecords(records);
  const headerIds = [];
  for (let i = 0; i < headerRecords.length; i += 1) {
    const headerID = headerRecords[i].headerID;
    if (Number.isFinite(headerID) && headerIds.indexOf(headerID) < 0) {
      headerIds.push(headerID);
    }
  }
  return headerIds;
}

function cloneLoadedRomItemLocationRecord(record) {
  return record ? { ...record } : record;
}

function getLoadedRomScriptFileUsageDebugData() {
  const itemScriptDebug = window.DDEX_ROM_ITEM_SCRIPT_DEBUG || (window.DDEX_ROM_DEBUG && window.DDEX_ROM_DEBUG.itemScriptReferences);
  if (!itemScriptDebug || !itemScriptDebug.byItemId) {
    throw new Error("No loaded ROM script file usage debug data is available. Import a Gen 4 ROM first.");
  }
  if (itemScriptDebug.scriptFileUsageById) {
    return itemScriptDebug.scriptFileUsageById;
  }

  const byScriptFileId = {};
  for (const entry of Object.values(itemScriptDebug.byItemId)) {
    if (!entry || !Array.isArray(entry.references)) continue;
    for (let i = 0; i < entry.references.length; i += 1) {
      const reference = entry.references[i];
      if (!reference || !Number.isFinite(reference.scriptFileID)) continue;
      const key = String(reference.scriptFileID);
      if (!byScriptFileId[key]) byScriptFileId[key] = [];
      const records = Array.isArray(reference.mapHeadersUsingScriptFile) ? reference.mapHeadersUsingScriptFile : [];
      for (let j = 0; j < records.length; j += 1) {
        byScriptFileId[key].push(records[j]);
      }
    }
  }
  return byScriptFileId;
}

function resolveLoadedRomItemIdFromDebugRequest(itemRequest, itemNames) {
  const normalizedRequest = normalizeLoadedRomDebugItemRequest(itemRequest);
  if (normalizedRequest.requestedItemId !== null && normalizedRequest.requestedItemId !== undefined) {
    return normalizedRequest;
  }

  const requestedKey = normalizeLoadedRomDebugItemKey(normalizedRequest.requestedName);
  if (!requestedKey) return normalizedRequest;

  for (let itemId = 0; itemId < itemNames.length; itemId += 1) {
    if (normalizeLoadedRomDebugItemKey(itemNames[itemId]) === requestedKey) {
      return {
        requestedItemId: itemId,
        requestedName: normalizedRequest.requestedName,
      };
    }
  }

  return normalizedRequest;
}

function buildLoadedRomItemScriptDebugResult(itemNames) {
  const debugData = window.DDEX_ROM_ITEM_SCRIPT_DEBUG || (window.DDEX_ROM_DEBUG && window.DDEX_ROM_DEBUG.itemScriptReferences);
  if (!debugData || !debugData.byItemKey) {
    throw new Error("No ROM item script debug data is loaded. Import a Gen 4 ROM first.");
  }
  const itemLocationDebug = getLoadedRomItemLocationDebug();
  const wildHeldItemDebug = getLoadedRomWildHeldItemDebug();
  const loadedItemNames = getLoadedRomItemNames();

  const requestedItems = Array.isArray(itemNames) && itemNames.length
    ? itemNames
    : ["RageCandyBar", { itemId: 103, name: "Old Amber" }];
  const items = [];
  const missing = [];

  for (let i = 0; i < requestedItems.length; i += 1) {
    const normalizedRequest = normalizeLoadedRomDebugItemRequest(requestedItems[i]);
    const requestedName = normalizedRequest.requestedName;
    const requestedItemId = normalizedRequest.requestedItemId;
    const itemKey = requestedName ? normalizeLoadedRomDebugItemKey(requestedName) : null;
    const entry = requestedItemId !== null && requestedItemId !== undefined
      ? (debugData.byItemId && debugData.byItemId[String(requestedItemId)]) || null
      : (itemKey ? debugData.byItemKey[itemKey] : null);
    if (!entry) {
      missing.push({
        requestedName,
        requestedItemId,
        itemKey,
        loadedItemName:
          requestedItemId !== null &&
          requestedItemId !== undefined &&
          requestedItemId >= 0 &&
          requestedItemId < loadedItemNames.length
            ? loadedItemNames[requestedItemId]
            : null,
      });
      continue;
    }
    items.push({
      requestedName,
      requestedItemId,
      itemKey,
      itemId: entry.itemId,
      itemName: entry.itemName,
      references: Array.isArray(entry.references)
        ? entry.references.map(function(reference) {
            const mapHeadersUsingScriptFile = dedupeLoadedRomHeaderRecords(reference.mapHeadersUsingScriptFile);
            return {
              ...reference,
              mapHeadersUsingScriptFile,
              headerIdsUsingScriptFile: summarizeLoadedRomHeaderIds(mapHeadersUsingScriptFile),
            };
          })
        : [],
      systemReferences: Array.isArray(entry.systemReferences) ? entry.systemReferences.slice() : [],
      itemLocationRecords: itemLocationDebug && Array.isArray(itemLocationDebug.byItem[entry.itemKey])
        ? itemLocationDebug.byItem[entry.itemKey].map(cloneLoadedRomItemLocationRecord)
        : [],
      groundItemLocations: itemLocationDebug && Array.isArray(itemLocationDebug.byItem[entry.itemKey])
        ? itemLocationDebug.byItem[entry.itemKey]
            .filter(function(record) { return record && record.foundMethod === "event_script_number"; })
            .map(cloneLoadedRomItemLocationRecord)
        : [],
      hiddenGroundItemLocations: itemLocationDebug && Array.isArray(itemLocationDebug.byItem[entry.itemKey])
        ? itemLocationDebug.byItem[entry.itemKey]
            .filter(function(record) { return record && record.foundMethod === "hidden_item"; })
            .map(cloneLoadedRomItemLocationRecord)
        : [],
      scriptItemLocations: itemLocationDebug && Array.isArray(itemLocationDebug.byItem[entry.itemKey])
        ? itemLocationDebug.byItem[entry.itemKey]
            .filter(function(record) { return record && record.foundMethod === "script_parse"; })
            .map(cloneLoadedRomItemLocationRecord)
        : [],
      npcItemLocations: itemLocationDebug && Array.isArray(itemLocationDebug.byItem[entry.itemKey])
        ? itemLocationDebug.byItem[entry.itemKey]
            .filter(function(record) { return record && record.foundMethod === "script_parse"; })
            .map(cloneLoadedRomItemLocationRecord)
        : [],
      wildHeldItemReferences:
        wildHeldItemDebug &&
        wildHeldItemDebug.byItemId &&
        wildHeldItemDebug.byItemId[String(entry.itemId)] &&
        Array.isArray(wildHeldItemDebug.byItemId[String(entry.itemId)].references)
          ? wildHeldItemDebug.byItemId[String(entry.itemId)].references.map(function(reference) {
              const mapHeadersUsingEncounterFile = dedupeLoadedRomHeaderRecords(reference.mapHeadersUsingEncounterFile);
              return {
                ...reference,
                mapHeadersUsingEncounterFile,
                headerIdsUsingEncounterFile: summarizeLoadedRomHeaderIds(mapHeadersUsingEncounterFile),
              };
            })
          : [],
    });
  }

  return {
    romTitle: localStorage.romTitle || (window.DDEX_ROM_OVERRIDES && window.DDEX_ROM_OVERRIDES.title) || null,
    romFamily: localStorage.romFamily || null,
    requestedItems: requestedItems.slice(),
    missing,
    items,
  };
}

window.debugLoadedRomItemScriptReferences = function(itemNames) {
  const result = buildLoadedRomItemScriptDebugResult(itemNames);
  if (typeof console !== "undefined") {
    console.log("Loaded ROM item script references", result);
  }
  return result;
};

window.debugLoadedRomItemIdReferences = function(itemIds) {
  const normalized = Array.isArray(itemIds) ? itemIds : [itemIds];
  return window.debugLoadedRomItemScriptReferences(normalized);
};

window.debugLoadedRomScriptFileUsage = function(scriptFileIds) {
  const usageById = getLoadedRomScriptFileUsageDebugData();
  const normalizedIds = Array.isArray(scriptFileIds) ? scriptFileIds : [scriptFileIds];
  const scriptFiles = [];
  const missing = [];

  for (let i = 0; i < normalizedIds.length; i += 1) {
    const normalizedId = Number.parseInt(String(normalizedIds[i]), 10);
    if (!Number.isFinite(normalizedId)) {
      missing.push({
        requestedScriptFileId: normalizedIds[i],
        reason: "non_numeric_script_file_id",
      });
      continue;
    }
    const headerRecords = dedupeLoadedRomHeaderRecords(usageById[String(normalizedId)]);
    if (!headerRecords.length) {
      missing.push({
        requestedScriptFileId: normalizedId,
        reason: "script_file_not_found",
      });
      continue;
    }
    scriptFiles.push({
      scriptFileID: normalizedId,
      headerIds: summarizeLoadedRomHeaderIds(headerRecords),
      mapHeaders: headerRecords,
    });
  }

  const result = {
    romTitle: localStorage.romTitle || (window.DDEX_ROM_OVERRIDES && window.DDEX_ROM_OVERRIDES.title) || null,
    romFamily: localStorage.romFamily || null,
    requestedScriptFileIds: normalizedIds.slice(),
    missing,
    scriptFiles,
  };

  if (typeof console !== "undefined") {
    console.log("Loaded ROM script file usage", result);
  }
  return result;
};

window.debugLoadedRomItemTextTable = function() {
  const itemNames = getLoadedRomItemNames();
  const rows = itemNames.map(function(itemName, itemId) {
    return { itemId: itemId, itemName: itemName };
  });
  if (typeof console !== "undefined") {
    console.table(rows);
  }
  return rows;
};

window.debugLoadedRomMiningTable = function() {
  const miningDebug = getLoadedRomMiningDebug();
  if (typeof console !== "undefined") {
    console.log("Loaded ROM mining table", miningDebug);
  }
  return miningDebug;
};

window.debugLoadedRomMiningItemOdds = function(itemRequest) {
  const miningDebug = getLoadedRomMiningDebug();
  if (!Array.isArray(miningDebug.entries) || miningDebug.status !== "ok") {
    const unavailableResult = {
      romTitle: localStorage.romTitle || (window.DDEX_ROM_OVERRIDES && window.DDEX_ROM_OVERRIDES.title) || null,
      romFamily: localStorage.romFamily || null,
      requestedName:
        itemRequest && typeof itemRequest === "object" && typeof itemRequest.name === "string"
          ? itemRequest.name
          : (typeof itemRequest === "string" ? itemRequest : null),
      requestedItemId:
        typeof itemRequest === "number"
          ? itemRequest
          : (itemRequest && typeof itemRequest === "object" && Number.isFinite(itemRequest.itemId) ? itemRequest.itemId : null),
      missing: true,
      miningDebugStatus: miningDebug.status || "unknown",
      failureReason: miningDebug.failureReason || "Mining table scan data is unavailable.",
      overlayLength: miningDebug.overlayLength || null,
    };
    if (typeof console !== "undefined") {
      console.log("Loaded ROM mining item odds", unavailableResult);
    }
    return unavailableResult;
  }
  const itemNames = getLoadedRomItemNames();
  const normalizedRequest = resolveLoadedRomItemIdFromDebugRequest(itemRequest, itemNames);
  const requestedItemId = normalizedRequest.requestedItemId;
  const requestedName = normalizedRequest.requestedName;
  const loadedItemName =
    requestedItemId !== null &&
    requestedItemId !== undefined &&
    requestedItemId >= 0 &&
    requestedItemId < itemNames.length
      ? itemNames[requestedItemId]
      : null;
  const aggregate = requestedItemId !== null && requestedItemId !== undefined
    ? miningDebug.aggregates &&
      miningDebug.aggregates.byBagItemId &&
      miningDebug.aggregates.byBagItemId[String(requestedItemId)]
    : null;

  const result = aggregate
    ? {
        romTitle: localStorage.romTitle || (window.DDEX_ROM_OVERRIDES && window.DDEX_ROM_OVERRIDES.title) || null,
        romFamily: localStorage.romFamily || null,
        requestedName,
        requestedItemId,
        itemId: aggregate.bagItemId,
        itemName: aggregate.bagItemName,
        miningObjectIds: Array.isArray(aggregate.miningObjectIds) ? aggregate.miningObjectIds.slice() : [],
        entryIndexes: Array.isArray(aggregate.entryIndexes) ? aggregate.entryIndexes.slice() : [],
        weights: { ...(aggregate.weights || {}) },
        probabilities: { ...(aggregate.probabilities || {}) },
        scenarioTotals: { ...(miningDebug.scenarioTotals || {}) },
        buriedItemCountRange: miningDebug.buriedItemCountRange || null,
        source: miningDebug.source || null,
        tableOffset: miningDebug.tableOffset,
      }
    : {
        romTitle: localStorage.romTitle || (window.DDEX_ROM_OVERRIDES && window.DDEX_ROM_OVERRIDES.title) || null,
        romFamily: localStorage.romFamily || null,
        requestedName,
        requestedItemId,
        loadedItemName,
        missing: true,
      };

  if (typeof console !== "undefined") {
    console.log("Loaded ROM mining item odds", result);
  }
  return result;
};

window.debugLoadedRomScriptFile = function(scriptFileId) {
  const scriptTexts = getLoadedRomScriptTexts();
  const normalizedId = Number.parseInt(String(scriptFileId), 10);
  if (!Number.isFinite(normalizedId)) {
    throw new Error("Pass a numeric script file id.");
  }
  const text = scriptTexts[String(normalizedId)];
  if (typeof text !== "string") {
    throw new Error(`No parsed script text was found for script file ${normalizedId}.`);
  }
  if (typeof console !== "undefined") {
    console.log(`Loaded ROM script file ${normalizedId}`, text);
  }
  return text;
};

window.downloadLoadedRomScriptFile = function(scriptFileId) {
  const text = window.debugLoadedRomScriptFile(scriptFileId);
  const normalizedId = Number.parseInt(String(scriptFileId), 10);
  const romTitle = localStorage.romTitle || (window.DDEX_ROM_OVERRIDES && window.DDEX_ROM_OVERRIDES.title) || "rom";
  const fileName = `${String(romTitle).replace(/[^a-z0-9._-]+/gi, "_")}_script_${String(normalizedId).padStart(4, "0")}.txt`;
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(function() {
    URL.revokeObjectURL(url);
  }, 0);
  return { scriptFileId: normalizedId, fileName: fileName, length: text.length };
};

window.debugPlatinumKaizoItemReferences = function() {
  return window.debugLoadedRomItemScriptReferences(["RageCandyBar", { itemId: 103, name: "Old Amber" }]);
};

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
    sourceGen: 4,
  });

  if (result.itemLocationStats) {
    setRomStatus(
      `Item locations (event=${result.itemLocationStats.eventScriptCount}, hidden=${result.itemLocationStats.hiddenItemCount || 0}, script=${result.itemLocationStats.scriptParseCount})`
    );
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
    sourceGen: 3,
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
      applyLocationSearchAliasesToSearchIndex();
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
  applyPlatinumLocationAliases(BattleLocationdex)

	encTypes = getEncounterTypes(BattleLocationdex)
}

function normalizeLocationAliasId(value) {
  if (typeof toID === "function") {
    return toID(value);
  }
  return String(value || "")
    .toLowerCase()
    .replace(/é/g, "e")
    .replace(/[^a-z0-9]+/g, "");
}

function registerLocationAlias(aliasLookup, aliasName, locationId) {
  const aliasId = normalizeLocationAliasId(aliasName);
  if (!aliasId || aliasLookup[aliasId]) return;
  aliasLookup[aliasId] = locationId;
}

function getApplicablePlatinumLocationAliases(locationDex) {
  const aliasTable =
    window.BattlePlatinumLocationAliases &&
    typeof window.BattlePlatinumLocationAliases === "object"
      ? window.BattlePlatinumLocationAliases
      : {};
  const groupedAliases = {};
  const appliedAliases = {};

  for (const locationId in aliasTable) {
    if (!Object.prototype.hasOwnProperty.call(aliasTable, locationId)) continue;
    const aliasRecord = aliasTable[locationId];
    if (!aliasRecord || typeof aliasRecord !== "object") continue;
    const locationNameId = Number.parseInt(aliasRecord.locationNameId, 10);
    if (!Number.isFinite(locationNameId)) continue;
    if (!groupedAliases[locationNameId]) {
      groupedAliases[locationNameId] = {};
    }
    groupedAliases[locationNameId][locationId] = aliasRecord;
  }

  for (const locationNameIdKey in groupedAliases) {
    if (!Object.prototype.hasOwnProperty.call(groupedAliases, locationNameIdKey)) continue;
    const aliasGroup = groupedAliases[locationNameIdKey];
    const currentGroupIds = [];

    for (const locationId in locationDex || {}) {
      if (locationId === "rates") continue;
      if (!Object.prototype.hasOwnProperty.call(locationDex, locationId)) continue;
      const location = locationDex[locationId];
      if (!location || typeof location !== "object") continue;
      const locationNameId = Number.parseInt(location.locationNameId, 10);
      if (String(locationNameId) === String(locationNameIdKey)) {
        currentGroupIds.push(locationId);
      }
    }

    const aliasGroupIds = Object.keys(aliasGroup);
    if (currentGroupIds.length !== aliasGroupIds.length) continue;

    let allAliasLocationsExist = true;
    for (let index = 0; index < aliasGroupIds.length; index += 1) {
      if (!locationDex[aliasGroupIds[index]]) {
        allAliasLocationsExist = false;
        break;
      }
    }
    if (!allAliasLocationsExist) continue;

    for (let index = 0; index < aliasGroupIds.length; index += 1) {
      const locationId = aliasGroupIds[index];
      appliedAliases[locationId] = aliasGroup[locationId];
    }
  }

  return appliedAliases;
}

function applyPlatinumLocationAliases(locationDex) {
  const aliasLookup = {};
  const appliedAliases = getApplicablePlatinumLocationAliases(locationDex);

  for (const locationId in appliedAliases) {
    if (!Object.prototype.hasOwnProperty.call(appliedAliases, locationId)) continue;
    const aliasRecord = appliedAliases[locationId];
    const location = locationDex && locationDex[locationId];
    if (!location || !aliasRecord) continue;

    const legacyNames = Array.isArray(aliasRecord.legacyNames)
      ? aliasRecord.legacyNames.filter(Boolean)
      : [];

    if (aliasRecord.displayName) {
      location.name = aliasRecord.displayName;
      registerLocationAlias(aliasLookup, aliasRecord.displayName, locationId);
    }
    if (legacyNames.length) {
      location.legacyNames = legacyNames.slice();
      for (let index = 0; index < legacyNames.length; index += 1) {
        registerLocationAlias(aliasLookup, legacyNames[index], locationId);
      }
    }
  }

  window.DDEX_APPLIED_PLATINUM_LOCATION_ALIASES = appliedAliases;
  window.BattleLocationAliasDex = aliasLookup;
  return appliedAliases;
}

function compareSearchIndexPair(pairA, pairB) {
  const entryA = pairA.entry;
  const entryB = pairB.entry;
  if (entryA[0] !== entryB[0]) return entryA[0] < entryB[0] ? -1 : 1;
  if (entryA[1] !== entryB[1]) return entryA[1] < entryB[1] ? -1 : 1;

  const originalA =
    pairA.dynamicAlias && pairA.originalId
      ? pairA.originalId
      : entryA.length > 2
        ? String(entryA[2])
        : "";
  const originalB =
    pairB.dynamicAlias && pairB.originalId
      ? pairB.originalId
      : entryB.length > 2
        ? String(entryB[2])
        : "";
  if (originalA !== originalB) return originalA < originalB ? -1 : 1;

  const offsetA = entryA.length > 3 ? Number(entryA[3]) || 0 : 0;
  const offsetB = entryB.length > 3 ? Number(entryB[3]) || 0 : 0;
  return offsetA - offsetB;
}

function applyLocationSearchAliasesToSearchIndex() {
  if (!Array.isArray(window.BattleSearchIndex) || !window.BattleLocationdex) return;

  const appliedAliases =
    window.DDEX_APPLIED_PLATINUM_LOCATION_ALIASES &&
    typeof window.DDEX_APPLIED_PLATINUM_LOCATION_ALIASES === "object"
      ? window.DDEX_APPLIED_PLATINUM_LOCATION_ALIASES
      : {};
  const aliasLocationIds = Object.keys(appliedAliases);
  if (!aliasLocationIds.length) return;

  const offsets = Array.isArray(window.BattleSearchIndexOffset)
    ? window.BattleSearchIndexOffset
    : [];
  const pairs = [];
  const existingAliasKeys = {};

  for (let index = 0; index < window.BattleSearchIndex.length; index += 1) {
    const entry = window.BattleSearchIndex[index];
    if (!Array.isArray(entry)) continue;
    pairs.push({
      entry: entry.slice(),
      offset: offsets[index] || "",
      dynamicAlias: false,
      originalId: "",
    });

    if (entry[1] !== "location") continue;
    const canonicalId =
      entry.length > 3 &&
      Array.isArray(window.BattleSearchIndex[entry[2]]) &&
      window.BattleSearchIndex[entry[2]][1] === "location"
        ? window.BattleSearchIndex[entry[2]][0]
        : entry[0];
    existingAliasKeys[`${entry[0]}|${canonicalId}`] = 1;
  }

  let addedAliasCount = 0;
  for (let index = 0; index < aliasLocationIds.length; index += 1) {
    const locationId = aliasLocationIds[index];
    const location = window.BattleLocationdex[locationId];
    if (!location) continue;

    const aliasNames = [];
    if (location.name) aliasNames.push(location.name);
    if (Array.isArray(location.legacyNames)) {
      for (let legacyIndex = 0; legacyIndex < location.legacyNames.length; legacyIndex += 1) {
        aliasNames.push(location.legacyNames[legacyIndex]);
      }
    }

    for (let aliasIndex = 0; aliasIndex < aliasNames.length; aliasIndex += 1) {
      const aliasId = normalizeLocationAliasId(aliasNames[aliasIndex]);
      if (!aliasId || aliasId === locationId) continue;
      const aliasKey = `${aliasId}|${locationId}`;
      if (existingAliasKeys[aliasKey]) continue;
      existingAliasKeys[aliasKey] = 1;
      pairs.push({
        entry: [aliasId, "location", locationId, 0],
        offset: "",
        dynamicAlias: true,
        originalId: locationId,
      });
      addedAliasCount += 1;
    }
  }

  if (!addedAliasCount) return;

  pairs.sort(compareSearchIndexPair);

  const locationBaseIndexById = {};
  for (let index = 0; index < pairs.length; index += 1) {
    const pair = pairs[index];
    if (pair.dynamicAlias) continue;
    if (!Array.isArray(pair.entry) || pair.entry[1] !== "location") continue;
    if (pair.entry.length !== 2) continue;
    locationBaseIndexById[pair.entry[0]] = index;
  }

  const nextSearchIndex = [];
  const nextSearchIndexOffset = [];
  for (let index = 0; index < pairs.length; index += 1) {
    const pair = pairs[index];
    if (pair.dynamicAlias) {
      const originalIndex = locationBaseIndexById[pair.originalId];
      if (typeof originalIndex !== "number") continue;
      pair.entry[2] = originalIndex;
    }
    nextSearchIndex.push(pair.entry);
    nextSearchIndexOffset.push(pair.offset);
  }

  window.BattleSearchIndex = nextSearchIndex;
  window.BattleSearchIndexOffset = nextSearchIndexOffset;
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
