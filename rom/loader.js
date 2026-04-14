import { buildOverridesFromRom, describeBattleEffect, readRomFileByPath } from "./dspre_export.js";

window.buildOverridesFromRom = buildOverridesFromRom;
window.describeBattleEffect = describeBattleEffect;
window.readRomFileByPath = readRomFileByPath;
window.__romLoaderReady = true;
window.dispatchEvent(new Event("rom-loader-ready"));
