import { buildOverridesFromRom, describeBattleEffect, readRomFileByPath, readRomOverlayById, listRomOverlays } from "./dspre_export.js";

window.buildOverridesFromRom = buildOverridesFromRom;
window.describeBattleEffect = describeBattleEffect;
window.readRomFileByPath = readRomFileByPath;
window.readRomOverlayById = readRomOverlayById;
window.listRomOverlays = listRomOverlays;
window.__romLoaderReady = true;
window.dispatchEvent(new Event("rom-loader-ready"));
