import {
  battleAbilities,
  battleAliases,
  battleItems,
  battleMovedex,
  battlePokedex,
  battleTypeChart,
} from "../data/ddex-base.mjs";

export function toID(text) {
  if (text && typeof text === "object" && "id" in text) text = text.id;
  if (text && typeof text === "object" && "userid" in text) text = text.userid;
  if (typeof text !== "string" && typeof text !== "number") return "";
  return String(text).toLowerCase().replace(/é/g, "e").replace(/[^a-z0-9]+/g, "");
}

function getItem(collection, id, aliases) {
  if (collection[id]) return collection[id];
  if (aliases[id] && collection[aliases[id]]) {
    return { name: collection[aliases[id]].name || aliases[id] };
  }
  return { name: id };
}

function mergeByDisplayKeys(base, overrideRecords, keepName) {
  const merged = { ...base };
  for (const [displayName, payload] of Object.entries(overrideRecords || {})) {
    const id = toID(displayName);
    merged[id] = { ...merged[id], ...payload };
    if (keepName && !merged[id].name) merged[id].name = displayName;
  }
  return merged;
}

export function buildDdexSearchIndex(overrides) {
  const mergedPokedex = mergeByDisplayKeys(battlePokedex, overrides.poks, true);
  const mergedMoves = mergeByDisplayKeys(battleMovedex, overrides.moves, true);
  const mergedItems = mergeByDisplayKeys(battleItems, overrides.items, true);
  const mergedAbilities = mergeByDisplayKeys(battleAbilities, overrides.abilities, true);
  const locations = overrides.encs || { rates: {} };

  let index = [];
  index = index.concat(Object.keys(mergedPokedex).map((id) => `${id} pokemon`));
  index = index.concat(Object.keys(mergedMoves).map((id) => `${id} move`));
  index = index.concat(Object.keys(mergedItems).map((id) => `${id} item`));
  index = index.concat(Object.keys(mergedAbilities).map((id) => `${id} ability`));
  index = index.concat(Object.keys(battleTypeChart).map((id) => `${toID(id)} type`));
  index = index.concat(Object.keys(locations).map((id) => `${toID(id)} location`));
  index = index.concat(["physical", "special", "status"].map((id) => `${id} category`));

  function generateAlias(id, name, type) {
    name = battleAliases[id] || name;
    if (type === "pokemon" && !battleAliases[id] && mergedPokedex[id]) {
      const species = mergedPokedex[id];
      const baseid = toID(species.baseSpecies || "");
      if (baseid && baseid !== id) {
        name = `${battleAliases[baseid] || species.baseSpecies} ${species.forme}`;
      }
    }
    const fullSplit = name.split(/ |-/).map(toID).filter(Boolean);
    if (fullSplit.length >= 2) {
      const acronym = fullSplit.map((part) => part.charAt(0)).join("") + fullSplit.at(-1).slice(1);
      index.push(`${acronym} ${type} ${id} 0`);
      for (let splitIndex = 1; splitIndex < fullSplit.length; splitIndex += 1) {
        index.push(
          `${fullSplit.slice(splitIndex).join("")} ${type} ${id} ${fullSplit.slice(0, splitIndex).join("").length}`
        );
      }
    }
  }

  for (const id of Object.keys(mergedPokedex)) {
    if (mergedPokedex[id].isCosmeticForme) continue;
    generateAlias(id, mergedPokedex[id].name || id, "pokemon");
  }
  for (const id of Object.keys(mergedMoves)) {
    generateAlias(id, mergedMoves[id].name || id, "move");
  }
  for (const id of Object.keys(mergedItems)) {
    generateAlias(id, mergedItems[id].name || id, "item");
  }
  for (const id of Object.keys(mergedAbilities)) {
    generateAlias(id, mergedAbilities[id].name || id, "ability");
  }
  for (const id of Object.keys(locations)) {
    if (id === "rates") continue;
    generateAlias(id, locations[id].name || id, "location");
  }

  index.sort();

  const battleSearchIndex = index.map((entry) => {
    const parts = entry.split(" ");
    if (parts.length > 3) {
      parts[3] = Number(parts[3]);
      parts[2] = index.indexOf(`${parts[2]} ${parts[1]}`);
    }
    return parts;
  });

  const battleSearchIndexOffset = battleSearchIndex.map((entry) => {
    const id = entry[0];
    let name = "";
    switch (entry[1]) {
      case "pokemon":
        name = getItem(mergedPokedex, id, battleAliases).name || id;
        break;
      case "move":
        name = getItem(mergedMoves, id, battleAliases).name || id;
        break;
      case "item":
        name = getItem(mergedItems, id, battleAliases).name || id;
        break;
      case "ability":
        name = getItem(mergedAbilities, id, battleAliases).name || id;
        break;
      case "location":
        name = getItem(locations, id, battleAliases).name || id;
        break;
      default:
        break;
    }
    let offsets = "";
    let nonAlnum = 0;
    for (let indexPos = 0, namePos = 0; indexPos < id.length; indexPos += 1, namePos += 1) {
      while (namePos < name.length && !/[a-zA-Z0-9]/.test(name[namePos])) {
        namePos += 1;
        nonAlnum += 1;
      }
      offsets += nonAlnum;
    }
    return nonAlnum ? offsets : "";
  });

  const battleSearchCountIndex = {};
  for (const type of Object.keys(battleTypeChart)) {
    battleSearchCountIndex[`${type} move`] = Object.values(mergedMoves).filter(
      (move) => move.type === type || move.t === type
    ).length;
  }
  for (const type of Object.keys(battleTypeChart)) {
    battleSearchCountIndex[`${type} pokemon`] = Object.values(mergedPokedex).filter((species) => {
      if (species.isCosmeticForme) return false;
      const types = species.types || [];
      return types.includes(type);
    }).length;
  }

  return {
    BattleSearchIndex: battleSearchIndex,
    BattleSearchIndexOffset: battleSearchIndexOffset,
    BattleSearchCountIndex: battleSearchCountIndex,
    BattleArticleTitles: {},
  };
}
