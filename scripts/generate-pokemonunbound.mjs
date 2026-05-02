#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { createRequire } from "node:module";

import { battleAbilities, battleAliases, battleItems, battleMovedex, battlePokedex } from "../rom/gen3-export/data/ddex-base.mjs";
import { formatAssignedJs, formatSearchIndexJs } from "../rom/gen3-export/lib/file-formats.mjs";
import { buildDdexSearchIndex, toID } from "../rom/gen3-export/lib/ddex-search-index.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(repoRoot, "..");
const require = createRequire(import.meta.url);

const upstream = {
  repo1: "Skeli789/Complete-Fire-Red-Upgrade/master",
  repo2: "Skeli789/Dynamic-Pokemon-Expansion/Unbound",
  vanillaMovesDesc: "ProfLeonDias/pokefirered/decapitalization/src/move_descriptions.c",
  vanillaAbilitiesDesc: "ProfLeonDias/pokefirered/decapitalization/src/data/text/abilities.h",
};

const constantsPath = path.resolve(
  workspaceRoot,
  "Dynamic-Calc-Hgengine/js/savereaders/save_constants/unbound_2_1_constants.js"
);
const unboundPokedexRoot = path.resolve(workspaceRoot, "Unbound-Pokedex");

const saveConstants = require(constantsPath);

const defineLookupTables = {
  species: buildNormalizedDefineLookup(saveConstants.SPECIES_DISPLAY_NAMES_BY_DEFINE || {}),
  moves: buildNormalizedDefineLookup(saveConstants.MOVE_DISPLAY_NAMES_BY_DEFINE || {}),
  items: buildNormalizedDefineLookup(saveConstants.ITEM_DISPLAY_NAMES_BY_DEFINE || {}),
  abilities: buildNormalizedDefineLookup(saveConstants.ABILITY_DISPLAY_NAMES_BY_DEFINE || {}),
};

const TYPE_DISPLAY_NAMES = {
  TYPE_NONE: "",
  TYPE_NORMAL: "Normal",
  TYPE_FIGHTING: "Fighting",
  TYPE_FLYING: "Flying",
  TYPE_POISON: "Poison",
  TYPE_GROUND: "Ground",
  TYPE_ROCK: "Rock",
  TYPE_BUG: "Bug",
  TYPE_GHOST: "Ghost",
  TYPE_STEEL: "Steel",
  TYPE_MYSTERY: "???",
  TYPE_FIRE: "Fire",
  TYPE_WATER: "Water",
  TYPE_GRASS: "Grass",
  TYPE_ELECTRIC: "Electric",
  TYPE_PSYCHIC: "Psychic",
  TYPE_ICE: "Ice",
  TYPE_DRAGON: "Dragon",
  TYPE_DARK: "Dark",
  TYPE_FAIRY: "Fairy",
  TYPE_STELLAR: "Stellar",
};

const LOCAL_RATE_TABLES = {
  land: [20, 20, 10, 10, 10, 10, 5, 5, 4, 4, 1, 1],
  time_day: [20, 20, 10, 10, 10, 10, 5, 5, 4, 4, 1, 1],
  time_night: [20, 20, 10, 10, 10, 10, 5, 5, 4, 4, 1, 1],
  surf: [60, 30, 5, 4, 1],
  rock_smash: [60, 30, 5, 4, 1],
  old_rod: [70, 30],
  good_rod: [60, 20, 20],
  super_rod: [40, 40, 15, 4, 1],
};

const LOCATION_METHOD_MAP = {
  grassAnytime: "land",
  grassDay: "time_day",
  grassNight: "time_night",
  water: "surf",
  rockSmash: "rock_smash",
};

const FISHING_GROUPS = [
  { key: "old_rod", start: 0, end: 1 },
  { key: "good_rod", start: 2, end: 4 },
  { key: "super_rod", start: 5, end: 9 },
];

const MANUAL_MOVE_FILENAME_FIXES = {
  "Solar Beam": "Solarbeam",
  "Will-O-Wisp": "Will-o-Wisp",
  "U-turn": "U-Turn",
  Poweruppunch: "Power-Up Punch",
  Dazzlinggleam: "Dazzling Gleam",
  Drainingkiss: "Draining Kiss",
  "Jealous Burn": "Burning Jealousy",
  "Soft-Boiled": "Softboiled",
  Stompingtantrum: "Stomping Tantrum",
  Mistyterrain: "Misty Terrain",
  Grassyterrain: "Grassy Terrain",
  Psychicterrain: "Psychic Terrain",
  Electricterrain: "Electric Terrain",
  "Break Swipe": "Breaking Swipe",
  HiHorsepower: "High Horsepower",
  ThunderPunch: "Thunder Punch",
  Darkestlariat: "Darkest Lariat",
  PhantomForce: "Phantom Force",
  Mysticalfire: "Mystical Fire",
  Psychicfangs: "Psychic Fangs",
  "Expand Force": "Expanding Force",
  TerrainPulse: "Terrain Pulse",
  "Rising Volt": "Rising Voltage",
  MistyExplode: "Misty Explosion",
  "Corrode Gas": "Corrosive Gas",
  SkitterSmack: "Skitter Smack",
  "Scorch Sands": "Scorching Sands",
  DualWingbeat: "Dual Wingbeat",
};

const CUSTOM_ABILITY_DESCRIPTION_FIXES = {
  ABILITY_NEUTRALIZINGGAS: "All Abilities are nullified.",
  ABILITY_FULLMETALBODY: "Prevents ability reduction.",
  ABILITY_EVAPORATE: "Nullifies all water to up Sp. Atk.",
  ABILITY_GRASS_DASH: "Grass-type moves hit first.",
  ABILITY_SLIPPERY_TAIL: "Tail moves hit first.",
  ABILITY_DRILL_BEAK: "Drill moves land critical hits.",
};

const fetchCache = new Map();

async function main() {
  const parserContext = await loadParserContext();
  const duplicateAbilities = JSON.parse(
    await readFile(path.resolve(unboundPokedexRoot, "src/abilities/duplicate_abilities.json"), "utf8")
  );
  const tutorFlags = JSON.parse(
    await readFile(path.resolve(unboundPokedexRoot, "src/moves/tutor_flags.json"), "utf8")
  );
  const encountersJson = JSON.parse(
    await readFile(path.resolve(unboundPokedexRoot, "src/locations/encounters.json"), "utf8")
  );

  const sourceTexts = await fetchSourceTexts();

  const moves = await buildMoves(parserContext, sourceTexts, tutorFlags);
  const abilities = buildAbilities(parserContext, sourceTexts, duplicateAbilities);
  const species = await buildSpecies(parserContext, sourceTexts, duplicateAbilities, moves);
  const items = buildItems(parserContext, sourceTexts);
  const encs = buildEncounters(encountersJson, species);
  addRaidEncounters(encs, sourceTexts.raidEncountersText, species);

  const overrides = synthesizeOverrides({ species, moves, abilities, items, encs });
  validateOverrides(overrides);
  populateItemWildSources(overrides);

  const overrideText = formatAssignedJs("overrides", overrides);
  const searchIndex = buildDdexSearchIndex(overrides);
  const searchIndexText = formatSearchIndexJs(searchIndex);

  const overridesDir = path.resolve(repoRoot, "data/overrides");
  await writeFile(path.resolve(overridesDir, "pokemonunbound.js"), overrideText, "utf8");
  await writeFile(path.resolve(overridesDir, "pokemonunbound_searchindex.js"), searchIndexText, "utf8");

  process.stdout.write(
    `Wrote ${path.resolve(overridesDir, "pokemonunbound.js")} and ${path.resolve(overridesDir, "pokemonunbound_searchindex.js")}\n`
  );
}

async function loadParserContext() {
  const context = vm.createContext({
    console,
    fetch,
    repo2: upstream.repo2,
    moves: {},
    species: {},
    items: {},
    locations: {},
    trainers: {},
    locationsTracker: [],
    sanitizeString,
  });

  const parserFiles = [
    "src/moves/regexMoves.js",
    "src/abilities/regexAbilities.js",
    "src/species/regexSpecies.js",
    "src/locations/regexLocations.js",
    "src/scripts/regexScripts.js",
  ];
  for (const relativePath of parserFiles) {
    const fullPath = path.resolve(unboundPokedexRoot, relativePath);
    const source = await readFile(fullPath, "utf8");
    vm.runInContext(source, context, { filename: fullPath });
  }

  context.initItem = function initItem(name) {
    context.items[name] = {
      name,
      url: "",
      description: "",
      locations: {},
      pocket: "",
      price: 0,
      ingameName: sanitizeString(name),
      effect: "",
    };
  };

  return context;
}

async function fetchSourceTexts() {
  const [
    speciesText,
    baseStatsText,
    learnsetsText,
    tmTutorTablesText,
    evolutionText,
    formsText,
    movesText,
    movesDescriptionText,
    movesIngameNameText,
    vanillaMovesDescriptionText,
    movesFlagsJson,
    abilitiesText,
    abilitiesIngameNameText,
    abilitiesDescriptionText,
    vanillaAbilitiesDescriptionText,
    itemsText,
    itemDescriptionsText,
    raidEncountersText,
  ] = await Promise.all([
    fetchFirstText("species.h", [
      rawUrl(upstream.repo1, "include/constants/species.h"),
    ]),
    fetchFirstText("Base_Stats.c", [
      rawUrl(upstream.repo2, "src/Base_Stats.c"),
    ]),
    fetchFirstText("Learnsets.c", [
      rawUrl(upstream.repo2, "src/Learnsets.c"),
    ]),
    fetchFirstText("TM_Tutor_Tables.c", [
      rawUrl(upstream.repo2, "src/TM_Tutor_Tables.c"),
    ]),
    fetchFirstText("Evolution Table.c", [
      rawUrl(upstream.repo2, "src/Evolution%20Table.c"),
      rawUrl(upstream.repo2, "src/Evolution Table.c"),
    ]),
    fetchFirstText("form_species_tables.h", [
      rawUrl(upstream.repo2, "src/data/pokemon/form_species_tables.h"),
      rawUrl(upstream.repo1, "src/data/pokemon/form_species_tables.h"),
    ], { optional: true }),
    fetchFirstText("battle_moves.c", [
      rawUrl(upstream.repo1, "src/Tables/battle_moves.c"),
    ]),
    fetchFirstText("attack_descriptions.string", [
      rawUrl(upstream.repo1, "strings/attack_descriptions.string"),
    ]),
    fetchFirstText("attack_name_table.string", [
      rawUrl(upstream.repo1, "strings/attack_name_table.string"),
    ]),
    fetchFirstText("vanilla move descriptions", [
      rawUrl(upstream.vanillaMovesDesc),
    ]),
    fetchFirstJson("move_tables.json", [
      rawUrl(upstream.repo1, "assembly/data/move_tables.json"),
    ]),
    fetchFirstText("abilities.h", [
      rawUrl(upstream.repo1, "include/constants/abilities.h"),
    ]),
    fetchFirstText("ability_name_table.string", [
      rawUrl(upstream.repo1, "strings/ability_name_table.string"),
    ]),
    fetchFirstText("ability_descriptions.string", [
      rawUrl(upstream.repo1, "strings/ability_descriptions.string"),
    ]),
    fetchFirstText("vanilla ability descriptions", [
      rawUrl(upstream.vanillaAbilitiesDesc),
    ]),
    fetchFirstText("items.h", [
      rawUrl(upstream.repo2, "src/data/items.h"),
      rawUrl(upstream.repo1, "src/data/items.h"),
    ], { optional: true }),
    fetchFirstText("item_descriptions.h", [
      rawUrl(upstream.repo2, "src/data/text/item_descriptions.h"),
      rawUrl(upstream.repo1, "src/data/text/item_descriptions.h"),
    ], { optional: true }),
    fetchFirstText("raid_encounters.h", [
      rawUrl(upstream.repo1, "src/Tables/raid_encounters.h"),
      rawUrl(upstream.repo2, "src/Tables/raid_encounters.h"),
    ], { optional: true }),
  ]);

  return {
    speciesText,
    baseStatsText,
    learnsetsText,
    tmTutorTablesText,
    evolutionText,
    formsText,
    movesText,
    movesDescriptionText,
    movesIngameNameText,
    vanillaMovesDescriptionText,
    movesFlagsJson,
    abilitiesText,
    abilitiesIngameNameText,
    abilitiesDescriptionText,
    vanillaAbilitiesDescriptionText,
    itemsText,
    itemDescriptionsText,
    raidEncountersText,
  };
}

async function buildMoves(context, sourceTexts, tutorFlags) {
  const moves = {};
  context.moves = moves;
  context.regexMoves(sourceTexts.movesText, moves);
  context.regexVanillaMovesDescription(sourceTexts.vanillaMovesDescriptionText, moves);
  context.regexMovesDescription(sourceTexts.movesDescriptionText, moves);
  context.regexMovesIngameName(sourceTexts.movesIngameNameText, moves);
  context.regexMovesFlags(sourceTexts.movesFlagsJson, tutorFlags, moves);
  return moves;
}

function buildAbilities(context, sourceTexts, duplicateAbilities) {
  const abilities = {};
  context.regexAbilities(sourceTexts.abilitiesText, abilities);
  context.regexVanillaAbilitiesDescription(sourceTexts.vanillaAbilitiesDescriptionText, abilities);
  context.regexAbilitiesIngameName(sourceTexts.abilitiesIngameNameText, abilities);
  context.regexAbilitiesDescription(sourceTexts.abilitiesDescriptionText, abilities);
  context.regexNewAbilities(duplicateAbilities, abilities);
  for (const [key, value] of Object.entries(CUSTOM_ABILITY_DESCRIPTION_FIXES)) {
    if (abilities[key]) abilities[key].description = value;
  }
  return abilities;
}

async function buildSpecies(context, sourceTexts, duplicateAbilities, moves) {
  const species = {};
  context.regexSpecies(sourceTexts.speciesText, species);
  for (const data of Object.values(species)) initializeSpeciesRecord(data);
  context.regexBaseStats(sourceTexts.baseStatsText, species);
  context.regexLevelUpLearnsets(
    sourceTexts.learnsetsText,
    context.getLevelUpLearnsetsConversionTable(sourceTexts.learnsetsText),
    species
  );
  context.moves = moves;
  await context.regexTMHMLearnsets(sourceTexts.tmTutorTablesText, species, "gTMHMMoves", "gMoveTutorMoves");
  await context.regexTutorLearnsets(sourceTexts.tmTutorTablesText, species, "gMoveTutorMoves", "gTMHMMoves");
  context.regexEvolution(sourceTexts.evolutionText, species);
  if (sourceTexts.formsText) {
    context.regexForms(sourceTexts.formsText, species);
  }
  context.regexReplaceAbilities(duplicateAbilities, species);

  for (const [defineName, stats] of Object.entries(saveConstants.BASE_STATS_BY_SPECIES || {})) {
    if (!species[defineName]) continue;
    if (!species[defineName].baseHP && typeof stats.baseHP === "number") {
      species[defineName].baseHP = stats.baseHP;
      species[defineName].baseAttack = stats.baseAttack;
      species[defineName].baseDefense = stats.baseDefense;
      species[defineName].baseSpAttack = stats.baseSpAttack;
      species[defineName].baseSpDefense = stats.baseSpDefense;
      species[defineName].baseSpeed = stats.baseSpeed;
      species[defineName].abilities = [stats.ability1, stats.ability2, stats.hiddenAbility];
      species[defineName].type1 = stats.type1;
      species[defineName].type2 = stats.type2;
    }
  }

  return species;
}

function buildItems(context, sourceTexts) {
  if (!sourceTexts.itemsText) {
    return buildFallbackItems();
  }
  const items = {};
  context.items = items;
  const conversionTable = context.regexItems(sourceTexts.itemsText);
  if (sourceTexts.itemDescriptionsText) {
    context.regexItemDescriptions(sourceTexts.itemDescriptionsText, conversionTable);
  } else {
    fillInlineItemDescriptions(sourceTexts.itemsText, items);
  }
  return items;
}

function buildFallbackItems() {
  const items = {};
  for (const defineName of Object.values(saveConstants.ITEMS_BY_ID || {})) {
    if (!defineName || defineName === "ITEM_NONE") continue;
    const displayName = canonicalItemNameFromDefine(defineName);
    if (!displayName) continue;
    const baseItem = battleItems[toID(displayName)];
    if (!baseItem?.desc) continue;
    items[defineName] = {
      name: defineName,
      ingameName: displayName,
      description: baseItem.desc,
      locations: {},
      pocket: "",
      price: 0,
      effect: "",
      url: "",
    };
  }
  return items;
}

function synthesizeOverrides({ species, moves, abilities, items, encs }) {
  const overrides = {
    poks: {},
    moves: {},
    abilities: {},
    items: {},
    encs,
  };

  for (const [defineName, raw] of Object.entries(species)) {
    const displayName = canonicalSpeciesNameFromDefine(defineName);
    if (!displayName) continue;
    const learnset = raw.levelUpLearnsets
      .map(([moveDefine, level]) => [Number(level), canonicalMoveNameFromDefine(moveDefine)])
      .filter((entry) => entry[1]);
    const tms = dedupeDefined(raw.TMHMLearnsets.map(canonicalMoveNameFromDefine));
    const tutors = dedupeDefined(raw.tutorLearnsets.map(canonicalMoveNameFromDefine));

    const override = {
      name: displayName,
      num: speciesNumberForDefine(defineName, raw),
      types: dedupeDefined([
        typeNameFromDefine(raw.type1),
        raw.type2 && raw.type2 !== raw.type1 ? typeNameFromDefine(raw.type2) : null,
      ]),
      abs: buildAbilitySlots(raw.abilities || []),
      items: buildHeldItemSlots(raw),
      bs: {
        hp: Number(raw.baseHP || 0),
        at: Number(raw.baseAttack || 0),
        df: Number(raw.baseDefense || 0),
        sa: Number(raw.baseSpAttack || 0),
        sd: Number(raw.baseSpDefense || 0),
        sp: Number(raw.baseSpeed || 0),
      },
      learnset_info: {
        learnset,
        tms,
        tutors,
      },
    };

    addEvolutionData(override, raw.evolution || []);
    overrides.poks[displayName] = override;
  }

  for (const [defineName, raw] of Object.entries(moves)) {
    const displayName = canonicalMoveNameFromDefine(defineName);
    if (!displayName) continue;
    const moveId = toID(displayName);
    const baseMove = battleMovedex[moveId];
    const desc = Array.isArray(raw.description) ? raw.description.join(" ").trim() : String(raw.description || "").trim();
    const override = {
      name: displayName,
      t: typeNameFromDefine(raw.type),
      bp: Number(raw.power || 0),
      cat: categoryNameFromSplit(raw.split),
      pp: Number(raw.PP || 0),
      acc: Number(raw.accuracy || 0),
      prio: Number(raw.priority || 0),
      desc,
    };
    if (baseMove?.desc && baseMove.desc !== desc) override.oldDesc = baseMove.desc;
    if (baseMove?.shortDesc && !override.oldDesc && baseMove.shortDesc !== desc) override.oldDesc = baseMove.shortDesc;
    overrides.moves[displayName] = override;
  }

  for (const [defineName, raw] of Object.entries(abilities)) {
    const displayName = canonicalAbilityNameFromDefine(defineName);
    if (!displayName || !raw.description) continue;
    const abilityId = toID(displayName);
    const baseAbility = battleAbilities[abilityId];
    const override = {
      name: displayName,
      desc: String(raw.description).trim(),
    };
    if (baseAbility?.desc && baseAbility.desc !== override.desc) override.oldDesc = baseAbility.desc;
    overrides.abilities[abilityId] = override;
  }

  for (const [defineName, raw] of Object.entries(items)) {
    const displayName = canonicalItemNameFromDefine(defineName);
    if (!displayName || !raw.description) continue;
    const itemId = toID(displayName);
    const baseItem = battleItems[itemId];
    const override = {
      name: displayName,
      desc: String(raw.description).trim(),
      location: "",
    };
    if (baseItem?.desc && baseItem.desc !== override.desc) override.oldDesc = baseItem.desc;
    overrides.items[itemId] = override;
  }

  return overrides;
}

function populateItemWildSources(overrides) {
  const itemToSpecies = new Map();
  for (const [speciesName, payload] of Object.entries(overrides.poks)) {
    for (const itemName of payload.items || []) {
      if (!itemName) continue;
      const itemId = toID(itemName);
      if (!overrides.items[itemId]) continue;
      if (!itemToSpecies.has(itemId)) itemToSpecies.set(itemId, new Set());
      itemToSpecies.get(itemId).add(speciesName);
    }
  }
  for (const [itemId, speciesSet] of itemToSpecies.entries()) {
    overrides.items[itemId].wilds = [...speciesSet].sort((left, right) => left.localeCompare(right));
  }
}

function validateOverrides(overrides) {
  const problems = [];

  for (const [speciesName, payload] of Object.entries(overrides.poks)) {
    if (!payload.types?.length) problems.push(`Species missing types: ${speciesName}`);
    if (!payload.learnset_info) problems.push(`Species missing learnset_info: ${speciesName}`);
    for (const [, moveName] of payload.learnset_info?.learnset || []) {
      if (!moveName || (!overrides.moves[moveName] && !battleMovedex[toID(moveName)])) {
        problems.push(`Unknown learnset move ${moveName} on ${speciesName}`);
      }
    }
  }

  for (const [locationId, location] of Object.entries(overrides.encs)) {
    if (locationId === "rates") continue;
    for (const [methodKey, methodPayload] of Object.entries(location)) {
      if (methodKey === "name" || !methodPayload?.encs) continue;
      for (const encounter of methodPayload.encs) {
        const speciesId = toID(encounter.s || "");
        if (!speciesId || (!overrides.poks[encounter.s] && !battlePokedex[speciesId])) {
          problems.push(`Unknown encounter species ${encounter.s} in ${locationId}/${methodKey}`);
        }
      }
    }
  }

  if (problems.length) {
    throw new Error(`Validation failed:\n${problems.slice(0, 50).join("\n")}${problems.length > 50 ? "\n..." : ""}`);
  }
}

function buildEncounters(encountersJson, species) {
  const encs = { rates: { ...LOCAL_RATE_TABLES } };
  const usedIds = new Set(["rates"]);

  for (const map of encountersJson) {
    if (!map?.mapName || !map.encounters) continue;
    const displayName = prettifyMapName(map.mapName);
    if (!displayName || displayName === "Unknown") continue;
    const locationId = uniqueLocationId(displayName, map.mapName, usedIds);
    const location = { name: displayName };

    for (const [methodKey, payload] of Object.entries(map.encounters)) {
      if (!payload?.slots?.length) continue;
      if (methodKey === "fishing") {
        for (const group of FISHING_GROUPS) {
          const sliced = payload.slots.slice(group.start, group.end + 1);
          if (!sliced.length) continue;
          location[group.key] = {
            encs: sliced
              .map((slot) => buildEncounterSlot(slot, species))
              .filter(Boolean),
          };
        }
        continue;
      }

      const ddexMethod = LOCATION_METHOD_MAP[methodKey];
      if (!ddexMethod) continue;
      location[ddexMethod] = {
        encs: payload.slots
          .map((slot) => buildEncounterSlot(slot, species))
          .filter(Boolean),
      };
    }

    encs[locationId] = location;
  }

  return encs;
}

function addRaidEncounters(encs, raidText, species) {
  if (!raidText) return;
  const lines = raidText.split("\n");
  let currentLocationId = null;
  let currentMethodKey = null;
  let currentMethodName = null;
  let currentSpecies = [];
  let currentMinLevel = null;
  let currentMaxLevel = null;

  function flushCurrent() {
    if (!currentLocationId || !currentMethodKey || !currentSpecies.length) return;
    const location = encs[currentLocationId] || null;
    if (!location) return;
    const counts = new Map();
    for (const name of currentSpecies) {
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    const slots = [...counts.entries()].map(([name]) => {
      const slot = { s: name };
      if (currentMinLevel != null) {
        slot.mn = currentMinLevel;
        if (currentMaxLevel != null && currentMaxLevel !== currentMinLevel) {
          slot.mx = currentMaxLevel;
        }
      }
      return slot;
    });
    const total = currentSpecies.length;
    location[currentMethodKey] = {
      name: currentMethodName,
      rates: [...counts.values()].map((count) => Math.round((count / total) * 100)),
      encs: slots,
    };
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const raidMatch = line.match(/Raid\s*s(\w+)Raids(\d+Star)/i);
    if (raidMatch) {
      flushCurrent();
      const locationName = prettifyCamelWithDigits(raidMatch[1]);
      const locationId = findLocationIdByName(encs, locationName);
      currentLocationId = locationId;
      const starLabel = prettifyCamelWithDigits(raidMatch[2]);
      currentMethodName = `Raid ${starLabel}`;
      currentMethodKey = `raid_${toID(starLabel)}`;
      currentSpecies = [];
      currentMinLevel = null;
      currentMaxLevel = null;
      continue;
    }

    const speciesMatch = line.match(/SPECIES_\w+/);
    if (speciesMatch && currentLocationId && currentMethodKey) {
      const speciesName = canonicalSpeciesNameFromDefine(speciesMatch[0]);
      if (speciesName) currentSpecies.push(speciesName);
    }

    const minLevelMatch = line.match(/(?:minLevel|level)\s*=\s*(\d+)/i);
    if (minLevelMatch) {
      currentMinLevel = Number(minLevelMatch[1]);
    }
    const maxLevelMatch = line.match(/maxLevel\s*=\s*(\d+)/i);
    if (maxLevelMatch) {
      currentMaxLevel = Number(maxLevelMatch[1]);
    }

    if (/};/.test(line)) {
      flushCurrent();
      currentLocationId = null;
      currentMethodKey = null;
      currentMethodName = null;
      currentSpecies = [];
      currentMinLevel = null;
      currentMaxLevel = null;
    }
  }
}

function buildEncounterSlot(slot) {
  const speciesName = canonicalSpeciesNameFromDefine(slot.species);
  if (!speciesName) return null;
  const result = {
    s: speciesName,
    mn: Number(slot.minLevel),
  };
  if (Number(slot.maxLevel) !== Number(slot.minLevel)) {
    result.mx = Number(slot.maxLevel);
  }
  return result;
}

function addEvolutionData(target, evolutionArray) {
  const evos = [];
  const evoMethods = [];
  const evoParams = [];

  for (const [rawMethod, rawCondition, targetDefine] of evolutionArray) {
    const targetName = canonicalSpeciesNameFromDefine(targetDefine);
    if (!targetName) continue;
    const mapped = mapEvolution(rawMethod, rawCondition);
    evos.push(targetName);
    evoMethods.push(mapped.method);
    evoParams.push(mapped.param);
  }

  if (evos.length) {
    target.evos = evos;
    target.evoMethods = evoMethods;
    target.evoParams = evoParams;
  }
}

function mapEvolution(rawMethod, rawCondition) {
  const method = String(rawMethod || "");
  const condition = String(rawCondition || "");
  const numericCondition = Number(condition);

  if (method === "EVO_LEVEL" && Number.isFinite(numericCondition)) {
    return { method: "level", param: numericCondition };
  }
  if (method === "EVO_MOVE") {
    return { method: "levelMove", param: canonicalMoveNameFromDefine(condition) || prettifyDefine(condition) };
  }
  if (method === "EVO_ITEM") {
    return { method: "useItem", param: canonicalItemNameFromDefine(condition) || prettifyDefine(condition) };
  }
  if (method === "EVO_TRADE") {
    return { method: "trade", param: "" };
  }
  if (method === "EVO_TRADE_ITEM") {
    return { method: "trade", param: canonicalItemNameFromDefine(condition) || prettifyDefine(condition) };
  }
  if (method === "EVO_FRIENDSHIP") {
    return { method: "levelFriendship", param: "" };
  }
  if (method === "EVO_FRIENDSHIP_DAY") {
    return { method: "levelExtra", param: "Max Happiness (Day)" };
  }
  if (method === "EVO_FRIENDSHIP_NIGHT") {
    return { method: "levelExtra", param: "Max Happiness (Night)" };
  }
  if (method.startsWith("EVO_LEVEL_")) {
    const conditionText = Number.isFinite(numericCondition) ? `Level ${numericCondition}` : "Level Up";
    return { method: "levelExtra", param: `${conditionText} (${prettifyDefine(method.replace(/^EVO_/, ""))})` };
  }

  const resolvedCondition =
    canonicalItemNameFromDefine(condition) ||
    canonicalMoveNameFromDefine(condition) ||
    prettifyDefine(condition) ||
    (Number.isFinite(numericCondition) ? numericCondition : "");
  return {
    method: "levelExtra",
    param: [prettifyDefine(method.replace(/^EVO_/, "")), resolvedCondition].filter(Boolean).join(": "),
  };
}

function buildAbilitySlots(rawAbilities) {
  const slots = [];
  for (let index = 0; index < 3; index += 1) {
    slots.push(canonicalAbilityNameFromDefine(rawAbilities[index]) || "");
  }
  return slots;
}

function buildHeldItemSlots(raw) {
  return [
    canonicalItemNameFromDefine(raw.item1) || null,
    canonicalItemNameFromDefine(raw.item2) || null,
    null,
  ];
}

function speciesNumberForDefine(defineName, raw) {
  const displayName = canonicalSpeciesNameFromDefine(defineName);
  const baseId = displayName ? toID(displayName) : "";
  if (baseId && battlePokedex[baseId]?.num != null) return battlePokedex[baseId].num;
  const match = Object.entries(saveConstants.SPECIES_BY_ID || {}).find(([, value]) => value === defineName);
  if (match) return Number(match[0]);
  return raw.ID ?? null;
}

function canonicalSpeciesNameFromDefine(defineName) {
  if (!defineName || defineName === "SPECIES_NONE") return null;
  const rawName = displayNameFromDefine("species", defineName);
  return canonicalNameFromCollection(rawName, battlePokedex);
}

function canonicalMoveNameFromDefine(defineName) {
  if (!defineName || defineName === "MOVE_NONE") return null;
  const rawName = displayNameFromDefine("moves", defineName);
  return canonicalNameFromCollection(rawName, battleMovedex);
}

function canonicalItemNameFromDefine(defineName) {
  if (!defineName || defineName === "ITEM_NONE") return null;
  const rawName = displayNameFromDefine("items", defineName);
  return canonicalNameFromCollection(rawName, battleItems);
}

function canonicalAbilityNameFromDefine(defineName) {
  if (!defineName || defineName === "ABILITY_NONE") return null;
  const rawName = displayNameFromDefine("abilities", defineName);
  return canonicalNameFromCollection(rawName, battleAbilities);
}

function canonicalNameFromCollection(rawName, collection) {
  if (!rawName) return null;
  const directId = toID(rawName);
  if (collection[directId]?.name) return collection[directId].name;
  if (battleAliases[directId]) {
    const aliasTarget = battleAliases[directId];
    const aliasId = toID(aliasTarget);
    if (collection[aliasId]?.name) return collection[aliasId].name;
    return aliasTarget;
  }
  return rawName;
}

function typeNameFromDefine(typeDefine) {
  return TYPE_DISPLAY_NAMES[typeDefine] || prettifyDefine(typeDefine);
}

function categoryNameFromSplit(split) {
  return {
    SPLIT_PHYSICAL: "Physical",
    SPLIT_SPECIAL: "Special",
    SPLIT_STATUS: "Status",
  }[split] || "Status";
}

function displayNameFromDefine(kind, defineName) {
  const normalized = normalizeDefine(defineName);
  const table = defineLookupTables[kind];
  if (table[normalized]) return table[normalized];
  return prettifyDefine(defineName);
}

function buildNormalizedDefineLookup(table) {
  const lookup = {};
  for (const [key, value] of Object.entries(table)) {
    lookup[normalizeDefine(key)] = value;
  }
  return lookup;
}

function normalizeDefine(text) {
  return String(text || "").toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

function prettifyDefine(defineName) {
  const base = String(defineName || "")
    .replace(/^(SPECIES|MOVE|ITEM|ABILITY|TYPE)_/, "")
    .replace(/_/g, " ")
    .trim();
  if (!base) return "";
  return prettifyWords(base);
}

function prettifyMapName(mapName) {
  return prettifyWords(String(mapName || "").replace(/_/g, " "));
}

function prettifyCamelWithDigits(text) {
  return prettifyWords(
    String(text || "")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/(\d+)([A-Z])/g, "$1 $2")
      .replace(/([A-Z])(\d+)/g, "$1 $2")
  );
}

function prettifyWords(text) {
  return String(text || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      const upperToken = token.toUpperCase();
      if (/^[A-Z]$/.test(upperToken)) return upperToken;
      if (/^[0-9]+[A-Z]*$/.test(upperToken) || /^[A-Z]*[0-9]+[A-Z]*$/.test(upperToken)) return upperToken;
      return upperToken.charAt(0) + upperToken.slice(1).toLowerCase();
    })
    .join(" ");
}

function sanitizeString(input) {
  return prettifyDefine(String(input || ""));
}

function uniqueLocationId(displayName, rawMapName, usedIds) {
  let candidate = toID(displayName);
  if (!candidate) candidate = toID(rawMapName);
  if (!usedIds.has(candidate)) {
    usedIds.add(candidate);
    return candidate;
  }
  const rawCandidate = toID(rawMapName);
  if (rawCandidate && !usedIds.has(rawCandidate)) {
    usedIds.add(rawCandidate);
    return rawCandidate;
  }
  let suffix = 2;
  while (usedIds.has(`${candidate}${suffix}`)) suffix += 1;
  const unique = `${candidate}${suffix}`;
  usedIds.add(unique);
  return unique;
}

function findLocationIdByName(encs, displayName) {
  const wanted = toID(displayName);
  for (const [locationId, payload] of Object.entries(encs)) {
    if (locationId === "rates") continue;
    if (toID(payload.name) === wanted) return locationId;
  }
  return null;
}

function dedupeDefined(values) {
  return [...new Set(values.filter(Boolean))];
}

function initializeSpeciesRecord(record) {
  record.abilities = [];
  record.changes = [];
  record.evolution = [];
  record.evolutionLine = [];
  record.forms = [];
  record.levelUpLearnsets = [];
  record.TMHMLearnsets = [];
  record.tutorLearnsets = [];
  record.eggMovesLearnsets = [];
}

function fillInlineItemDescriptions(itemsText, items) {
  const sharedDescriptions = parseSharedItemDescriptions(itemsText);
  const lines = itemsText.split("\n");
  let currentItem = null;
  let collectingInline = false;
  let inlineParts = [];

  function flushInline() {
    if (currentItem && collectingInline && items[currentItem]) {
      items[currentItem].description = normalizeCDescription(inlineParts.join(" "));
    }
    collectingInline = false;
    inlineParts = [];
  }

  for (const line of lines) {
    const itemMatch = line.match(/\[\s*(ITEM_\w+)\s*\]/);
    if (itemMatch) {
      flushInline();
      currentItem = itemMatch[1];
      continue;
    }
    if (!currentItem || !items[currentItem]) continue;

    const sharedMatch = line.match(/\.description\s*=\s*(s\w+Desc)\s*,/);
    if (sharedMatch) {
      items[currentItem].description = sharedDescriptions[sharedMatch[1]] || "";
      continue;
    }

    if (/\.description\s*=\s*COMPOUND_STRING\(/.test(line)) {
      collectingInline = true;
      inlineParts = [];
      continue;
    }

    const directStringMatch = line.match(/\.description\s*=\s*_\("([^"]*)"\)\s*,/);
    if (directStringMatch) {
      items[currentItem].description = normalizeCDescription(directStringMatch[1]);
      continue;
    }

    if (collectingInline) {
      const strings = [...line.matchAll(/"([^"]*)"/g)].map((match) => match[1]);
      if (strings.length) inlineParts.push(...strings);
      if (/\)\s*,?\s*$/.test(line)) {
        flushInline();
      }
    }
  }

  flushInline();
}

function parseSharedItemDescriptions(itemsText) {
  const lines = itemsText.split("\n");
  const descriptions = {};
  let currentKey = null;
  let parts = [];

  function flush() {
    if (currentKey) descriptions[currentKey] = normalizeCDescription(parts.join(" "));
    currentKey = null;
    parts = [];
  }

  for (const line of lines) {
    const startMatch = line.match(/static const u8 (s\w+Desc)\[\]\s*=\s*_\(/);
    if (startMatch) {
      flush();
      currentKey = startMatch[1];
      const strings = [...line.matchAll(/"([^"]*)"/g)].map((match) => match[1]);
      if (strings.length) parts.push(...strings);
      continue;
    }
    if (!currentKey) continue;
    const strings = [...line.matchAll(/"([^"]*)"/g)].map((match) => match[1]);
    if (strings.length) parts.push(...strings);
    if (/\)\s*;\s*$/.test(line)) {
      flush();
    }
  }

  flush();
  return descriptions;
}

function normalizeCDescription(text) {
  return String(text || "")
    .replaceAll("\\n", " ")
    .replaceAll("\n", " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rawUrl(repoWithPath, filePath = "") {
  if (filePath) return `https://raw.githubusercontent.com/${repoWithPath}/${filePath}`;
  return `https://raw.githubusercontent.com/${repoWithPath}`;
}

async function fetchFirstText(label, urls, options = {}) {
  for (const url of urls) {
    const value = await fetchCached(url, "text");
    if (value != null) return value;
  }
  if (options.optional) return "";
  throw new Error(`Unable to fetch ${label} from any known URL.`);
}

async function fetchFirstJson(label, urls) {
  for (const url of urls) {
    const value = await fetchCached(url, "json");
    if (value != null) return value;
  }
  throw new Error(`Unable to fetch ${label} from any known URL.`);
}

async function fetchCached(url, mode) {
  const cacheKey = `${mode}:${url}`;
  if (fetchCache.has(cacheKey)) return fetchCache.get(cacheKey);
  try {
    const response = await fetch(url);
    if (!response.ok) {
      fetchCache.set(cacheKey, null);
      return null;
    }
    const value = mode === "json" ? await response.json() : await response.text();
    fetchCache.set(cacheKey, value);
    return value;
  } catch {
    fetchCache.set(cacheKey, null);
    return null;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
