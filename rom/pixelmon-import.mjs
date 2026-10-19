import { battlePokedex, battleMovedex, battleAbilities, battleItems } from "./gen3-export/data/ddex-base.mjs";
import { buildDdexSearchIndex, toID } from "./gen3-export/lib/ddex-search-index.mjs";
import { normalizePixelmonCalcSetNames } from "./pixelmon-set-names.mjs";

const STAT_KEYS = { hp: "hp", attack: "at", defense: "df", specialAttack: "sa", specialDefense: "sd", speed: "sp" };
const FORM_NAMES = {
  alolan: "Alola", galarian: "Galar", hisuian: "Hisui", paldean: "Paldea",
  megax: "Mega-X", megay: "Mega-Y", fullbelly: "Full-Belly", hangry: "Hangry",
  noice_face: "Noice", ice_face: "Ice", singlestrike: "Single-Strike", rapidstrike: "Rapid-Strike",
  paldean_blaze: "Paldea-Blaze", paldean_aqua: "Paldea-Aqua", paldean_combat: "Paldea-Combat",
  icerider: "Ice", shadowrider: "Shadow", crowned: "Crowned", complete: "Complete", dusk: "Dusk", dawn: "Dawn",
};
const SPECIES_NAMES = { nidoranfemale: "Nidoran-F", nidoranmale: "Nidoran-M" };
const title = (value) => String(value || "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").replace(/\b\w+\b/g, (part) => part[0].toUpperCase() + part.slice(1).toLowerCase());
const unique = (values) => [...new Set(values)];
const object = () => Object.create(null);

// Accept a ZIP of data/pixelmon, pixelmon, or the contents of pixelmon.
export function pixelmonArchivePath(name) {
  const parts = String(name).replace(/\\/g, "/").split("/");
  if (parts.some((part) => part === ".." || part === "__MACOSX" || part.startsWith(".")) || /^[/\\]/.test(name)) return null;
  if (!/\.json$/i.test(name)) return null;
  let start = parts.findIndex((part, index) => part === "data" && parts[index + 1] === "pixelmon");
  if (start >= 0) start += 2;
  else if (parts[0] === "pixelmon" && parts[1] !== "npc") start = 1;
  else start = 0;
  const relative = parts.slice(start).join("/");
  if (!/^(?:species\/|moves\/|abilities\/|spawning\/|pixelmon\/npc\/preset\/)/.test(relative)) return null;
  return { root: parts.slice(0, start).join("/"), relative };
}

function named(value, collection) {
  const text = String(value || "").replace(/^\w+:/, "");
  return collection[toID(text.replace(/armour/gi, "armor"))]?.name || title(text);
}

function readSpec(raw) {
  const values = object();
  const text = String(raw || "").trim();
  const matches = [...text.matchAll(/(?:^|\s)([a-zA-Z][\w]*):/g)];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    values[match[1].toLowerCase()] = text.slice(match.index + match[0].length, matches[i + 1]?.index ?? text.length).trim();
  }
  values.species ||= text.slice(0, matches[0]?.index ?? text.length).trim();
  return values;
}

function effectFields(move) {
  const fields = { priority: 0, recoil: null, drain: null, heal: null, multihit: null, willCrit: false, critRatio: 1, secondaries: false };
  const descriptions = [];
  for (const effect of move.effects || []) {
    const kind = effect.effectTypeID || effect.type;
    const chance = effect.modifiers?.find((mod) => mod.type === "Chance")?.value;
    if (kind === "Priority") fields.priority = Number(effect.priority) || 0;
    if (kind === "AlwaysHit") fields.accuracy = true;
    if (kind === "Recoil") fields.recoil = [Number(effect.percentRecoil), 100];
    if (kind === "Drain") fields.drain = [Number(effect.drainPercent), 100];
    if (kind === "Recover" && Number.isFinite(effect.increment ?? effect.healPercent)) fields.heal = [effect.increment ?? effect.healPercent, 100];
    if (kind === "MultipleHit") fields.multihit = effect.minHits === effect.maxHits ? effect.minHits : [effect.minHits, effect.maxHits];
    if (kind === "CriticalHit") {
      fields.critRatio = 1 + (Number(effect.stages) || 0);
      fields.willCrit = effect.stages >= 3;
    }
    if (chance > 0) fields.secondaries = true;
    if (kind) descriptions.push(`${title(kind)}${chance != null ? ` (${chance}% chance)` : ""}`);
  }
  return { fields, description: descriptions.join("; ") };
}

function conditionText(condition) {
  return Object.entries(condition).filter(([key, value]) => key !== "evoConditionType" && !(Array.isArray(value) && !value.length))
    .map(([key, value]) => `${title(key)}: ${Array.isArray(value) ? value.join(", ") : typeof value === "object" ? JSON.stringify(value) : value}`).join(", ");
}

export function buildPixelmonImport(entries, options = {}) {
  const records = [];
  const paths = new Set();
  const roots = new Set();
  for (const entry of entries) {
    const location = pixelmonArchivePath(entry.name);
    if (!location) continue;
    roots.add(location.root);
    if (paths.has(location.relative)) throw new Error(`Duplicate Pixelmon file: ${location.relative}`);
    paths.add(location.relative);
    let data;
    try { data = JSON.parse(entry.text); }
    catch { throw new Error(`Invalid JSON in ${entry.name}.`); }
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error(`Expected a JSON object in ${entry.name}.`);
    records.push({ path: location.relative, data });
  }
  if (roots.size > 1) throw new Error("The ZIP contains multiple Pixelmon folders. Upload one data/pixelmon folder.");
  const speciesFiles = records.filter((entry) => entry.path.startsWith("species/"));
  const moveFiles = records.filter((entry) => entry.path.startsWith("moves/"));
  if (!speciesFiles.length || !moveFiles.length) throw new Error("The ZIP must contain Pixelmon species/ and moves/ JSON folders.");

  const overrides = { poks: object(), moves: object(), abilities: object(), items: object(), encs: { rates: {} } };
  const backupData = { title: options.title || "Pixelmon", poks: object(), moves: object(), formatted_sets: object() };
  const formLookup = new Map();
  const formRecords = [];
  const warnings = new Set();
  const addItem = (raw) => {
    if (!raw || toID(raw) === "none") return "";
    const name = named(raw, battleItems);
    overrides.items[toID(name)] ||= { name, desc: battleItems[toID(name)]?.desc || "Pixelmon item; custom behavior is defined by the mod." };
    return name;
  };
  const addAbility = (raw) => {
    if (!raw) return "";
    const name = named(raw, battleAbilities);
    overrides.abilities[toID(name)] ||= { name, desc: battleAbilities[toID(name)]?.desc || "Pixelmon ability; custom behavior is defined by the mod." };
    if (!battleAbilities[toID(name)]) warnings.add(`Custom ability: ${name}`);
    return name;
  };

  // Resolve names before converting evolutions, spawning specs, or trainer specs.
  for (const { path, data } of speciesFiles) {
    if (!data.name || !Array.isArray(data.forms) || !data.forms.length) throw new Error(`Missing species name/forms in ${path}.`);
    const baseName = SPECIES_NAMES[toID(data.name)] || battlePokedex[toID(data.name)]?.name || data.name;
    const defaultForm = data.forms.find((form) => form.name === "base") || data.forms.find((form) => form.battleStats && form.types) || data.forms[0];
    const formsByName = new Map(data.forms.map((form) => [form.name, form]));
    const mergedForm = (form, seen = new Set()) => {
      if (seen.has(form.name)) throw new Error(`Circular form inheritance in ${path}.`);
      seen.add(form.name);
      const parent = formsByName.get(form.defaultBaseForm);
      if (form === defaultForm) return form;
      const inherited = mergedForm(parent && parent !== form ? parent : defaultForm, seen);
      return { ...inherited, ...form, battleStats: { ...inherited.battleStats, ...form.battleStats } };
    };
    for (const form of data.forms) {
      const suffix = FORM_NAMES[form.name] || title(form.name).replace(/ /g, "-");
      const candidate = form === defaultForm ? baseName : `${baseName}-${suffix}`;
      const name = battlePokedex[toID(candidate)]?.name || candidate;
      const key = `${toID(data.name)}:${toID(form.name)}`;
      formLookup.set(key, name);
      formRecords.push({ name, baseName, data, form: mergedForm(form), isDefault: form === defaultForm });
    }
    formLookup.set(`${toID(data.name)}:`, baseName);
    formLookup.set(`${toID(baseName)}:`, baseName);
  }
  const resolveSpec = (raw) => {
    const spec = readSpec(raw);
    const species = SPECIES_NAMES[toID(spec.species)] || spec.species;
    const name = formLookup.get(`${toID(spec.species)}:${toID(spec.form || "")}`)
      || formLookup.get(`${toID(species)}:${toID(spec.form || "")}`)
      || battlePokedex[toID(species)]?.name || species;
    if (!overrides.poks[name] && !formRecords.some((record) => record.name === name)) warnings.add(`Unresolved Pokémon spec: ${raw}`);
    return { name, spec };
  };

  for (const record of formRecords) {
    const { name, baseName, data, form, isDefault } = record;
    const bs = object();
    for (const [key, short] of Object.entries(STAT_KEYS)) {
      const value = form.battleStats?.[key];
      if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid ${key} base stat for ${name}.`);
      bs[short] = value;
    }
    if (!Array.isArray(form.types) || !form.types.length) throw new Error(`Missing types for ${name}.`);
    const abilities = { ...form.abilities };
    if (abilities.abilities?.includes("AsOne") && ["icerider", "shadowrider"].includes(form.name)) abilities.abilities = [form.name === "icerider" ? "As One (Glastrier)" : "As One (Spectrier)"];
    const abs = [addAbility(abilities.abilities?.[0]), addAbility(abilities.abilities?.[1]), addAbility(abilities.hiddenAbilities?.[0])];
    const moves = form.moves || {};
    const tmFields = Object.keys(moves).filter((key) => /^tmMoves\d*$/.test(key)).sort((a, b) => Number(b.replace("tmMoves", "")) - Number(a.replace("tmMoves", "")));
    const learnset = (moves.levelUpMoves || []).flatMap((row) => (row.attacks || []).map((move) => [row.level, move]));
    const info = { learnset, tms: unique([...tmFields.flatMap((key) => moves[key] || []), ...(moves.trMoves || []), ...(moves.hmMoves || [])]), tutors: unique(moves.tutorMoves || []), eggMoves: unique(moves.eggMoves || []) };
    const entry = { name, num: data.dex, types: form.types.map(title), bs, abs, items: [null, null, null], learnset_info: info, catchRate: form.catchRate, weightkg: form.weight, eggGroups: form.eggGroups?.map(title), prevo: "", evoType: "", evoCondition: "", evoLevel: null };
    if (Number.isFinite(form.malePercentage)) entry.genderRatio = { M: form.malePercentage / 100, F: 1 - form.malePercentage / 100 };
    if (form.possibleGenders?.length === 1 && form.possibleGenders[0] === "NONE") entry.gender = "N";
    if (!isDefault) { entry.baseSpecies = baseName; entry.forme = name.slice(baseName.length + 1); }
    const evolutions = form.evolutions || [];
    if (evolutions.length) {
      entry.evos = []; entry.evoMethods = []; entry.evoParams = [];
      for (const evo of evolutions) {
        if (!evo.to) continue;
        entry.evos.push(resolveSpec(evo.to).name);
        const itemName = addItem(evo.item?.itemID);
        const conditions = (evo.conditions || []).map(conditionText).filter(Boolean);
        let method = "levelExtra";
        let param = [evo.level ? `Level ${evo.level}` : "", itemName ? `Item: ${itemName}` : "", ...conditions].filter(Boolean).join("; ") || title(evo.evoType);
        if (!conditions.length) {
          if (evo.evoType === "leveling" && evo.level) { method = "level"; param = evo.level; }
          if (evo.evoType === "interact" && itemName) { method = "useItem"; param = itemName; }
          if (evo.evoType === "trade") { method = itemName ? "tradeItem" : "trade"; param = itemName; }
        }
        entry.evoMethods.push(method); entry.evoParams.push(param);
      }
      if (!entry.evos.length) { delete entry.evos; delete entry.evoMethods; delete entry.evoParams; }
    }
    if (overrides.poks[name]) throw new Error(`Duplicate Pokémon/form name: ${name}`);
    overrides.poks[name] = entry;
    const slots = { 0: abs[0] };
    if (abs[1]) slots[1] = abs[1];
    if (abs[2]) slots.H = abs[2];
    backupData.poks[name] = { bs, types: entry.types, abilities: slots, weightkg: form.weight, n: data.dex, learnset_info: info, ...(isDefault ? {} : { baseSpecies: baseName, forme: entry.forme }) };
  }
  for (const { name, baseName, isDefault } of formRecords) {
    if (isDefault) {
      const names = formRecords.filter((record) => record.baseName === baseName && !record.isDefault).map((record) => record.name);
      overrides.poks[name].otherFormes = names;
      overrides.poks[name].formeOrder = [name, ...names];
      backupData.poks[name].otherFormes = names;
    }
    const entry = overrides.poks[name];
    for (let i = 0; i < (entry.evos || []).length; i++) {
      const target = overrides.poks[entry.evos[i]];
      if (!target || target.prevo) continue;
      target.prevo = name;
      target.evoType = entry.evoMethods[i];
      if (target.evoType === "level") target.evoLevel = entry.evoParams[i];
      else target.evoCondition = String(entry.evoParams[i] || "");
    }
  }

  let derivedMoves = 0;
  for (const { path, data } of moveFiles) {
    const derived = !data.attackCategory && /^(?:moves\/(?:z|max|gmax)moves\/)/.test(path);
    if (derived) {
      derivedMoves++;
      const base = battleMovedex[toID(data.attackName)];
      if (base) overrides.moves[base.name] = { name: base.name, num: data.attackIndex, t: title(data.attackType), bp: base.basePower, cat: base.category, pp: data.ppBase, acc: true, prio: 0, desc: "Power and category are derived from the original move by the Gen 8 calculator." };
      continue;
    }
    if (!data.attackName || !Number.isFinite(data.basePower) || !Number.isFinite(data.ppBase) || !["PHYSICAL", "SPECIAL", "STATUS"].includes(data.attackCategory)) throw new Error(`Invalid move data in ${path}.`);
    const name = battleMovedex[toID(data.attackName)]?.name || data.attackName;
    const { fields, description } = effectFields(data);
    const flags = { ...battleMovedex[toID(name)]?.flags };
    for (const flag of ["punch", "bite", "bullet", "sound", "pulse", "slicing", "wind", "authentic"]) flags[flag] = data.flags?.[flag] ? 1 : 0;
    Object.assign(flags, data.flags, { contact: data.makesContact ? 1 : 0 });
    const targeting = data.targetingInfo || {};
    const target = targeting.hitsAll
      ? (targeting.hitsAdjacentAlly ? "allAdjacent" : "allAdjacentFoes")
      : targeting.hitsSelf && !targeting.hitsOppositeFoe ? "self" : "normal";
    const calcMove = { name, basePower: data.basePower, type: title(data.attackType), category: title(data.attackCategory), pp: data.ppBase, accuracy: data.accuracy < 0 ? true : data.accuracy, makesContact: !!data.makesContact, flags, target, ...fields };
    // Explicit false/zero flags clear inherited vanilla move metadata in the calc.
    for (const flag of ["punch", "bite", "bullet", "sound", "pulse", "slicing", "wind"]) calcMove[`is${title(flag)}`] = !!flags[flag];
    const desc = data.description || (description ? `Pixelmon effects: ${description}.` : battleMovedex[toID(name)]?.desc || "Pixelmon move.");
    backupData.moves[name] = calcMove;
    overrides.moves[name] = { name, num: data.attackIndex, t: calcMove.type, bp: calcMove.basePower, cat: calcMove.category, pp: calcMove.pp, acc: calcMove.accuracy, prio: calcMove.priority, desc, flags, target, ...fields };
    if (!battleMovedex[toID(name)]) warnings.add(`Custom move: ${name}`);
  }
  for (const { path, data } of records.filter((entry) => entry.path.startsWith("abilities/"))) {
    addAbility(data.name || data.className?.split(".").at(-1) || path.split("/").at(-1).replace(/\.json$/, ""));
  }

  const trainers = [];
  let trainerId = 0;
  for (const { path, data } of records.filter((entry) => entry.path.startsWith("pixelmon/npc/preset/"))) {
    const party = data.party?.value;
    if (!party || !["pixelmon:spec", "pixelmon:random_combination"].includes(party.type)) continue;
    const specs = party.specs || party.options;
    if (!Array.isArray(specs)) continue;
    const id = ++trainerId;
    const nameOptions = data.names?.values || [];
    const trainerName = nameOptions.length === 1 ? nameOptions[0] : title(path.split("/").at(-1).replace(/\.json$/, ""));
    const displayName = `${trainerName} (${path.replace(/^pixelmon\/npc\/preset\//, "").replace(/\.json$/, "")})`;
    const trainer = { id, name: displayName, names: nameOptions, random: party.type === "pixelmon:random_combination", min: party.min_selections, max: party.max_selections, pokemon: [] };
    for (let index = 0; index < specs.length; index++) {
      const raw = specs[index];
      if (typeof raw !== "string") { warnings.add(`Unsupported trainer party option in ${path}`); continue; }
      const { name, spec } = resolveSpec(raw);
      const speciesData = overrides.poks[name];
      if (!speciesData) continue;
      const level = /^\d+$/.test(spec.lvl || spec.level || "") ? Number(spec.lvl || spec.level) : null;
      const moveNames = [1, 2, 3, 4].map((slot) => spec[`move${slot}`]).filter(Boolean).map((move) => named(move, battleMovedex));
      const set = { tr_id: id, sub_index: index, ...(level ? { level } : {}), item: addItem(spec.helditem), ability: spec.ability ? addAbility(spec.ability) : speciesData.abs[0], ...(spec.nature ? { nature: title(spec.nature) } : {}), battle_type: /double/i.test(path) ? "Doubles" : "Singles" };
      if (moveNames.length) set.moves = moveNames;
      else if (level) set.moves = unique(speciesData.learnset_info.learnset.filter(([learnLevel]) => learnLevel <= level).map(([, move]) => move)).slice(-4);
      for (const [prefix, field] of [["iv", "ivs"], ["ev", "evs"]]) {
        const stats = object();
        for (const [key, calcKey] of Object.entries({ hp: "hp", atk: "at", def: "df", spatk: "sa", spdef: "sd", spd: "sp" })) {
          if (/^\d+$/.test(spec[prefix + key] || "")) stats[calcKey] = Number(spec[prefix + key]);
        }
        if (Object.keys(stats).length) set[field] = stats;
      }
      if (spec.form) set.form = speciesData.forme || "";
      // Preserve preset identity in temporary keys before assigning concise names.
      const label = `Lvl ${level || 100} ${displayName} #${index + 1}`;
      (backupData.formatted_sets[name] ||= object())[label] = { ...set, level: level || 100, moves: set.moves || [], ...(!level ? { pixelmonUnspecifiedLevel: true } : {}) };
      trainer.pokemon.push({ species: name, spec: raw, set });
    }
    if (trainer.pokemon.length) trainers.push(trainer);
  }

  // Pixelmon rarity is a weight, not a fixed per-biome encounter percentage.
  for (const { data } of records.filter((entry) => entry.path.startsWith("spawning/"))) {
    for (const spawn of data.spawnInfos || []) {
      if (spawn.typeID !== "pokemon" || !spawn.spec) continue;
      const { name } = resolveSpec(spawn.spec);
      if (!overrides.poks[name]) continue;
      const biomes = spawn.condition?.biomes?.length ? spawn.condition.biomes : ["Unspecified biome"];
      for (const biome of biomes) {
        const locId = `pixelmon${toID(biome)}`;
        const location = overrides.encs[locId] ||= { name: `Pixelmon: ${biome}` };
        const group = unique(spawn.stringLocationTypes || ["Spawn"]).join(" / ");
        const groupId = toID(group) || "spawn";
        const table = location[groupId] ||= { name: `${group} — rarity weights`, encs: [] };
        table.encs.push({ s: name, mn: spawn.minLevel ?? 1, mx: spawn.maxLevel ?? spawn.minLevel ?? 1, pixelmonRarity: spawn.rarity, pixelmonConditions: spawn.condition });
      }
    }
  }
  const search = buildDdexSearchIndex(overrides);
  const summary = { derivedMoves, species: Object.keys(overrides.poks).length, moves: Object.keys(overrides.moves).length, abilities: Object.keys(overrides.abilities).length, items: Object.keys(overrides.items).length, trainers: trainers.length, sets: Object.values(backupData.formatted_sets).reduce((sum, sets) => sum + Object.keys(sets).length, 0), locations: Object.keys(overrides.encs).length - 1 };
  const result = { title: backupData.title, sourceGen: 8, sourceKind: "pixelmon", overrides, backupData, trainers, summary, warnings: [...warnings], searchIndex: search.BattleSearchIndex, searchIndexOffset: search.BattleSearchIndexOffset, searchIndexCount: search.BattleSearchCountIndex };
  normalizePixelmonCalcSetNames(result);
  return result;
}
