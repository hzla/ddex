import { buildGen3ExportArtifacts, decodePcs } from "./gen3-export/lib/gen3-exporter.mjs";
import { buildDdexSearchIndex } from "./gen3-export/lib/ddex-search-index.mjs";
import { formatAssignedJs, formatSearchIndexJs } from "./gen3-export/lib/file-formats.mjs";
import { monsById } from "./gen3-export/data/showdown-defaults.mjs";

const SPECIES_ALIASES = {
  "GEODUDE-A": "Geodude-Alola", "GRAVELER-A": "Graveler-Alola", "GOLEM-A": "Golem-Alola",
  "VULPIX-A": "Vulpix-Alola", NINETALESA: "Ninetales-Alola",
  "MR. MIME-G": "Mr. Mime-Galar", "SLOWPOKE-G": "Slowpoke-Galar", "SLOWBRO-G": "Slowbro-Galar",
  "DIGLETT-A": "Diglett-Alola", "DUGTRIO-A": "Dugtrio-Alola",
  "MEOWTH-A": "Meowth-Alola", "PERSIAN-A": "Persian-Alola", "QWILFISH-H": "Qwilfish-Hisui",
  "SNEASEL-H": "Sneasel-Hisui", "RATTATA-A": "Rattata-Alola", "RATICATE-A": "Raticate-Alola",
  "RAICHU-A": "Raichu-Alola", "GRIMER-A": "Grimer-Alola", "MUK-A": "Muk-Alola",
  "S. SHOCKS": "Sandy Shocks", SANDSHREWA: "Sandshrew-Alola", SANDSLASHA: "Sandslash-Alola",
  GROWLITHEH: "Growlithe-Hisui", HARCANINE: "Arcanine-Hisui", "VOLTORB-H": "Voltorb-Hisui",
  ELECTRODEH: "Electrode-Hisui", "CORSOLA-G": "Corsola-Galar", DUDUNSPARC: "Dudunsparce",
  "WEEZING-G": "Weezing-Galar", EXEGGUTORA: "Exeggutor-Alola", "ARTICUNO-G": "Articuno-Galar",
  "ZAPDOS-G": "Zapdos-Galar", "MOLTRES-G": "Moltres-Galar", "MAROWAK-A": "Marowak-Alola",
  "MEOWTH-G": "Meowth-Galar", "PONYTA-G": "Ponyta-Galar", "RAPIDASH-G": "Rapidash-Galar",
  "TAUROS-P": "Tauros-Paldea-Combat", "TAUROS-PA": "Tauros-Paldea-Aqua", "TAUROS-PB": "Tauros-Paldea-Blaze",
  "WOOPER-P": "Wooper-Paldea", "SLOWKING-G": "Slowking-Galar", FARFETCHDG: "Farfetch’d-Galar",
  "PIKACHU-F": "Pikachu-Flying", "PIKACHU-S": "Pikachu-Surfing",
  VENUSAURM: "Venusaur-Mega", CHARIZARDX: "Charizard-Mega-X", BLASTOISEM: "Blastoise-Mega",
  "KANGA-M": "Kangaskhan-Mega", "ALAKAZAM-M": "Alakazam-Mega", "GENGAR-M": "Gengar-Mega",
  "BEEDRILL-M": "Beedrill-Mega", "MEWTWO-Y": "Mewtwo-Mega-Y",
};
const MOVE_ALIASES = {
  "D. Iron Bash": "Double Iron Bash", "D Iron Bash": "Double Iron Bash",
  "Thunder Kick": "Thunderous Kick", "Frozen Glare": "Freezing Glare",
};
export const FIRE_RED_DELUXE_SPRITE_ALIASES = {
  GARTICUNO: "Articuno-Galar", GAPDOS: "Zapdos-Galar", GOLTRES: "Moltres-Galar",
  "ARTICUNO-K": "Articuno", "ZAPDOS-K": "Zapdos", "MOLTRES-K": "Moltres",
  "RAICHU-X": "Raichu", "RAICHU-Y": "Raichu", "CLEFABLE-M": "Clefable",
  DRAGONITEM: "Dragonite", URSAPLUFF: "Ursaring",
  "Pikachu-Flying": "Pikachu", "Pikachu-Surfing": "Pikachu",
};
const toId = value => String(value).toLowerCase().replace(/[^a-z0-9]/g, "");
const speciesAliasIds = Object.fromEntries(Object.entries(SPECIES_ALIASES).map(([raw, name]) => [toId(raw), name]));

export function resolveFireRedDeluxeSpecies(name) {
  const raw = String(name || "").trim();
  const alias = speciesAliasIds[toId(raw)];
  if (alias) return alias;
  const canonical = monsById[toId(raw)];
  return canonical ? canonical.name : raw;
}

function renameTree(value, aliases) {
  if (typeof value === "string") return aliases[value] || value;
  if (Array.isArray(value)) return value.map(item => renameTree(item, aliases));
  if (!value || typeof value !== "object") return value;
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    const nextKey = aliases[key] || key;
    if (Object.hasOwn(output, nextKey)) throw new Error(`Duplicate normalized Fire Red Deluxe name: ${nextKey}`);
    output[nextKey] = renameTree(item, aliases);
  }
  return output;
}

export function buildFireRedDeluxeArtifacts(romBytes, layout, mode = "hard") {
  if (!["hard", "normal"].includes(mode)) throw new Error("Expected hard or normal mode");
  const rom = romBytes instanceof Uint8Array ? romBytes : new Uint8Array(romBytes);
  if (rom.length !== 0x1000000 || String.fromCharCode(...rom.slice(0xAC, 0xB0)) !== "BPRE") {
    throw new Error("Expected a 16 MiB Fire Red Deluxe BPRE ROM");
  }
  const view = new DataView(rom.buffer, rom.byteOffset, rom.byteLength);
  for (const [offset, target] of [[0x144, 0x245EE0], [0x1BC, 0x254784], [0x5524C, 0x732A3C],
    [0x42F6C, 0x740000], [0x82990, 0x7D2A50]]) {
    if (view.getUint32(offset, true) !== 0x08000000 + target) {
      throw new Error(`Fire Red Deluxe layout pointer at 0x${offset.toString(16)} changed; recover the layout before exporting`);
    }
  }
  const tomlText = Object.entries(layout).map(([section, records]) => records.map(record => [
    `[[${section}]]`,
    ...Object.entries(record).map(([key, value]) => `${key} = ${JSON.stringify(value)}`),
  ].join("\n")).join("\n\n")).join("\n\n");
  const slug = mode === "hard" ? "frd" : "frdnormal";
  const title = `Fire Red Deluxe ${mode === "hard" ? "Hard" : "Normal"} Mode`;
  const moveNameOverrides = {};
  for (const [slot, type] of [[251, "Water"], [259, "Fire"]]) {
    const start = 0x247094 + slot * 13;
    if (decodePcs(rom.slice(start, start + 13)) === "WEATHER BALL") moveNameOverrides[slot] = `Weather Ball (${type})`;
  }
  const result = buildGen3ExportArtifacts({ romBytes: rom, tomlText, slug, title, moveNameOverrides });
  const aliases = { ...MOVE_ALIASES };
  for (const name of Object.keys(result.calcOutput.poks)) aliases[name] = resolveFireRedDeluxeSpecies(name);
  result.calcOutput = renameTree(result.calcOutput, aliases);
  result.dexOutput = renameTree(result.dexOutput, aliases);
  delete result.calcOutput.poks["?"];
  delete result.calcOutput.formatted_sets["?"];
  delete result.dexOutput.poks["?"];

  const anchors = Object.fromEntries(layout.NamedAnchors.map(anchor => [anchor.Name, anchor]));
  for (const [name, move] of Object.entries(result.calcOutput.moves)) {
    const effect = rom[anchors["data.pokemon.moves.stats.battle"].Address + move.e_id * 12];
    const multihit = effect === 29 ? [2, 5] : [44, 77].includes(effect) ? 2 : effect === 104 ? 3 : null;
    move.multihit = multihit;
    result.dexOutput.moves[name].multihit = multihit;
  }
  const fixedNames = (anchorName, count, width, resolve) => Array.from({ length: count }, (_, id) => {
    const start = anchors[anchorName].Address + id * width;
    return resolve(decodePcs(rom.slice(start, start + width)));
  });
  const species = fixedNames("data.pokemon.names", 412, 11, resolveFireRedDeluxeSpecies);
  const moves = fixedNames("data.pokemon.moves.names", 355, 13, raw => {
    const id = toId(raw);
    return Object.keys(result.calcOutput.moves).find(name => toId(name) === id) ||
      result.calcOutput.move_replacements[raw] || MOVE_ALIASES[raw] || raw;
  });
  // The shared exporter already canonicalizes Gen 3 spellings and custom move slots.
  for (const [name, data] of Object.entries(result.calcOutput.moves)) moves[data.e_id] = name;
  const items = fixedNames("data.items.stats", 375, 44, raw => {
    return Object.values(result.dexOutput.items).find(item => toId(item.name) === toId(raw))?.name || raw;
  });
  const growthRates = Object.fromEntries(species.map((name, id) => [name, rom[anchors["data.pokemon.stats"].Address + id * 28 + 19]]));
  result.saveConstants = { species, moves, items, growthRates };
  result.calcOutput.poks_replacements = { ...SPECIES_ALIASES };
  result.searchIndex = buildDdexSearchIndex(result.dexOutput);
  result.summary.calc_species = Object.keys(result.calcOutput.poks).length;
  result.summary.dex_species = Object.keys(result.dexOutput.poks).length;
  result.files.calc.text = formatAssignedJs("backup_data", result.calcOutput);
  result.files.dex.text = `var hideEffectIds = true;\n${formatAssignedJs("overrides", result.dexOutput)}`;
  result.files.searchIndex.text = formatSearchIndexJs(result.searchIndex);
  return result;
}
