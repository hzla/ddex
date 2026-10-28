import { resolveFireRedDeluxeSpecies } from "./fire-red-deluxe.mjs";

const id = value => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const moveId = value => {
  const key = id(value);
  return { vicegrip: "visegrip", hijumpkick: "highjumpkick", dironbash: "doubleironbash",
    thunderkick: "thunderouskick", frozenglare: "freezingglare" }[key] || key;
};
const cleanTrainer = value => id(String(value).replace(/\bSwimmer[MF]\b/gi, "Swimmer").replace(/\([^)]*\)/g, "").replace(/^Lvl \d+\** /, "").split(" - ")[0])
  .replace(/^gymleader/, "leader").replace(/^elite4/, "elitefour").replace(/picknicker/g, "picnicker")
  .replace(/smauel/g, "samuel").replace(/jessiejames/g, "jessjames")
  .replace(/pokmaniac/g, "pokemaniac").replace(/^(pokemon|pkmn)trainer/, "trainer")
  .replace(/^(pokemon|pkmn)ranger/, "ranger").replace(/blue/g, "terry").replace(/championrival/, "championterry")
  .replace(/darius/g, "dairius").replace(/grahamlala/g, "grahamlaia").replace(/claire$/, "clair")
  .replace(/abagail/g, "abigail");
const locationId = value => id(value).replace(/pkmn|pokmon/g, "pokemon").replace(/fuschia/g, "fuchsia")
  .replace(/vermillion/g, "vermilion").replace(/victoryrd/g, "victoryroad").replace(/ssanne.*/, "ssanne")
  .replace(/section\d+$/, "").replace(/^mtmoon.*/, "mtmoon").replace(/^rocktunnel.*/, "rocktunnel")
  .replace(/^pokemontower.*/, "pokemontower").replace(/^pokemonmansion.*/, "pokemonmansion")
  .replace(/^safarizone\d+$/, "safarizone").replace(/^seafoamislands?\d*$/, "seafoamislands")
  .replace(/^victoryroad\d+$/, "victoryroad").replace(/^(?:rubypath|interior|mtember).*/, "mtember")
  .replace(/^(?:icefall|frozenchamber).*/, "icefallcave").replace(/^crystaleyecavern.*/, "crystaleyecavern")
  .replace(/^ceruleancave.*/, "ceruleancave")
  .replace(/^fiveislandmeadow$/, "fiveislemeadow");
const docSpecies = value => resolveFireRedDeluxeSpecies({ bulbasuar: "Bulbasaur", primape: "Primeape", farigaraf: "Farigiraf", treeko: "Treecko", dodou: "Doduo", magargo: "Magcargo", graverlera: "Graveler-Alola", hitmomtop: "Hitmontop" }[id(value)] || value);

function trainerRecords(data) {
  const records = new Map();
  for (const [species, sets] of Object.entries(data.formatted_sets)) {
    for (const [label, set] of Object.entries(sets)) {
      if (!records.has(set.tr_id)) records.set(set.tr_id, {
        id: set.tr_id, label: label.replace(/^Lvl \d+\** /, ""), key: cleanTrainer(label), party: [],
      });
      records.get(set.tr_id).party.push({ species, ...set });
    }
  }
  for (const record of records.values()) record.party.sort((a, b) => a.sub_index - b.sub_index);
  return [...records.values()];
}

function parseBosses(workbook) {
  const result = [];
  for (const [sheet, table] of Object.entries(workbook)) {
    if (["Encounter Rates", "Pokedex", "Item Guide", "Trainer List", "Move Changes", "Damage Calc"].includes(sheet)) continue;
    const rows = new Map(table.rows.map(row => [row.row, row.cells]));
    for (const row of table.rows) {
      if (id(row.cells.A) !== "name" || !row.cells.B) continue;
      const names = rows.get(row.row + 2) || {};
      const party = Object.entries(names).filter(([col]) => col !== "A").map(([col, name]) => ({
        species: docSpecies(String(name).trim()),
        level: rows.get(row.row + 3)?.[col], ability: rows.get(row.row + 5)?.[col],
        nature: rows.get(row.row + 6)?.[col], item: rows.get(row.row + 7)?.[col] || "-",
        moves: [8, 9, 10, 11].map(offset => rows.get(row.row + offset)?.[col]).filter(Boolean),
      }));
      result.push({ sheet, cell: `B${row.row}`, name: String(row.cells.B).trim(), party });
    }
  }
  return result;
}

function bossMatch(boss, trainers) {
  const words = boss.name.toLowerCase().replace(/\([^)]*\)/g, "").split(/[^a-z0-9]+/)
    .filter(word => word.length > 2 && !["gym", "leader", "rival", "elite", "four", "trainer", "team"].includes(word));
  const candidates = trainers.filter(trainer => words.some(word => trainer.key.includes(word === "blue" ? "terry" : word)));
  const scored = candidates.map(trainer => {
    let score = -Math.abs(trainer.party.length - boss.party.length) * 4;
    for (const member of boss.party) {
      const matching = trainer.party.filter(mon => id(mon.species) === id(member.species));
      if (matching.length) score += 10;
      if (matching.some(mon => mon.level === member.level)) score += 3;
      if (matching.some(mon => mon.nature === member.nature)) score += 1;
    }
    return { trainer, score };
  }).sort((a, b) => b.score - a.score || a.trainer.id - b.trainer.id);
  return scored[0]?.score > 0 ? scored[0].trainer : null;
}

export function verifyFireRedDeluxeDocumentation(artifacts, workbook) {
  const data = artifacts.calcOutput;
  const checks = { species: 0, moves: 0, bosses: 0, encounters: 0, learnsetMoves: 0 };
  const differences = [];
  const note = (sheet, cell, field, expected, actual) => differences.push({ sheet, cell, field, spreadsheet: expected, rom: actual });
  const rows = new Map(workbook.Pokedex.rows.map(row => [row.row, row.cells]));
  const moveNames = new Map(Object.keys(data.moves).map(name => [moveId(name), name]));
  const nameRows = workbook.Pokedex.rows.filter(row => id(row.cells.A) === "name");
  for (const row of workbook.Pokedex.rows) {
    if (id(row.cells.A) !== "name") continue;
    for (const [column, raw] of Object.entries(row.cells)) {
      if (column === "A") continue;
      const name = docSpecies(raw);
      const species = data.poks[name];
      checks.species++;
      if (!species) { note("Pokedex", `${column}${row.row}`, "species", name, null); continue; }
      const rawStats = String(rows.get(row.row + 3)?.[column] || "").split("/").map(Number);
      if (rawStats.length === 6 && rawStats.every(Number.isFinite)) {
        const actual = ["hp", "at", "df", "sa", "sd", "sp"].map(stat => species.bs[stat]);
        if (JSON.stringify(rawStats) !== JSON.stringify(actual)) note("Pokedex", `${column}${row.row + 3}`, `${name} stats`, rawStats, actual);
      }
      const types = String(rows.get(row.row + 1)?.[column] || "").split("/").map(id).sort();
      if (types.join() !== species.types.map(id).sort().join()) note("Pokedex", `${column}${row.row + 1}`, `${name} types`, types, species.types);
      const abilities = String(rows.get(row.row + 2)?.[column] || "").split("/").map(id).sort();
      const actualAbilities = [...new Set(Object.values(species.abilities))].map(id).sort();
      if (abilities.join() !== actualAbilities.join()) note("Pokedex", `${column}${row.row + 2}`, `${name} abilities`, abilities, actualAbilities);
      const next = nameRows.find(header => header.row > row.row)?.row || Infinity;
      for (const learnRow of workbook.Pokedex.rows.filter(item => item.row >= row.row + 7 && item.row < next)) {
        const match = String(learnRow.cells[column] || "").match(/^(.+?)\s+(\d{1,3})$/);
        if (!match) continue;
        checks.learnsetMoves++;
        const move = moveNames.get(moveId(match[1]));
        const level = Number(match[2]);
        if (!move || !artifacts.dexOutput.poks[name].learnset_info.learnset.some(([l, m]) => l === level && m === move)) {
          note("Pokedex", `${column}${learnRow.row}`, `${name} level-up move`, [level, move || match[1]], "not in ROM learnset");
        }
      }
    }
  }
  for (const row of workbook["Move Changes"].rows.slice(1)) {
    if (!row.cells.A || typeof row.cells.B !== "number") continue;
    checks.moves++;
    const name = moveNames.get(moveId(row.cells.A));
    if (!name) { note("Move Changes", `A${row.row}`, "move", row.cells.A, null); continue; }
    if (data.moves[name].basePower !== row.cells.B) note("Move Changes", `B${row.row}`, `${name} power`, row.cells.B, data.moves[name].basePower);
    const expectedType = { fight: "fighting", electr: "electric", psychc: "psychic" }[id(row.cells.C)] || id(row.cells.C);
    if (id(data.moves[name].type) !== expectedType) note("Move Changes", `C${row.row}`, `${name} type`, row.cells.C, data.moves[name].type);
  }
  const trainers = trainerRecords(data);
  const bosses = parseBosses(workbook).map(boss => ({ ...boss, match: bossMatch(boss, trainers) }));
  for (const boss of bosses) {
    checks.bosses++;
    if (!boss.match) { note(boss.sheet, boss.cell, "trainer", boss.name, null); continue; }
    const actual = boss.match.party.map(mon => ({ species: mon.species, level: mon.level,
      ability: mon.ability, nature: mon.nature, item: mon.item, moves: mon.moves }));
    const expected = boss.party.map(mon => ({ ...mon, moves: mon.moves.map(move => moveNames.get(moveId(move)) || move) }));
    const comparable = party => party.map(mon => ({ species: id(mon.species), level: mon.level,
      ability: id(mon.ability), nature: id(mon.nature), item: id(mon.item), moves: mon.moves.map(moveId).sort() }))
      .sort((a, b) => a.species.localeCompare(b.species));
    if (JSON.stringify(comparable(expected)) !== JSON.stringify(comparable(actual))) note(boss.sheet, boss.cell, `${boss.name} team (ROM trainer ${boss.match.id})`, expected, actual);
  }
  const encounterRows = workbook["Encounter Rates"].rows;
  const headings = encounterRows.find(row => row.row === 1).cells;
  let method = "grass";
  const methods = {grass:"grass", surf:"surf", surfing:"surf", oldrod:"old_rod", goodrod:"good_rod", superrod:"super_rod", rocksmash:"rock_smash"};
  for (const row of encounterRows.slice(1)) {
    if (methods[id(row.cells.A)]) method = methods[id(row.cells.A)];
    for (const [column, text] of Object.entries(row.cells)) {
      if (column === "A" || typeof text !== "string") continue;
      const match = text.match(/^(.+?)\s*-?\s*(\d+)%\s*(?:Lve?\s*)?(\d+)?(?:\s*-\s*(\d+))?/i);
      if (!match) continue;
      checks.encounters++;
      const species = docSpecies(match[1].replace(/\s*-$/, "").trim());
      const locations = Object.values(artifacts.dexOutput.encs).filter(location => location.name &&
        (locationId(location.name) === locationId(headings[column]) || id(headings[column]) === "tanobychambers" && /chamber$/i.test(location.name)));
      const summaries = locations.filter(location => location[method]).map(location => {
        const table = location[method];
        const rates = table.rates || artifacts.dexOutput.encs.rates[method];
        const slots = table.encs.map((slot, index) => ({ ...slot, rate: rates[index] })).filter(slot => id(slot.s) === id(species));
        return slots.length ? { rate: slots.reduce((sum, slot) => sum + slot.rate, 0),
          min: Math.min(...slots.map(slot => slot.mn)), max: Math.max(...slots.map(slot => slot.mx)) } : null;
      }).filter(Boolean);
      const expected = { species, rate: Number(match[2]), min: match[3] ? Number(match[3]) : null,
        max: match[4] ? Number(match[4]) : match[3] ? Number(match[3]) : null };
      const found = summaries.some(summary => summary.rate === expected.rate &&
        (expected.min === null || summary.min === expected.min && summary.max === expected.max));
      if (!found) note("Encounter Rates", `${column}${row.row}`, `${headings[column]} ${method} encounter`, expected,
        summaries.length ? summaries : locations.length ? "not in ROM table" : "location name requires mapping");
    }
  }
  const order = buildTrainerOrder(workbook["Trainer List"], trainers, bosses);
  return { checks, differences, order };
}

function buildTrainerOrder(table, trainers, bosses) {
  const headings = table.rows.find(row => row.row === 1).cells;
  const groups = [];
  const used = new Set();
  const unmatched = [];
  for (const [column, location] of Object.entries(headings)) {
    for (const row of table.rows.slice(1)) {
      const name = row.cells[column];
      if (!name || /^(gym|rematch|.*ev dojo|.*floor|rivals|.*dojo|.*hideout|double battle cafe|\*.*|out post erika battle\*)$/i.test(String(name).trim())) continue;
      const key = cleanTrainer(name);
      const base = key.replace(/\d+$/, "");
      let candidates = trainers.filter(trainer => !used.has(trainer.id) && trainer.key.replace(/\d+$/, "") === base);
      if (/^Rival Blue \d/i.test(String(name))) {
        const stage = Number(String(name).match(/\d+/)[0]);
        const stageName = ["Pallet Town", "Route 22 Optional", "Nugget Bridge", "S.S. Anne", "Pre Erika", "Post Erika"][stage - 1];
        const matches = new Set(bosses.filter(boss => boss.sheet === "Rival Blue" && boss.name.includes(stageName) && boss.match).map(boss => boss.match.id));
        candidates = trainers.filter(trainer => !used.has(trainer.id) && matches.has(trainer.id));
      }
      const located = candidates.filter(trainer => id(trainer.label.split(" - ")[1]).includes(id(location)));
      if (located.length && !/^Rival Blue /i.test(String(name))) candidates = located;
      const documented = new Set(bosses.filter(boss => boss.match && candidates.some(t => t.id === boss.match.id)).map(boss => boss.match.id));
      if (documented.size) candidates = candidates.filter(trainer => documented.has(trainer.id));
      if (!candidates.length && /rival/i.test(String(name))) {
        if (/leaf\/red/i.test(name)) {
          const stage = Number(String(name).match(/\d+/)?.[0] || 1);
          candidates = trainers.filter(trainer => !used.has(trainer.id) && /^trainer(?:leaf|red)/.test(trainer.key) &&
            trainer.party.some(mon => stage === 1 ? mon.level >= 15 && mon.level <= 18 : stage === 2 ? mon.level >= 26 && mon.level <= 30 : mon.level >= 49));
        }
      }
      if (!candidates.length) {
        const personal = key.replace(/^(?:cooltrainer|nurse|leader|trainer|ranger)/, "");
        const matching = trainers.filter(trainer => !used.has(trainer.id) && trainer.key.replace(/\d+$/, "").endsWith(personal));
        const inLocation = matching.filter(trainer => locationId(trainer.label.split(" - ")[1]) === locationId(location));
        if (inLocation.length) candidates = inLocation;
        else if (matching.length === 1) candidates = matching;
      }
      if (!candidates.length) { unmatched.push({ cell: `${column}${row.row}`, location, name }); continue; }
      const minLevel = Math.min(...candidates.map(trainer => Math.max(...trainer.party.map(mon => mon.level))));
      candidates = candidates.filter(trainer => Math.max(...trainer.party.map(mon => mon.level)) <= minLevel + 2);
      candidates.sort((a, b) => a.id - b.id);
      if (!/rival|champion/i.test(String(name))) candidates = candidates.slice(0, 1);
      groups.push({ cell: `${column}${row.row}`, location, name, ids: candidates.map(trainer => trainer.id) });
      candidates.forEach(trainer => used.add(trainer.id));
    }
  }
  const linked = {};
  groups.forEach((group, index) => group.ids.forEach(trainerId => {
    linked[trainerId] = { id: trainerId, prev: groups[index - 1]?.ids[0] ?? null, next: groups[index + 1]?.ids[0] ?? null };
  }));
  return { linked, groups, unmatched };
}
