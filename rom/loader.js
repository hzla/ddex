import { buildOverridesFromRom } from "./dspre_export.js";

window.buildOverridesFromRom = buildOverridesFromRom;
window.__romLoaderReady = true;
window.dispatchEvent(new Event("rom-loader-ready"));
