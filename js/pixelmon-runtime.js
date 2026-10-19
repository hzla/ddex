// Pixelmon payloads include thousands of learnsets and spawn rules. Keep them
// in IndexedDB rather than exceeding the small localStorage quota.
var DDEX_PIXELMON_CACHE_KEY = "ddexPixelmonImport";
var ddexPixelmonRuntimePromise = null;

function pixelmonCache(operation, payload) {
  return new Promise(function (resolve, reject) {
    if (!window.indexedDB) return reject(new Error("This browser cannot save Pixelmon imports (IndexedDB is unavailable)."));
    var request = window.indexedDB.open("ddex-imports", 1);
    request.onupgradeneeded = function () { request.result.createObjectStore("imports"); };
    request.onerror = function () { reject(request.error); };
    request.onsuccess = function () {
      var db = request.result;
      var transaction = db.transaction("imports", operation === "get" ? "readonly" : "readwrite");
      var store = transaction.objectStore("imports");
      var action = operation === "put" ? store.put(payload, "pixelmon") : operation === "delete" ? store.delete("pixelmon") : store.get("pixelmon");
      transaction.oncomplete = function () { db.close(); resolve(action.result); };
      transaction.onerror = transaction.onabort = function () { db.close(); reject(transaction.error || new Error("Could not save Pixelmon data.")); };
    };
  });
}

function getActiveDexOverrides() {
  if (window.overrides && typeof window.overrides === "object") return window.overrides;
  try { return JSON.parse(localStorage.overrides || "null"); }
  catch (_) { return null; }
}

function isPixelmonImportActive() {
  return localStorage.getItem(DDEX_PIXELMON_CACHE_KEY) === "1";
}

function clearPixelmonImport() {
  localStorage.removeItem(DDEX_PIXELMON_CACHE_KEY);
  window.DDEX_PIXELMON_DATA = null;
  // The marker controls restoration; a stale IndexedDB record is never loaded.
}

function applyPixelmonPayload(result) {
  clearRomCache();
  window.DDEX_PIXELMON_DATA = result;
  window.overrides = normalizeOverrideSpeciesPayload(result.overrides);
  window.DDEX_ROM_SOURCE_GEN = 8;
  window.DDEX_ROM_BACKUP_DATA = normalizeBackupFormattedSetSpecies(result.backupData);
  window.DDEX_ROM_OVERRIDES = { overrides: window.overrides, searchIndex: result.searchIndex, searchIndexOffset: result.searchIndexOffset, searchIndexCount: result.searchIndexCount, title: result.title };
  overrideDexData(window.overrides);
  applySearchIndex(result.searchIndex, result.searchIndexOffset, result.searchIndexCount);
  setHideEffectIds(false);
  localStorage.setItem(DDEX_PIXELMON_CACHE_KEY, "1");
  localStorage.setItem(ROM_SOURCE_GEN_KEY, "8");
  localStorage.setItem(ROM_CACHE_FLAG, "1");
  localStorage.romTitle = result.title;
  localStorage.gameTitle = result.title;
  localStorage.removeItem("game");
  setDexTitle(result.title);
  ddexCalcBridgeState.pendingSyncPayload = null;
  setCalcBridgeStatus("Pixelmon data ready. Calculator uses Gen 8 damage mechanics.");
}

async function restorePixelmonImport() {
  if (!isPixelmonImportActive()) return false;
  try {
    var result = await pixelmonCache("get");
    if (!result) { clearRomCache(); return false; }
    var namesPath = window.DDEXPaths && window.DDEXPaths.withBase
      ? window.DDEXPaths.withBase("/rom/pixelmon-set-names.mjs")
      : "/rom/pixelmon-set-names.mjs";
    var namesModule = await import(namesPath);
    if (namesModule.normalizePixelmonCalcSetNames(result)) await pixelmonCache("put", result);
    applyPixelmonPayload(result);
    return true;
  } catch (error) {
    console.warn("Could not restore Pixelmon data", error);
    clearRomCache();
    return false;
  }
}

async function loadUploadedPixelmonZip(file) {
  if (!file || !/\.zip$/i.test(file.name)) throw new Error("Select a ZIP containing data/pixelmon.");
  if (file.size > 256 * 1024 * 1024) throw new Error("The Pixelmon ZIP must be smaller than 256 MB. Zip only data/pixelmon.");
  setUploadStatus("Reading Pixelmon ZIP…", false, "#pixelmon-upload-status");
  if (!window.DDEX_PIXELMON_IMPORT) {
    if (!ddexPixelmonRuntimePromise) ddexPixelmonRuntimePromise = window.__DDEX_BOOTSTRAP__.loadRawModule("/rom/pixelmon-loader.js").catch(function (error) { ddexPixelmonRuntimePromise = null; throw error; });
    await ddexPixelmonRuntimePromise;
  }
  var importer = window.DDEX_PIXELMON_IMPORT;
  var entries = await extractZipTextEntries(file, {
    accept: function (name) { return !!importer.pixelmonArchivePath(name); },
    maxEntrySize: 16 * 1024 * 1024,
    maxTotalSize: 128 * 1024 * 1024,
    onProgress: function (done, total) { setUploadStatus("Reading Pixelmon JSON: " + done + " / " + total, false, "#pixelmon-upload-status"); },
  });
  var fileTitle = file.name.replace(/\.zip$/i, "");
  var result = importer.buildPixelmonImport(entries, { title: /^(pixelmon|data)$/i.test(fileTitle) ? "Pixelmon" : "Pixelmon — " + fileTitle });
  // Save first: a malformed ZIP or storage error leaves the current dex intact.
  await pixelmonCache("put", result);
  applyPixelmonPayload(result);
  refreshSearchAfterOverrideUpload();
  setUploadStatus("Loaded", false, "#pixelmon-upload-status");
  return result;
}

$(document).on("change", "#pixelmon-upload", async function (event) {
  var input = event.target;
  input.disabled = true;
  try { if (input.files.length) await loadUploadedPixelmonZip(input.files[0]); }
  catch (error) { setUploadStatus(error.message || String(error), true, "#pixelmon-upload-status"); }
  finally { input.disabled = false; input.value = ""; }
});
