(function () {
  "use strict";

  var romRuntimePromise = null;

  function fail(message) {
    return Promise.reject(new Error(message));
  }

  function ensureBootstrap() {
    if (!window.__DDEX_BOOTSTRAP__) {
      return fail("Dynamic Dex bootstrap is not available.");
    }
    return Promise.resolve(window.__DDEX_BOOTSTRAP__);
  }

  function ensureLoaded() {
    if (romRuntimePromise) return romRuntimePromise;

    romRuntimePromise = ensureBootstrap().then(async function (bootstrap) {
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

    return romRuntimePromise;
  }

  window.DDEX_ROM_TOOLS = {
    ensureLoaded: ensureLoaded,
  };
})();
