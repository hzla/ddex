(function () {
  "use strict";

  var gen4RuntimePromise = null;
  var gen3RuntimePromise = null;

  function fail(message) {
    return Promise.reject(new Error(message));
  }

  function ensureBootstrap() {
    if (!window.__DDEX_BOOTSTRAP__) {
      return fail("Dynamic Dex bootstrap is not available.");
    }
    return Promise.resolve(window.__DDEX_BOOTSTRAP__);
  }

  function ensureGen4Loaded() {
    if (gen4RuntimePromise) return gen4RuntimePromise;

    gen4RuntimePromise = ensureBootstrap().then(async function (bootstrap) {
      if (!window.GEN4_SYMBOLS) {
        await bootstrap.loadRawScript("/rom/gen4_symbols.js");
      }
      if (!window.PLATINUM_SCRCMD_DB) {
        await bootstrap.loadRawScript("/rom/platinum_scrcmd_database.js");
      }
      if (!window.HGSS_SCRCMD_DB) {
        await bootstrap.loadRawScript("/rom/hgss_scrcmd_database.js");
      }
      if (!window.__romLoaderReady && typeof window.buildOverridesFromRom !== "function") {
        await bootstrap.loadRawModule("/rom/loader.js");
      }
      return true;
    });

    return gen4RuntimePromise;
  }

  function ensureGen3Loaded() {
    if (gen3RuntimePromise) return gen3RuntimePromise;

    gen3RuntimePromise = ensureBootstrap().then(async function (bootstrap) {
      if (!window.__gen3LoaderReady && typeof window.buildOverridesFromGen3Rom !== "function") {
        await bootstrap.loadRawModule("/rom/gen3-loader.js");
      }
      return true;
    });

    return gen3RuntimePromise;
  }

  window.DDEX_ROM_TOOLS = {
    ensureLoaded: ensureGen4Loaded,
    ensureGen3Loaded: ensureGen3Loaded,
    ensureGen4Loaded: ensureGen4Loaded,
  };
})();
