import {
  buildGen3ExportArtifacts,
  normalizeSlug,
  titleFromName,
} from "../../webapp/src/lib/gen3-exporter.mjs";

export function buildOverridesFromGen3Rom(romBytes, tomlText, options = {}) {
  const byteView = romBytes instanceof Uint8Array ? romBytes : new Uint8Array(romBytes);
  const artifacts = buildGen3ExportArtifacts({
    romBytes: byteView,
    tomlText,
    slug: options.slug || normalizeSlug(options.title || "rom"),
    title: options.title || titleFromName(options.slug || "rom"),
  });

  return {
    slug: artifacts.slug,
    title: artifacts.title,
    summary: artifacts.summary,
    overrides: artifacts.dexOutput,
    searchIndex: artifacts.searchIndex.BattleSearchIndex,
    searchIndexOffset: artifacts.searchIndex.BattleSearchIndexOffset,
    searchIndexCount: artifacts.searchIndex.BattleSearchCountIndex,
    generatedFiles: artifacts.files,
  };
}

window.buildOverridesFromGen3Rom = buildOverridesFromGen3Rom;
window.normalizeGen3Slug = normalizeSlug;
window.titleFromGen3Name = titleFromName;
window.__gen3LoaderReady = true;
window.dispatchEvent(new Event("rom-gen3-loader-ready"));
