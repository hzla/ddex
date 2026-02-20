/* global GEN4_SYMBOLS */
import { Rom as BaseRom } from "./rom.js";
import { installFntPathSupport } from "./rom_fnt.js";
import { Narc } from "./narc.js";
import { parseGen4MsgBank } from "./formats/gen4_text.js";

const TEXT_ENCODER = new TextEncoder();

const Rom = installFntPathSupport(BaseRom);

function resolveAssetUrl(relPath) {
  return new URL(relPath, import.meta.url).toString();
}

class RomBrowser {
  constructor(u8) {
    this.rom = Rom.parse(u8);
    this._narcs = new Map();
    this._narcMeta = new Map();
    this._nextHandle = 1;
  }

  readHeader() {
    const u8 = this.rom._original;
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const textDecoder = new TextDecoder("ascii");
    const romId = textDecoder.decode(u8.subarray(0x0c, 0x10)).replace(/\0/g, "");
    const arm9Offset = dv.getUint32(0x20, true);
    const arm9EntryAddress = dv.getUint32(0x24, true);
    const arm9RamAddress = dv.getUint32(0x28, true);
    const arm9Size = dv.getUint32(0x2c, true);
    const arm9OvTOffset = dv.getUint32(0x50, true);
    const arm9OvTSize = dv.getUint32(0x54, true);
    return {
      romId,
      arm9Offset,
      arm9Size,
      arm9EntryAddress,
      arm9RamAddress,
      arm9OvTOffset,
      arm9OvTSize,
    };
  }

  readBytes(offset, length) {
    const u8 = this.rom._original;
    if (offset + length > u8.length) {
      throw new Error("rom.readBytes: range out of bounds");
    }
    const bytes = u8.subarray(offset, offset + length).slice().buffer;
    return { size: length, bytes };
  }

  readFileByPath(path) {
    const id = this.rom.resolvePathToId(path);
    const bytes = this.rom.getFile(id);
    return { size: bytes.length, fileBuffer: bytes.slice().buffer };
  }

  readFileById(id) {
    const bytes = this.rom.getFile(id);
    return { size: bytes.length, fileBuffer: bytes.slice().buffer };
  }

  openNarcAtPath(path) {
    const id = this.rom.resolvePathToId(path);
    const fileBytes = this.rom.getFile(id);
    let narc;
    let sizeMismatch = false;
    let lenient = false;
    try {
      narc = Narc.parse(fileBytes);
    } catch (e) {
      const msg = String(e?.message || "");
      if (msg.includes("header fileSize")) {
        narc = Narc.parse(fileBytes, { allowSizeMismatch: true, allowChunkOverrun: true, allowFileOverrun: true });
        sizeMismatch = true;
        lenient = true;
      } else if (msg.includes("chunk") || msg.includes("GMIF")) {
        narc = Narc.parse(fileBytes, { allowChunkOverrun: true, allowFileOverrun: true });
        lenient = true;
      } else {
        throw e;
      }
    }
    const handle = this._nextHandle++;
    this._narcs.set(handle, narc);
    this._narcMeta.set(handle, { path, id, fileCount: narc.files.length });
    return { handle, fileCount: narc.files.length, sizeMismatch, lenient };
  }

  getNarcSubfile(handle, index) {
    const narc = this._narcs.get(handle);
    if (!narc) throw new Error(`Unknown NARC handle: ${handle}`);
    let sub;
    try {
      sub = narc.getFile(index);
    } catch (err) {
      const meta = this._narcMeta.get(handle);
      console.warn(
        `getNarcSubfile failed: path=${meta?.path ?? "unknown"} id=${meta?.id ?? "?"} handle=${handle} index=${index} fileCount=${meta?.fileCount ?? "?"}`,
        err
      );
      throw err;
    }
    return { size: sub.length, subfileBuffer: sub.slice().buffer };
  }

  closeNarc(handle) {
    this._narcs.delete(handle);
    this._narcMeta.delete(handle);
  }
}

const GAME_IDS = {
  Platinum: ["CPUE", "CPUS", "CPUI", "CPUF", "CPUD", "CPUJ", "CPUP"],
  HeartGold: ["IPKE", "IPKS", "IPKI", "IPKF", "IPKD", "IPKJ"],
  SoulSilver: ["IPGE", "IPGS", "IPGI", "IPGF", "IPGD", "IPGJ"],
};

const TEXT_BANKS = {
  Plat: {
    pokemonNames: [412, 413, 712, 713, 714, 715, 716],
    abilities: 610,
    abilityDescriptions: 612,
    moves: 647,
    moveDescriptions: 646,
    items: 392,
    itemDescriptions: 391,
    locations: 433,
    trainerNames: 618,
    trainerClasses: 619,
    types: 624,
  },
  HGSS: {
    pokemonNames: [237, 238, 817, 818, 819, 820, 821],
    abilities: 720,
    abilityDescriptions: 722,
    moves: 750,
    moveDescriptions: 749,
    items: 222,
    itemDescriptions: 221,
    locations: 279,
    trainerNames: 729,
    trainerClasses: 730,
    types: 735,
  },
};

const NARC_PATHS = {
  Plat: {
    text: "msgdata/pl_msg.narc",
    personal: "poketool/personal/pl_personal.narc",
    learnsets: "poketool/personal/wotbl.narc",
    evolutions: "poketool/personal/evo.narc",
    moveData: "poketool/waza/pl_waza_tbl.narc",
    itemData: "itemtool/itemdata/pl_item_data.narc",
    encounters: "fielddata/encountdata/pl_enc_data.narc",
    eventFiles: "fielddata/eventdata/zone_event.narc",
    scripts: "fielddata/script/scr_seq.narc",
    trainerProperties: "poketool/trainer/trdata.narc",
    trainerParty: "poketool/trainer/trpoke.narc",
    eggMoves: "egg_moves.narc",
  },
  HGSS: {
    text: "a/0/2/7",
    personal: "a/0/0/2",
    learnsets: "a/0/3/3",
    evolutions: "a/0/3/4",
    moveData: "a/0/1/1",
    itemData: "a/0/1/7",
    encountersHG: "a/0/3/7",
    encountersSS: "a/1/3/6",
    eventFiles: "a/0/3/2",
    scripts: "a/0/1/2",
    trainerProperties: "a/0/5/5",
    trainerParty: "a/0/5/6",
    eggMoves: "a/2/2/9",
  },
};

const PERSONAL_EXTRA_FORMS = [
  { monId: 386, description: "Attack" },
  { monId: 386, description: "Defense" },
  { monId: 386, description: "Speed" },
  { monId: 413, description: "Sandy" },
  { monId: 413, description: "Trash" },
  { monId: 487, description: "Origin" },
  { monId: 492, description: "Sky" },
  { monId: 479, description: "Heat" },
  { monId: 479, description: "Wash" },
  { monId: 479, description: "Frost" },
  { monId: 479, description: "Fan" },
  { monId: 479, description: "Mow" },
];

const MOVE_FLAGS = [
  "NONE",
  "CONTACT",
  "PROTECT",
  "MAGIC_COAT",
  "SNATCH",
  "MIRROR_MOVE",
  "KINGSROCK",
  "KEEP_HP_BAR",
  "DEL_SHADOW",
];

const ATTACK_RANGE_DESCRIPTIONS = [
  { value: 0, name: "Opponent or Ally" },
  { value: 1 << 0, name: "Varies" },
  { value: 1 << 1, name: "One Random Opponent" },
  { value: 1 << 2, name: "All Opponents" },
  { value: 1 << 3, name: "All Others" },
  { value: 1 << 4, name: "User" },
  { value: 1 << 5, name: "User Side" },
  { value: 1 << 6, name: "All Sides" },
  { value: 1 << 7, name: "Opponent Side" },
  { value: 1 << 8, name: "One Ally" },
  { value: 1 << 9, name: "User or Ally" },
  { value: 1 << 10, name: "One Opponent" },
];

const BATTLE_SEQUENCE_DESCRIPTIONS = [
  "Hit",
  "Causes Sleep",
  "May Poison (Hit)",
  "Restore own HP by 1/2 damage dealt",
  "May Burn (Hit)",
  "May Freeze (Hit)",
  "May Paralyze (Hit)",
  "Halves target's defense + KOs self",
  "Fails on awake Target; Restore own HP by 1/2 damage dealt",
  "Uses the last move targeted at User by a Pokémon still on field",
  "Raises User's Atk (Status)",
  "Raises User's Def (Status)",
  "Dummy - Raises User's Speed (Status)",
  "Raises User's Sp. Atk (Status)",
  "Dummy - Raises User's Sp. Def (Status)",
  "Dummy - Raises User's Accuracy (Status)",
  "Raises User's Evasion (Status)",
  "Guaranteed hit",
  "Lowers Target's Atk (Status)",
  "Lowers Target's Def (Status)",
  "Lowers Target's Speed (Status)",
  "Dummy - Lowers Target's Sp. Atk (Status)",
  "Dummy - Lowers Target's Sp. Def (Status)",
  "Lowers Target's Accuracy (Status)",
  "Lowers Target's Evasion (Status)",
  "Reset stat changes",
  "Bide effect",
  "Locked into move for 2-3 turns; confuses User after",
  "Force switch",
  "Multi-hit (2-5 times)",
  "Conversion effect",
  "May cause Flinch (Hit)",
  "Restore half of max HP",
  "Badly Poisons",
  "Increase prize money",
  "Sets Light Screen",
  "May Paralyze, Burn, or Freeze (Hit)",
  "Rest effect",
  "OHKO",
  "User charges this turn, attacks next turn with high crit chance",
  "Halve target's HP",
  "Deals 40 damage",
  "Prevents Target from escaping, deals 1/16 Target's max HP damage for 5 turns (Hit)",
  "High crit chance",
  "Hits twice",
  "User loses 1/2 max HP if move misses",
  "Prevents stat reduction",
  "Sharply raises crit chance",
  "1/4 damage recoil",
  "Causes confusion",
  "Sharply raises User's Atk (Status)",
  "Sharply raises User's Def (Status)",
  "Sharply raises User's Speed (Status)",
  "Sharply raises User's Sp. Atk (Status)",
  "Sharply raises User's Sp. Def (Status)",
  "Dummy - Sharply raises User's Accuracy (Status)",
  "Dummy - Sharply raises User's Evasion (Status)",
  "User transforms into Target",
  "Sharply lowers Target's Atk (Status)",
  "Sharply lowers Target's Def (Status)",
  "Sharply lowers Target's Speed (Status)",
  "Dummy - Sharply lowers Target's Sp. Atk (Status)",
  "Sharply lowers Target's Sp. Def (Status)",
  "Dummy - Sharply lowers Target's Accuracy (Status)",
  "Dummy - Sharply lowers Target's Evasion (Status)",
  "Sets Reflect",
  "Causes Poison",
  "Causes Paralysis",
  "Lowers Target's Atk (Hit)",
  "Lowers Target's Def (Hit)",
  "Lowers Target's Speed (Hit)",
  "Lowers Target's Sp. Atk (Hit)",
  "Lowers Target's Sp. Def (Hit)",
  "Lowers Target's Accuracy (Hit)",
  "Dummy - Lowers Target's Evasion (Hit)",
  "User charges this turn, attacks next turn with Flinch chance and high crit chance",
  "May Confuse (Hit)",
  "Multi-hit and may Poison",
  "Priority -1, guaranteed hit",
  "Substitute effect",
  "Requires recharge turn",
  "Raises User's Atk when hit; locked into move until User is KO'd or battle ends",
  "Mimic effect",
  "User uses random move",
  "Causes leech seed",
  "Do nothing",
  "Disables last move used for 4-7 turns",
  "Deals damage equal to User's level",
  "Deals damage equal to User's level x1.5",
  "Deals 2x last amount of damage received",
  "Locks target into last move used for 3-7 turns",
  "Pain Split effect",
  "User must be asleep; May cause Flinch",
  "Conversion2 effect",
  "Next move used by user guaranteed to hit",
  "User permanently replaces move with Target's last used move",
  "Unused 96",
  "Use random known move while asleep",
  "KO from attack causes attacker to be KO'd; active until User's next move",
  "Higher power the less HP user has",
  "Decreases PP of target's last used move by 4",
  "Target will remain with at least 1 HP",
  "Cure party of all status",
  "Priority +1",
  "Hit 3 times",
  "User steals Target's held item",
  "Prevents Target from escaping",
  "Sleeping Target takes 1/4 max HP damage every turn until waking up",
  "Raises Evasion; weak to Stomp/Rollout/Bodyslam",
  "Curse effect",
  "Unused 110",
  "User is protected from attacks this turn if moving first; high likelihood of failure next turn",
  "Sets Spikes; Stacks up to 3",
  "Removes a Ghost-Type Target's Normal and Fighting immunities",
  "All on field are KO'd in 3 turns",
  "Causes Sandstorm",
  "User survives next move with at least 1 HP",
  "Double power each turn, locked into move",
  "Sharply raises Target's Atk and causes Confusion",
  "2x power for every consecutive hit",
  "Causes Infatuation on Target if opposite gender of User",
  "Power based on high Friendship",
  "Randomly heals or damages Target; variable power",
  "Power based on low Friendship",
  "Prevents new status effects for Target for 5 turns",
  "May burn; Thaws User (Hit)",
  "Variable damage; can hit Target using Dig",
  "Pass stat boosts and switch out",
  "If Target switches, hits first with 2x damage",
  "Remove hazards and binding on User's side of field",
  "Deals 20 damage",
  "Unused 131",
  "Restore 1/2 max HP; x1.5 in Sun, x0.5 in other weather",
  "Unused 133",
  "Unused 134",
  "Type and Power determined by user's IVs",
  "Causes Rain",
  "Causes Harsh Sunlight",
  "May raise User's Def (Hit)",
  "May raise User's Atk (Hit)",
  "May raise all of User's stats (Hit)",
  "Unused 141",
  "Raises Atk by 12, loses 1/2 max HP",
  "Copy target stat changes",
  "Deals 2x damage of last move received if it was Special",
  "User raises Def and charges this turn, attacks next turn",
  "Can hit target currently in Fly/Bounce, May cause Flinch (Hit)",
  "2x damage on Target using Move with Move Effect ID #256",
  "Attacks in 2 turns after all moves; ignores type effectiveness",
  "2x Damage on Pokemon using Bounce/Fly",
  "Causes flinch and 2x damage if (a) Target has used Minimize (Hit)",
  "User charges this turn, attacks next turn; instant in Sun",
  "Guaranteed hit in Rain, may Paralyze; can hit invulnerable Fly/Bounce user",
  "Flee from wild Single battle; fails in trainer battles",
  "Hits once with each healthy party member's Atk stat; Typeless",
  "User charges this turn, invulnerable until it attacks next turn",
  "Raises Def and 2x Rollout/ Ice Ball power",
  "Unused 157",
  "Causes Flinch; fails if User was on field last turn",
  "All on field unable to sleep; wakes all sleeping Pokémon",
  "Stockpile +1, raises Def and Sp. Def; Stacks up to 3",
  "Damage determined by Stockpile level",
  "Healing determined by Stockpile level",
  "Unused 163",
  "Causes Hail",
  "Target is unable to use the same attack consecutively",
  "Raises Target's Sp. Atk and causes Confusion",
  "Guaranteed Burn; activates Flash Fire",
  "KOs self and sharply lowers Target's Atk and Sp. Atk",
  "2x power when user has Poison, Paralysis, or Burn",
  "User focuses at start of turn; Fails if User takes damage",
  "2x power if target is Paralyzed; cures target of Paralysis",
  "Redirects all moves to user",
  "Calls attack depending on battle environment",
  "Raises Target Sp. Def and Target's Electric-Type attacks have 2x power next turn",
  "Target can't use status moves for 3-5 turns",
  "Ally's attack deals 1.5x damage this turn",
  "Swaps User's held item with Target's",
  "Copy Target's ability",
  "Restore 1/2 User's max HP to Target at end of next turn",
  "Use random move known by ally",
  "Heal 1/16 max HP per turn; prevents User from escaping",
  "Lowers User's Atk and Def",
  "Reflects status moves back at their user",
  "User replenishes last-used Held-Item",
  "2x power if User has been hit this turn",
  "Removes Light Screen/Reflect from Target's side of the field",
  "Causes sleep next turn",
  "Makes Target unable to use its held item",
  "Set Target's HP equal to User's",
  "Higher power the less damage User has taken",
  "Swaps User's Ability with Target's",
  "Target is prevented from using moves shared with the user",
  "Cures User of Burn, Poison, or Paralysis",
  "PP of attacker's move which causes User KO this turn is reduced to 0",
  "Snatch effect",
  "Increase power with Target's weight",
  "Secondary effect determined by battle environment",
  "1/3 damage recoil",
  "Guaranteed Confusion (Hit)",
  "High crit chance; may Burn (Hit)",
  "Halve Electric-Type move damage",
  "May Badly Poison (Hit)",
  "Changes Move Type to match weather",
  "Harshly Lowers User's Sp. Atk",
  "Lowers Atk and Def",
  "Raises User's Def and Sp. Def",
  "Can hit Target using Move with Move Effect IDs #155, #263 (Hit)",
  "Raises User's Atk and Def",
  "High crit chance, may Poison (Hit)",
  "Halves Fire-Type move damage",
  "Raises User's Sp. Atk and Sp. Def",
  "Raises User's Atk and Speed",
  "Changes User's Type to match Battle Environment",
  "Restores 1/2 max HP and loses Flying-Type",
  "Gravity effect",
  "Dark-Type Target loses Psychic immunity",
  "2x Damage if Target is asleep; Wakes Target",
  "Lowers User's Speed (Hit)",
  "Greater power the slower User is than Target",
  "KOs self and fully heals replacement",
  "2x power when Target is below 1/2 HP",
  "Power and Type determined by User's held berry; berry is consumed",
  "Can only hit Target which has used Protect/Detect this turn",
  "User consumes Target's berry and receives its effect",
  "2x Speed for User's party for 3 turns",
  "Sharply raises random stat",
  "Metal Burst effect",
  "Switches User out after dealing damage (Hit)",
  "Lowers User's Def and Sp. Def (Hit)",
  "2x Power if user moves after target",
  "2x damage if Target has already taken damage this turn",
  "Prevents the use of all items for Target",
  "Power and effect determined by User's held item",
  "Transfers User's status condition to Target",
  "Higher power the less PP the move has",
  "Blocks all sources of healing to the Target",
  "Higher power the more HP Target has",
  "Swaps Atk and Def stats",
  "Suppress Target's ability",
  "User's party immune to crits for 5 turns",
  "Fails if User moves after Target; Steals Target's move and uses it at 1.5x power",
  "User uses the last-used Move",
  "Swap Atk and Sp. Atk changes",
  "Swap Def and Sp. Def changes",
  "Higher power the more stat increases Target has",
  "Fails if User has not used all other known moves at least once",
  "Set ability to Insomnia",
  "Fails if Target selected a status move or has already moved; Moves first",
  "Sets toxic spikes; Stacks up to 2",
  "Swap stat changes",
  "Restore 1/16 max HP every turn",
  "Gives Ground immunity",
  "1/3 damage recoil and Thaws User; May cause Burn to Target (Hit)",
  "1/4 max HP recoil",
  "User charges, becomes invulnerable until attack next turn; vulnerable to Move Effect ID #257",
  "User charges, becomes invulnerable until attack next turn; vulnerable to Move Effect IDs #89, #222",
  "2x damage on targets using move with Move Effect ID #255",
  "Defog effect",
  "Reverses Turn Order for 5 turns; Ignores priority",
  "Always hits in Hail, may cause Freeze",
  "Traps Target; deals 1/16th max HP damage per turn; Can hit Targets using move with Move Effect ID #255",
  "1/3 damage recoil, may cause Paralysis (Hit)",
  "User charges, becomes invulnerable until attack next turn, may cause Paralysis",
  "Unused 264",
  "Harshly lowers Sp. Atk; fails if Target is not opposite gender",
  "Sets stealth rocks",
  "May cause Confusion; chance determined by Chatter sound sample",
  "Type matches held Plate",
  "1/2 damage recoil",
  "KOs self and Full Restores replacement",
  "May harshly lower Target's Sp. Def (Hit)",
  "User charges, becomes invulnerable until attack next turn; ignores Protect/Detect",
  "May cause Flinch and/or Burn; ignores Wonder Guard (Hit)",
  "May cause Flinch and/or Freeze (Hit)",
  "May cause Flinch and/or Paralysis (Hit)",
  "May raise User's Sp. Atk (Hit)",
];

const EVOLUTION_METHOD_NAMES = [
  "None",
  "Friendship220",
  "Friendship220_Day",
  "Friendship220_Night",
  "LevelingUp",
  "Trade",
  "Trade_HeldItem",
  "Item",
  "Atk_Greater_Def",
  "Atk_Equal_Def",
  "Def_Greater_Atk",
  "Personality1",
  "Personality2",
  "FreeSpaceCheck",
  "Shedinja",
  "BeautyThreshold",
  "ItemMale",
  "ItemFemale",
  "HeldItem_Day",
  "HeldItem_Night",
  "KnowsMove",
  "PartyPokemonPresence",
  "LevelingUp_Male",
  "LevelingUp_Female",
  "Loc_MtCoronet",
  "Loc_EternaForest",
  "Loc_Route217",
];

const EVOLUTION_PARAM_MEANING = {
  None: "Ignored",
  Friendship220: "Ignored",
  Friendship220_Day: "Ignored",
  Friendship220_Night: "Ignored",
  LevelingUp: "FromLevel",
  Trade: "Ignored",
  Trade_HeldItem: "ItemName",
  Item: "ItemName",
  Atk_Greater_Def: "FromLevel",
  Atk_Equal_Def: "FromLevel",
  Def_Greater_Atk: "FromLevel",
  Personality1: "FromLevel",
  Personality2: "FromLevel",
  FreeSpaceCheck: "FromLevel",
  Shedinja: "FromLevel",
  BeautyThreshold: "BeautyValue",
  ItemMale: "ItemName",
  ItemFemale: "ItemName",
  HeldItem_Day: "ItemName",
  HeldItem_Night: "ItemName",
  KnowsMove: "MoveName",
  PartyPokemonPresence: "PokemonName",
  LevelingUp_Male: "FromLevel",
  LevelingUp_Female: "FromLevel",
  Loc_MtCoronet: "Ignored",
  Loc_EternaForest: "Ignored",
  Loc_Route217: "Ignored",
};

const OW_3D_ENTRIES = new Set([
  91, 92, 93, 94, 95, 96, 101,
  102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116,
]);

class Reader {
  constructor(u8) {
    this.bytes = u8;
    this.dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    this.off = 0;
  }
  seek(off) { this.off = off; }
  skip(n) { this.off += n; }
  u8() { const v = this.dv.getUint8(this.off); this.off += 1; return v; }
  s8() { const v = this.dv.getInt8(this.off); this.off += 1; return v; }
  u16() { const v = this.dv.getUint16(this.off, true); this.off += 2; return v; }
  s16() { const v = this.dv.getInt16(this.off, true); this.off += 2; return v; }
  u32() { const v = this.dv.getUint32(this.off, true); this.off += 4; return v; }
  s32() { const v = this.dv.getInt32(this.off, true); this.off += 4; return v; }
}

function downloadTextFile(filename, text, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function fetchLines(path, log) {
  try {
    const url = resolveAssetUrl(path);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    return text.split(/\r?\n/);
  } catch (e) {
    if (log) log(`[warn] Failed to read ${path}: ${e?.message || e}`);
    return [];
  }
}

function normalizeName(value) {
  if (!value) return "";
  return String(value)
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+/g, "");
}

function parseNumeric(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^0x[0-9a-f]+$/i.test(raw)) {
    const parsed = Number.parseInt(raw, 16);
    return Number.isNaN(parsed) ? null : parsed;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function groupEventOverworldsByEventFileID(eventOverworlds) {
  const grouped = {};
  for (const entry of eventOverworlds) {
    const key = String(entry.EventFileID);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(entry);
  }
  return grouped;
}

function parseScriptText(text, options = {}) {
  if (!text) return null;
  const lines = text.split(/\r?\n/);

  const blocks = [];
  const commonScriptIds = Array.isArray(options.commonScriptIds) && options.commonScriptIds.length
    ? options.commonScriptIds
    : [2016, 2044];
  const commonScriptRegex = new RegExp(`^CommonScript\\s+(${commonScriptIds.join("|")})\\b`, "i");
  const byId = new Map();
  let current = null;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const scriptMatch = /^\s*Script\s+(\d+):\s*$/i.exec(line);
    const functionMatch = /^\s*Function\s+(\d+):\s*$/i.exec(line);
    if (scriptMatch || functionMatch) {
      if (current) {
        current.end = i - 1;
        blocks.push(current);
      }
      const type = scriptMatch ? "script" : "function";
      const id = Number.parseInt((scriptMatch || functionMatch)[1], 10);
      current = { type, id, start: i, end: lines.length - 1 };
      byId.set(`${type}:${id}`, current);
    }
  }
  if (current) blocks.push(current);

  const lineToBlock = new Array(lines.length).fill(null);
  for (const block of blocks) {
    for (let i = block.start; i <= block.end && i < lines.length; i += 1) {
      lineToBlock[i] = block;
    }
  }

  const reverseFunctionCallers = new Map();
  const functionRefRegex = /\b(?:Jump\w*|Call\w*)\b.*\bFunction#(\d+)\b/i;
  const useScriptRegex = /\bUseScript_#(\d+)\b/i;

  function addReverseFunctionEdge(targetFn, callerBlock) {
    if (!reverseFunctionCallers.has(targetFn)) {
      reverseFunctionCallers.set(targetFn, new Set());
    }
    reverseFunctionCallers.get(targetFn).add(callerBlock);
  }

  function directScriptTargetsForFunction(block) {
    const targets = [];
    for (let i = block.start; i <= block.end; i += 1) {
      const line = lines[i].trim();
      if (!line) continue;
      const m = useScriptRegex.exec(line);
      if (m) {
        const scriptId = Number.parseInt(m[1], 10);
        if (!Number.isNaN(scriptId)) targets.push(scriptId);
      }
    }
    return targets;
  }

  for (const block of blocks) {
    for (let i = block.start; i <= block.end; i += 1) {
      const line = lines[i].trim();
      if (!line) continue;
      const functionRef = functionRefRegex.exec(line);
      if (functionRef) {
        const targetFn = Number.parseInt(functionRef[1], 10);
        if (!Number.isNaN(targetFn)) addReverseFunctionEdge(targetFn, block);
      }
    }
  }

  function findOriginScriptForLine(lineIndex) {
    const startBlock = lineToBlock[lineIndex];
    if (!startBlock) return null;
    if (startBlock.type === "script") return startBlock.id;

    const queue = [startBlock];
    const seen = new Set([`${startBlock.type}:${startBlock.id}`]);
    while (queue.length > 0) {
      const block = queue.shift();
      if (block.type === "script") return block.id;
      for (const scriptId of directScriptTargetsForFunction(block)) {
        if (!Number.isNaN(scriptId)) return scriptId;
      }
      const callers = reverseFunctionCallers.get(block.id);
      if (!callers) continue;
      for (const caller of callers) {
        const key = `${caller.type}:${caller.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          queue.push(caller);
        }
      }
    }
    return null;
  }

  const found = [];
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) continue;

    const commonScriptMatch = commonScriptRegex.exec(line);
    if (commonScriptMatch) {
      let itemId = null;
      for (let j = i - 1; j >= 0; j -= 1) {
        const setVarMatch = /^\s*SetVar\s+0x8004\s+([^\s]+)\s*$/i.exec(lines[j]);
        if (setVarMatch) {
          itemId = parseNumeric(setVarMatch[1]);
          break;
        }
      }
      if (itemId !== null) {
        found.push({
          source: "commonScript",
          itemId,
          lineIndex: i,
          originScriptNumber: findOriginScriptForLine(i),
        });
      }
      continue;
    }

    const giveItemMatch = /^\s*GiveItem\s+([^\s,]+)[\s,]+([^\s,]+)[\s,]+([^\s,]+)/i.exec(line);
    if (giveItemMatch) {
      const var1 = giveItemMatch[1];
      if (/^ITEM_/i.test(var1)) {
        const cleaned = normalizeName(var1.replace(/^ITEM_/i, ""));
        found.push({
          source: "giveItemNamed",
          itemName: cleaned,
          lineIndex: i,
          originScriptNumber: findOriginScriptForLine(i),
        });
      }
    }
  }

  return { found };
}

function getOverworldEntityForScript(eventOverworldEntries, scriptNumber) {
  if (scriptNumber === null || scriptNumber === undefined) return null;
  const entry = eventOverworldEntries.find(
    (row) => parseNumeric(row.ScriptNumber) === parseNumeric(scriptNumber)
  );
  if (!entry) return null;
  return {
    overworldTableEntry:
      entry.OverlayTableEntry ?? entry.OverworldTableEntry ?? entry.overworldTableEntry ?? null,
    overworldIndex: entry.OverworldIndex ?? null,
    owSpriteID: entry.OwSpriteID ?? entry.owSpriteID ?? null,
    scriptNumber: parseNumeric(entry.ScriptNumber),
  };
}

function buildItemLocationIndex(groupedEventOverworlds, mapHeaders, itemNamesRaw, locationNamesRaw, scriptsTextMap, options = {}) {
  const itemData = {};
  const dedupe = new Set();
  let eventScriptCount = 0;
  let scriptParseCount = 0;
  let scriptFileFoundCount = 0;
  let scriptFileMissingCount = 0;
  function addRecord(itemNameRaw, locationRaw, payload) {
    const itemName = normalizeName(itemNameRaw);
    const locationName = normalizeName(locationRaw);
    if (!itemName || !locationName) return;

    if (!itemData[itemName]) {
      itemData[itemName] = { itemName, records: [] };
    }

    const key = [
      itemName,
      locationName,
      payload.foundMethod,
      payload.eventFileID,
      payload.headerID,
      payload.scriptFileID,
      payload.scriptNumber,
      payload.overworldTableEntry,
      payload.overworldIndex,
    ].join("|");

    if (dedupe.has(key)) return;
    dedupe.add(key);

    const record = {
      locationName,
      locationRaw,
      foundMethod: payload.foundMethod,
      headerID: payload.headerID,
      eventFileID: payload.eventFileID,
      scriptFileID: payload.scriptFileID,
      scriptNumber: payload.scriptNumber ?? null,
      overworldTableEntry: payload.overworldTableEntry ?? null,
      overworldIndex: payload.overworldIndex ?? null,
      owSpriteID: payload.owSpriteID ?? null,
      source: payload.source,
    };
    itemData[itemName].records.push(record);
    if (payload.foundMethod === "event_script_number") eventScriptCount += 1;
    if (payload.foundMethod === "script_parse") scriptParseCount += 1;
  }

  for (const mapHeader of mapHeaders) {
    const headerID = parseNumeric(mapHeader.HeaderID);
    const eventFileID = String(mapHeader.EventFileID);
    const scriptFileIDRaw = parseNumeric(mapHeader.ScriptFileID);
    const scriptFileID = scriptFileIDRaw !== null ? (scriptFileIDRaw & 0xFFFF) : null;
    const mapNameIndex = parseNumeric(mapHeader.MapNameIndexInTextArchive);

    const locationRaw =
      mapNameIndex !== null && mapNameIndex >= 0 && mapNameIndex < locationNamesRaw.length
        ? locationNamesRaw[mapNameIndex]
        : `unknown_location_${mapNameIndex}`;

    const eventEntries = groupedEventOverworlds[eventFileID] || [];

    for (const entry of eventEntries) {
      const scriptNumber = parseNumeric(entry.ScriptNumber);
      if (scriptNumber === null) continue;
      if (scriptNumber >= 7000 && scriptNumber < 8000) {
        const itemIndex = scriptNumber - 7000;
        if (itemIndex >= 0 && itemIndex < itemNamesRaw.length) {
          const itemRaw = itemNamesRaw[itemIndex];
          addRecord(itemRaw, locationRaw, {
            foundMethod: "event_script_number",
            source: "event_overworld",
            headerID,
            eventFileID,
            scriptFileID,
            scriptNumber,
            overworldTableEntry:
              entry.OverlayTableEntry ?? entry.OverworldTableEntry ?? entry.overworldTableEntry ?? null,
            overworldIndex: entry.OverworldIndex ?? null,
            owSpriteID: entry.OwSpriteID ?? entry.owSpriteID ?? null,
          });
        }
      }
    }

    if (scriptFileID === null) continue;
    const scriptText = scriptsTextMap.get(scriptFileID);
    if (scriptText) scriptFileFoundCount += 1;
    else scriptFileMissingCount += 1;
    const parsed = parseScriptText(scriptText, { commonScriptIds: options.commonScriptIds });
    if (!parsed) continue;

    for (const found of parsed.found) {
      let itemRaw = null;
      if (found.source === "commonScript") {
        const idx = found.itemId;
        if (idx !== null && idx >= 0 && idx < itemNamesRaw.length) {
          itemRaw = itemNamesRaw[idx];
        }
      } else if (found.source === "giveItemNamed") {
        itemRaw = found.itemName;
      }
      if (!itemRaw) continue;

      const ow = getOverworldEntityForScript(eventEntries, found.originScriptNumber);
      addRecord(itemRaw, locationRaw, {
        foundMethod: "script_parse",
        source: found.source,
        headerID,
        eventFileID,
        scriptFileID,
        scriptNumber: found.originScriptNumber,
        overworldTableEntry: ow ? ow.overworldTableEntry : null,
        overworldIndex: ow ? ow.overworldIndex : null,
        owSpriteID: ow ? ow.owSpriteID : null,
      });
    }
  }

  const byItem = Object.keys(itemData)
    .sort()
    .reduce((acc, key) => {
      acc[key] = itemData[key].records;
      return acc;
    }, {});

  return {
    byItem,
    totalItems: Object.keys(byItem).length,
    totalRecords: Object.values(byItem).reduce((sum, list) => sum + list.length, 0),
    stats: { eventScriptCount, scriptParseCount, scriptFileFoundCount, scriptFileMissingCount },
  };
}

function normName(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeDesc(s) {
  if (s == null) return "";
  return String(s)
    .replace(/\\xE000/g, " ")
    .replace(/\uE000/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCaseWord(s) {
  if (s == null) return "";
  const lower = String(s).trim().toLowerCase();
  return lower ? lower[0].toUpperCase() + lower.slice(1) : "";
}

function titleCaseType(s) {
  if (s == null) return "";
  const lower = String(s).trim().toLowerCase();
  return lower ? lower[0].toUpperCase() + lower.slice(1) : "";
}

function parseBool(raw) {
  if (typeof raw === "boolean") return raw;
  const cleaned = String(raw).trim().replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
  if (cleaned === "true" || cleaned === "1") return true;
  return false;
}

function parseEvolutionCell(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  if (!s) return null;
  if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);
  const parts = s.split("|");
  if (parts.length < 3) return null;
  return { method: parts[0], param: parts[1], target: parts[2] };
}

function mapEvoMethod(method) {
  const m = String(method || "");
  if (m.includes("Friendship")) return "levelFriendship";
  if (m.includes("Trade")) return "trade";
  if (m === "Item") return "useItem";
  if (m.includes("KnowsMove")) return "levelMove";
  if (m.includes("LevelingUp")) return "level";
  return "levelExtra";
}

function normalizeEvoParam(raw) {
  if (raw == null) return "";
  const param = String(raw).trim();
  if (!param || param.toLowerCase() === "ignored" || param === "-") return "";
  if (/^\d+$/.test(param)) return Number(param);
  return param;
}

function buildSpeciesData(personalData, learnsetData, evolutionData, tmhmData) {
  const evoByName = new Map();
  const preEvoByTarget = new Map();

  for (let i = 0; i < evolutionData.length; i += 1) {
    const evoEntry = evolutionData[i];
    if (!evoEntry || !evoEntry.Name || evoEntry.Name === "-----") continue;
    const parsed = parseEvolutionCell(evoEntry["[Method|Param|Target]"]);
    if (!parsed) continue;
    const mappedMethod = mapEvoMethod(parsed.method);
    const param = normalizeEvoParam(parsed.param);
    const target = String(parsed.target).trim();
    if (!target) continue;

    evoByName.set(evoEntry.Name, { target, method: mappedMethod, param });

    if (!preEvoByTarget.has(target)) {
      preEvoByTarget.set(target, { method: mappedMethod, param });
    }
  }

  const out = {};
  for (let i = 0; i < personalData.length; i += 1) {
    const entry = personalData[i];
    if (!entry || !entry.Name || entry.Name === "-----") continue;

    const name = String(entry.Name).trim();
    const num = Number(entry.ID);
    const type1 = titleCaseType(entry.Type1);
    const type2 = titleCaseType(entry.Type2);
    const types = type2 && type2 !== type1 ? [type1, type2] : [type1];

    const item1 = String(entry.Item1 || "").trim() || "None";
    const item2 = String(entry.Item2 || "").trim() || "None";

    const bs = {
      hp: Number(String(entry.BaseHP || "0").trim()),
      at: Number(String(entry.BaseAttack || "0").trim()),
      df: Number(String(entry.BaseDefense || "0").trim()),
      sa: Number(String(entry.BaseSpecialAttack || "0").trim()),
      sd: Number(String(entry.BaseSpecialDefense || "0").trim()),
      sp: Number(String(entry.BaseSpeed || "0").trim()),
    };

    const learnsetEntry = learnsetData[i] || {};
    const learnset = [];
    const levelKeys = Object.keys(learnsetEntry)
      .filter((k) => k.startsWith("LevelMove"))
      .sort((a, b) => {
        const an = Number(a.replace("LevelMove", ""));
        const bn = Number(b.replace("LevelMove", ""));
        return an - bn;
      });
    for (const key of levelKeys) {
      const raw = String(learnsetEntry[key] || "").trim();
      if (!raw) continue;
      const parts = raw.split("|");
      if (parts.length < 2) continue;
      const levelStr = String(parts[0]).trim();
      const moveName = String(parts.slice(1).join("|")).trim();
      if (!moveName) continue;
      const level = /^\d+$/.test(levelStr) ? Number(levelStr) : levelStr;
      learnset.push([level, moveName]);
    }

    const tmEntry = tmhmData[i] || {};
    const tms = [];
    for (const key of Object.keys(tmEntry)) {
      if (key === "ID" || key === "Name") continue;
      if (!parseBool(tmEntry[key])) continue;
      const moveName = key.includes(" - ") ? key.split(" - ", 2)[1] : key;
      tms.push(String(moveName).trim());
    }

    const ability1 = String(entry.Ability1 || "").trim();
    let ability2 = String(entry.Ability2 || "").trim();
    if (!ability2 || ability2 === "-") ability2 = "-";
    let ability3 = String(entry.Ability3 || "").trim();
    if (!ability3 || ability3 === "-") ability3 = "-";
    const abs = [ability1 || "-", ability2, ability3];

    const species = {
      name,
      num,
      types,
      items: [item1, item2, null],
      bs,
      learnset_info: { learnset, tms },
      abs,
    };

    const evoInfo = evoByName.get(name);
    if (evoInfo) {
      species.evos = [evoInfo.target];
      species.evoMethods = [evoInfo.method];
      species.evoParams = [evoInfo.param];
    }

    const preEvoInfo = preEvoByTarget.get(name);
    if (preEvoInfo) {
      species.evoType = preEvoInfo.method;
      if (preEvoInfo.method === "level" || preEvoInfo.method === "levelExtra") {
        if (typeof preEvoInfo.param === "number") species.evoLevel = preEvoInfo.param;
      } else if (preEvoInfo.method === "useItem") {
        if (preEvoInfo.param !== "") species.evoItem = String(preEvoInfo.param);
      } else if (preEvoInfo.method === "levelMove") {
        if (preEvoInfo.param !== "") species.evoMove = String(preEvoInfo.param);
      }
    }

    out[name] = species;
  }

  return out;
}

function buildMovesData(moveData) {
  const out = {};
  for (const entry of moveData) {
    if (!entry) continue;
    const name = String(entry["Move Name"] || "").trim();
    const rawId = Number(String(entry["Move ID"] || "").trim());
    if (!name || name === "-" || !Number.isFinite(rawId) || rawId <= 0) continue;

    const move = {
      t: titleCaseType(entry["Move Type"]),
      bp: Number(String(entry.Power || "0").trim()),
      cat: titleCaseWord(entry["Move Split"]),
      pp: Number(String(entry.PP || "0").trim()),
      acc: Number(String(entry.Accuracy || "0").trim()),
      prio: Number(String(entry.Priority || "0").trim()),
      name,
      num: rawId - 1,
      e_id: 0,
    };
    out[name] = move;
  }
  return out;
}

function toID(text) {
  let value = text;
  if (value != null && value.id) {
    value = value.id;
  } else if (value != null && value.userid) {
    value = value.userid;
  }
  if (typeof value !== "string" && typeof value !== "number") return "";
  return ("" + value)
    .toLowerCase()
    .replace(/é/g, "e")
    .replace(/[^a-z0-9]+/g, "");
}

function buildOverridesAndSearchIndex(data, options) {
  const log = options?.log;
  const gameName = (options?.gameName || data.romId || "rom").toLowerCase();

  const moveData = parseCsvLines(data.csv.moves);
  const personalData = parseCsvLines(data.csv.pokemonPersonal);
  const learnsetData = parseCsvLines(data.csv.learnsets);
  const evolutionData = parseCsvLines(data.csv.evolutions);
  const tmhmData = parseCsvLines(data.csv.tmhm);
  const mapHeaders = parseCsvLines(data.csv.mapHeaders);
  const eventOverworlds = parseCsvLines(data.csv.eventOverworlds);
  if (log) {
    log(`Parsed CSV rows: mapHeaders=${mapHeaders.length}, eventOverworlds=${eventOverworlds.length}`);
    if (mapHeaders.length > 0) {
      log(`MapHeaders sample: ${JSON.stringify(mapHeaders[0])}`);
    }
    if (eventOverworlds.length > 0) {
      log(`EventOverworlds sample: ${JSON.stringify(eventOverworlds[0])}`);
    }
    log(`Scripts parsed: ${data.scriptsTextMap ? data.scriptsTextMap.size : 0}`);
    log(`Text banks: items=${data.texts.itemNames?.length ?? 0}, itemDesc=${data.texts.itemDescriptions?.length ?? 0}, abilities=${data.texts.abilityNames?.length ?? 0}, moves=${data.texts.moveNames?.length ?? 0}`);
  }

  const groupedEventOverworlds = groupEventOverworldsByEventFileID(eventOverworlds);
  const commonScriptIds = data.family === "HGSS" ? [2033, 2009] : [2016, 2044];
  const itemLocations = buildItemLocationIndex(
    groupedEventOverworlds,
    mapHeaders,
    data.texts.itemNames,
    data.texts.locationNames,
    data.scriptsTextMap,
    { commonScriptIds }
  );
  if (log) {
    log(`Item locations: ${itemLocations.totalRecords} records, ${itemLocations.totalItems} items (event=${itemLocations.stats.eventScriptCount}, script=${itemLocations.stats.scriptParseCount}).`);
    log(`Script files: found=${itemLocations.stats.scriptFileFoundCount}, missing=${itemLocations.stats.scriptFileMissingCount}`);
    if (!data.scriptsTextMap || data.scriptsTextMap.size === 0) {
      log("[warn] No script text files parsed; script-based item locations will be missing.");
    }
  }

  const movesData = buildMovesData(moveData);
  const speciesData = buildSpeciesData(personalData, learnsetData, evolutionData, tmhmData);

  return fetchLines("./vanilla_texts/moves.txt", log).then((vanillaMoves) =>
    fetchLines("./vanilla_texts/ability_descriptions.txt", log).then((vanillaAbilityDesc) =>
      fetchLines("./vanilla_texts/move_descriptions.txt", log).then((vanillaDesc) => {
        const textsAbilities = data.texts.abilityNames;
        const textsItems = data.texts.itemNames;
        const textsMoves = data.texts.moveNames;
        const textsAbilityDesc = data.texts.abilityDescriptions;
        const textsItemDesc = data.texts.itemDescriptions;
        const textsLocations = data.texts.locationNames;
        const textsDesc = data.texts.moveDescriptions;

        if (textsMoves.length !== vanillaMoves.length) {
          if (log) log(`[warn] moves.txt length mismatch: ${textsMoves.length} vs ${vanillaMoves.length}`);
        }
        if (textsDesc.length !== vanillaDesc.length) {
          if (log) log(`[warn] move_descriptions length mismatch: ${textsDesc.length} vs ${vanillaDesc.length}`);
        }
        if (textsAbilityDesc.length !== vanillaAbilityDesc.length) {
          if (log) log(`[warn] ability_descriptions length mismatch: ${textsAbilityDesc.length} vs ${vanillaAbilityDesc.length}`);
        }
        if (textsItems.length !== textsItemDesc.length) {
          if (log) log(`[warn] items length mismatch: ${textsItems.length} vs ${textsItemDesc.length}`);
        }

        const nameMismatches = new Set();
        for (const move of Object.values(movesData)) {
          const num = move.num;
          const idx = num + 1;
          if (idx < textsMoves.length && idx < vanillaMoves.length) {
            const t = textsMoves[idx];
            const v = vanillaMoves[idx];
            if (normName(t) !== normName(v)) nameMismatches.add(num);
          }
        }

        const outMoves = {};
        for (const [key, move] of Object.entries(movesData)) {
          const num = move.num;
          const idx = num + 1;
          const desc = idx < textsDesc.length ? normalizeDesc(textsDesc[idx]) : "-";
          const oldDesc = idx < vanillaDesc.length ? normalizeDesc(vanillaDesc[idx]) : "-";
          const nextMove = { ...move, desc };
          if (!nameMismatches.has(num) && oldDesc !== desc) {
            nextMove.oldDesc = oldDesc;
          }
          outMoves[key] = nextMove;
        }

        const abilitiesOut = {};
        const maxAbilities = Math.min(textsAbilities.length, textsAbilityDesc.length);
        for (let i = 0; i < maxAbilities; i += 1) {
          const name = textsAbilities[i];
          const key = normName(name);
          if (!key) continue;
          const desc = normalizeDesc(textsAbilityDesc[i]);
          if (!desc) continue;

          const oldDesc = normalizeDesc(vanillaAbilityDesc[i]);
          const entry = { name, desc };
          if (oldDesc && oldDesc !== desc) entry.oldDesc = oldDesc;
          abilitiesOut[key] = entry;
        }

        const itemToWilds = {};
        for (const [pokeKey, poke] of Object.entries(speciesData)) {
          const itemList = Array.isArray(poke.items)
            ? poke.items
            : Array.isArray(poke.item)
              ? poke.item
              : [];
          for (const rawItem of itemList) {
            if (!rawItem || rawItem === "None") continue;
            if (!itemToWilds[rawItem]) itemToWilds[rawItem] = new Set();
            itemToWilds[rawItem].add(poke.name || pokeKey);
          }
        }

        const itemsOut = {};
        const byItem = itemLocations && itemLocations.byItem ? itemLocations.byItem : {};
        for (let i = 0; i < textsItems.length; i += 1) {
          const name = textsItems[i];
          const key = normName(name);
          if (!key) continue;

          const desc = normalizeDesc(textsItemDesc[i]);
          if (!desc) continue;

          const entry = { name, desc };

          const locationRecords = byItem[key] || [];
          const ground = new Set();
          const npcs = [];
          const npcKeySet = new Set();

          for (const record of locationRecords) {
            if (record.foundMethod === "event_script_number" && record.locationName) {
              ground.add(record.locationName);
            } else if (record.foundMethod === "script_parse" && record.locationName) {
              if (record.owSpriteID !== null && record.owSpriteID !== undefined) {
                const spriteID = Number.parseInt(record.owSpriteID, 10);
                const orientation = 0;
                const npcKey = `${spriteID}|${record.locationName}|${orientation}`;
                if (!npcKeySet.has(npcKey)) {
                  npcKeySet.add(npcKey);
                  npcs.push({ spriteID, location: record.locationName, orientation });
                }
              }
            }
          }

          const wildSet = itemToWilds[name];
          if (ground.size > 0) entry.ground_locations = Array.from(ground);
          if (wildSet && wildSet.size > 0) entry.wilds = Array.from(wildSet);
          if (npcs.length > 0) entry.npcs = npcs;
          itemsOut[key] = entry;
        }

        const isHGSS = data.family === "HGSS";
        const grassRates = [20, 20, 10, 10, 10, 10, 5, 5, 4, 4, 1, 1];
        const surfRates = [60, 30, 5, 4, 1];

        const encounterTypes = isHGSS
          ? [
              "grass",
              "surf",
              "old_rod",
              "good_rod",
              "super_rod",
              "rock_smash",
              "swarm",
              "time_day",
              "time_night",
              "hoenn_music",
              "sinnoh_music",
            ]
          : [
              "grass",
              "surf",
              "old_rod",
              "good_rod",
              "super_rod",
              "radar",
              "swarm",
              "time_day",
              "time_night",
              "dual_ruby",
              "dual_sapphire",
              "dual_emerald",
              "dual_fire_red",
              "dual_leaf_green",
            ];

        const defaultRates = isHGSS
          ? {
              grass: grassRates,
              surf: surfRates,
              old_rod: surfRates,
              good_rod: surfRates,
              super_rod: surfRates,
              rock_smash: [90, 10],
              swarm: grassRates.slice(0, 4),
              time_day: grassRates,
              time_night: grassRates,
              hoenn_music: [20, 20],
              sinnoh_music: [20, 20],
            }
          : {
              grass: grassRates,
              surf: surfRates,
              old_rod: [60, 30, 5, 4, 1],
              good_rod: [40, 40, 15, 4, 1],
              super_rod: [40, 40, 15, 4, 1],
              radar: [10, 10, 1, 1],
              swarm: [20, 20],
              time_day: [10, 10],
              time_night: [10, 10],
              dual_ruby: [4, 4],
              dual_sapphire: [4, 4],
              dual_emerald: [4, 4],
              dual_fire_red: [4, 4],
              dual_leaf_green: [4, 4],
            };

        const fileIdToLocation = new Map();
        const nameToCount = new Map();
        for (const header of mapHeaders) {
          const wildId = Number.parseInt(header.WildPokemonFileID, 10);
          if (!Number.isFinite(wildId) || wildId === 65535) continue;
          if (fileIdToLocation.has(wildId)) continue;
          const idx = Number.parseInt(header.MapNameIndexInTextArchive, 10);
          let baseName =
            Number.isFinite(idx) && idx >= 0 && idx < textsLocations.length
              ? textsLocations[idx]
              : `unknown_${wildId}`;
          if (!baseName) baseName = `unknown_${wildId}`;
          const count = (nameToCount.get(baseName) || 0) + 1;
          nameToCount.set(baseName, count);
          const name = count > 1 ? `${baseName} Section ${count}` : baseName;
          fileIdToLocation.set(wildId, name);
        }

        function makeEncEntry(record) {
          if (!record || record.speciesName === "-----") return null;
          const mn =
            record.minLv !== undefined && record.minLv !== null
              ? record.minLv
              : record.level !== undefined && record.level !== null
                ? record.level
                : 0;
          return { s: record.speciesName, mn };
        }

        const locationsOut = {};
        const encounterList = Array.isArray(data.encounters)
          ? data.encounters
          : [];

        for (const entry of encounterList) {
          if (!entry || entry.blank) continue;
          const fileId = entry.fileId;
          const rawName = fileIdToLocation.get(fileId) || `unknown_${fileId}`;
          const key = normName(rawName);
          if (!key) continue;

          const loc = { name: rawName };
          for (const type of encounterTypes) {
            loc[type] = { encs: [] };
          }

        if (Array.isArray(entry.walking)) {
          for (const rec of entry.walking) {
            const enc = makeEncEntry(rec);
            if (enc) loc.grass.encs.push(enc);
          }
        } else if (entry.grass && Array.isArray(entry.walkingLevels)) {
          const grassList = Array.isArray(entry.grass.day)
            ? entry.grass.day
            : Array.isArray(entry.grass.morning)
              ? entry.grass.morning
              : Array.isArray(entry.grass.night)
                ? entry.grass.night
                : [];
          for (let idx = 0; idx < grassList.length; idx += 1) {
            const rec = grassList[idx];
            if (!rec) continue;
            const level = entry.walkingLevels[idx] ?? 0;
            const enc = makeEncEntry({ ...rec, level });
            if (enc) loc.grass.encs.push(enc);
          }
          if (Array.isArray(entry.grass.day)) {
            for (let idx = 0; idx < entry.grass.day.length; idx += 1) {
              const rec = entry.grass.day[idx];
              if (!rec) continue;
              const level = entry.walkingLevels[idx] ?? 0;
              const enc = makeEncEntry({ ...rec, level });
              if (enc) loc.time_day.encs.push(enc);
            }
          }
          if (Array.isArray(entry.grass.night)) {
            for (let idx = 0; idx < entry.grass.night.length; idx += 1) {
              const rec = entry.grass.night[idx];
              if (!rec) continue;
              const level = entry.walkingLevels[idx] ?? 0;
              const enc = makeEncEntry({ ...rec, level });
              if (enc) loc.time_night.encs.push(enc);
            }
          }
        }
        if (Array.isArray(entry.surf)) {
          for (const rec of entry.surf) {
            const enc = makeEncEntry(rec);
            if (enc) loc.surf.encs.push(enc);
          }
        }
        if (Array.isArray(entry.rockSmash)) {
          for (const rec of entry.rockSmash) {
            const enc = makeEncEntry(rec);
            if (enc) loc.rock_smash.encs.push(enc);
          }
        }
          if (Array.isArray(entry.oldRod)) {
            for (const rec of entry.oldRod) {
              const enc = makeEncEntry(rec);
              if (enc) loc.old_rod.encs.push(enc);
            }
          }
          if (Array.isArray(entry.goodRod)) {
            for (const rec of entry.goodRod) {
              const enc = makeEncEntry(rec);
              if (enc) loc.good_rod.encs.push(enc);
            }
          }
          if (Array.isArray(entry.superRod)) {
            for (const rec of entry.superRod) {
              const enc = makeEncEntry(rec);
              if (enc) loc.super_rod.encs.push(enc);
            }
          }
          if (Array.isArray(entry.radar)) {
            for (const rec of entry.radar) {
              const enc = makeEncEntry(rec);
              if (enc) loc.radar.encs.push(enc);
            }
          }
        if (Array.isArray(entry.swarms)) {
          for (const rec of entry.swarms) {
            const enc = makeEncEntry(rec);
            if (enc) loc.swarm.encs.push(enc);
          }
        }

        if (entry.pokegearMusic) {
          const hoenn = Array.isArray(entry.pokegearMusic.hoenn) ? entry.pokegearMusic.hoenn : [];
          const sinnoh = Array.isArray(entry.pokegearMusic.sinnoh) ? entry.pokegearMusic.sinnoh : [];
          for (const rec of hoenn) {
            const enc = makeEncEntry(rec);
            if (enc) loc.hoenn_music.encs.push(enc);
          }
          for (const rec of sinnoh) {
            const enc = makeEncEntry(rec);
            if (enc) loc.sinnoh_music.encs.push(enc);
          }
        }

          if (entry.timeSpecific) {
            const day = Array.isArray(entry.timeSpecific.day) ? entry.timeSpecific.day : [];
            for (const rec of day) {
              const enc = makeEncEntry(rec);
              if (enc) loc.time_day.encs.push(enc);
            }
            const night = Array.isArray(entry.timeSpecific.night) ? entry.timeSpecific.night : [];
            for (const rec of night) {
              const enc = makeEncEntry(rec);
              if (enc) loc.time_night.encs.push(enc);
            }
          }

          if (entry.dualSlot) {
            const dualMap = [
              ["ruby", "dual_ruby"],
              ["sapphire", "dual_sapphire"],
              ["emerald", "dual_emerald"],
              ["fireRed", "dual_fire_red"],
              ["leafGreen", "dual_leaf_green"],
            ];
            for (const [srcKey, destKey] of dualMap) {
              const list = Array.isArray(entry.dualSlot[srcKey]) ? entry.dualSlot[srcKey] : [];
              for (const rec of list) {
                const enc = makeEncEntry(rec);
                if (enc) loc[destKey].encs.push(enc);
              }
            }
          }

          locationsOut[key] = loc;
        }

        const ratesOut = {};
        for (const type of encounterTypes) {
          if (isHGSS && type === "swarm") continue;
          ratesOut[type] = defaultRates[type] || [];
        }
        locationsOut.rates = ratesOut;
        if (log && locationsOut.rates) {
          log(`Overrides encs.rates: ${JSON.stringify(locationsOut.rates)}`);
        }

        const overrides = {
          poks: speciesData,
          encs: locationsOut,
          moves: outMoves,
          items: itemsOut,
          abilities: abilitiesOut,
        };

        if (log) {
          const itemKeys = Object.keys(itemsOut);
          log(`Overrides counts: poks=${Object.keys(speciesData).length}, moves=${Object.keys(outMoves).length}, items=${itemKeys.length}, abilities=${Object.keys(abilitiesOut).length}`);
          if (itemKeys.length <= 5) {
            log(`Item keys sample: ${JSON.stringify(itemKeys)}`);
          } else {
            log(`Item keys sample: ${JSON.stringify(itemKeys.slice(0, 5))}`);
          }
          const rawItemNames = data.texts.itemNames || [];
          const sampleNames = rawItemNames.slice(0, 10).map((x) => String(x || "").trim());
          log(`Item names sample[0..9]: ${JSON.stringify(sampleNames)}`);
        }

        const aliases = window.BattleAliases || {};
        const typeChart = window.BattleTypeChart || {};
        if (!typeChart || Object.keys(typeChart).length === 0) {
          if (log) log("[warn] Type chart not loaded; search index counts may be incomplete.");
        }

        function getItem(collection, str) {
          if (collection[str]) return collection[str];
          if (aliases[str]) return { name: collection[aliases[str]] };
          return { name: str };
        }

        let index = [];
        index = index.concat(Object.keys(speciesData).map((x) => normalizeName(x) + " pokemon"));
        index = index.concat(Object.keys(outMoves).map((x) => normalizeName(x) + " move"));
        index = index.concat(Object.keys(itemsOut).map((x) => x + " item"));
        index = index.concat(Object.keys(abilitiesOut).map((x) => x + " ability"));
        index = index.concat(Object.keys(typeChart).map((x) => toID(x) + " type"));
        index = index.concat(Object.keys(locationsOut).map((x) => toID(x) + " location"));
        index = index.concat(["physical", "special", "status"].map((x) => toID(x) + " category"));

        const compoundTable = aliases;
        function generateAlias(id, name, type) {
          name = compoundTable[id] || name;
          if (type === "pokemon" && !compoundTable[id]) {
            const species = speciesData[id];
            const baseid = toID(species.baseSpecies);
            if (baseid !== id) {
              name = (compoundTable[baseid] || species.baseSpecies) + " " + species.forme;
            }
          }
          if (name.endsWith(" Mega-X") || name.endsWith(" Mega-Y")) {
            index.push("mega" + toID(name.slice(0, -7) + name.slice(-1)) + " " + type + " " + id + " 0");
            index.push("m" + toID(name.slice(0, -7) + name.slice(-1)) + " " + type + " " + id + " 0");
            index.push("mega" + toID(name.slice(-1)) + " " + type + " " + id + " " + toID(name.slice(0, -7)).length);
          } else if (name.endsWith(" Mega")) {
            index.push("mega" + toID(name.slice(0, -5)) + " " + type + " " + id + " 0");
            index.push("m" + toID(name.slice(0, -5)) + " " + type + " " + id + " 0");
          } else if (name.endsWith(" Alola")) {
            index.push("alolan" + toID(name.slice(0, -6)) + " " + type + " " + id + " 0");
          } else if (name.endsWith(" Galar")) {
            index.push("galarian" + toID(name.slice(0, -6)) + " " + type + " " + id + " 0");
          } else if (name.endsWith(" Hisui")) {
            index.push("hisuian" + toID(name.slice(0, -6)) + " " + type + " " + id + " 0");
          }
          const fullSplit = name.split(/ |-/).map(toID);
          if (fullSplit.length < 2) return;
          const fullAcronym = fullSplit.map((x) => x.charAt(0)).join("") + fullSplit.at(-1).slice(1);
          index.push("" + fullAcronym + " " + type + " " + id + " 0");
          for (let i = 1; i < fullSplit.length; i += 1) {
            index.push("" + fullSplit.slice(i).join("") + " " + type + " " + id + " " + fullSplit.slice(0, i).join("").length);
          }
          const spaceSplit = name.split(" ").map(toID);
          if (spaceSplit.length !== fullSplit.length) {
            const spaceAcronym = spaceSplit.map((x) => x.charAt(0)).join("") + spaceSplit.at(-1).slice(1);
            if (spaceAcronym !== fullAcronym) index.push("" + spaceAcronym + " " + type + " " + id + " 0");
          }
        }

        for (const id in speciesData) {
          const name = speciesData[id].name;
          if (speciesData[id].isCosmeticForme) continue;
          generateAlias(id, name, "pokemon");
        }
        for (const id in outMoves) {
          const name = outMoves[id].name;
          generateAlias(id, name, "move");
        }
        for (const id in itemsOut) {
          const name = itemsOut[id].name;
          generateAlias(id, name, "item");
        }
        for (const id in abilitiesOut) {
          const name = abilitiesOut[id].name;
          generateAlias(id, name, "ability");
        }
        for (const id in locationsOut) {
          if (id === "rates") continue;
          const name = locationsOut[id].name;
          generateAlias(id, name, "location");
        }

        const ultraBeasts = {
          ub01symbiont: "nihilego",
          ub02absorption: "buzzwole",
          ub02beauty: "pheromosa",
          ub03lightning: "xurkitree",
          ub04blade: "kartana",
          ub04blaster: "celesteela",
          ub05glutton: "guzzlord",
          ubburst: "blacephalon",
          ubassembly: "stakataka",
          ubadhesive: "poipole",
          ubstinger: "naganadel",
        };
        for (const [ubCode, id] of Object.entries(ultraBeasts)) {
          index.push(`${ubCode} pokemon ${id} 0`);
        }

        index.sort();
        if (index.indexOf("grass type") !== -1 && index.indexOf("grass egggroup") !== -1) {
          index[index.indexOf("grass type")] = "grass egggroup";
          index[index.indexOf("grass egggroup")] = "grass type";
        }
        if (index.indexOf("fairy type") !== -1 && index.indexOf("fairy egggroup") !== -1) {
          index[index.indexOf("fairy type")] = "fairy egggroup";
          index[index.indexOf("fairy egggroup")] = "fairy type";
        }
        if (index.indexOf("flying type") !== -1 && index.indexOf("flying egggroup") !== -1) {
          index[index.indexOf("flying type")] = "flying egggroup";
          index[index.indexOf("flying egggroup")] = "flying type";
        }
        if (index.indexOf("dragon type") !== -1 && index.indexOf("dragon egggroup") !== -1) {
          index[index.indexOf("dragon type")] = "dragon egggroup";
          index[index.indexOf("dragon egggroup")] = "dragon type";
        }
        if (index.indexOf("bug type") !== -1 && index.indexOf("bug egggroup") !== -1) {
          index[index.indexOf("bug type")] = "bug egggroup";
          index[index.indexOf("bug egggroup")] = "bug type";
        }
        if (index.indexOf("psychic type") !== -1 && index.indexOf("psychic move") !== -1) {
          index[index.indexOf("psychic type")] = "psychic move";
          index[index.indexOf("psychic move")] = "psychic type";
        }
        if (index.indexOf("ditto pokemon") !== -1 && index.indexOf("ditto egggroup") !== -1) {
          index[index.indexOf("ditto pokemon")] = "ditto egggroup";
          index[index.indexOf("ditto egggroup")] = "ditto pokemon";
        }

        const BattleSearchIndex = index.map((x) => {
          const parts = x.split(" ");
          if (parts.length > 3) {
            parts[3] = Number(parts[3]);
            parts[2] = index.indexOf(parts[2] + " " + parts[1]);
          }
          return parts;
        });

        const BattleSearchIndexOffset = BattleSearchIndex.map((entry) => {
          const id = entry[0];
          let name = "";
          switch (entry[1]) {
            case "pokemon": name = getItem(speciesData, id).name || id; break;
            case "move": name = getItem(outMoves, id).name || id; break;
            case "item": name = getItem(itemsOut, id).name || id; break;
            case "ability": name = getItem(abilitiesOut, id).name || id; break;
            case "location": name = getItem(locationsOut, id).name || id; break;
            case "article": name = "" || ""; break;
          }
          let res = "";
          let nonAlnum = 0;
          for (let i = 0, j = 0; i < id.length; i += 1, j += 1) {
            while (!/[a-zA-Z0-9]/.test(name[j])) {
              j += 1;
              nonAlnum += 1;
            }
            res += nonAlnum;
          }
          if (nonAlnum) return res;
          return "";
        });

        const BattleSearchCountIndex = {};
        for (const type in typeChart) {
          BattleSearchCountIndex[type + " move"] = Object.keys(outMoves)
            .filter((id) => (outMoves[id].type === type)).length;
        }
        for (const type in typeChart) {
          BattleSearchCountIndex[type + " pokemon"] = Object.keys(speciesData)
            .filter((id) => (!speciesData[id].isCosmeticForme && speciesData[id].types.indexOf(type) >= 0)).length;
        }

        let searchBuf = "// DO NOT EDIT - automatically built with build-tools/build-indexes\n\n";
        searchBuf += "exports.BattleSearchIndex = " + JSON.stringify(BattleSearchIndex) + ";\n\n";
        searchBuf += "exports.BattleSearchIndexOffset = " + JSON.stringify(BattleSearchIndexOffset) + ";\n\n";
        searchBuf += "exports.BattleSearchCountIndex = " + JSON.stringify(BattleSearchCountIndex) + ";\n\n";
        searchBuf += "exports.BattleArticleTitles = {};\n\n";

        return {
          gameName,
          overrides,
          searchIndex: BattleSearchIndex,
          searchIndexOffset: BattleSearchIndexOffset,
          searchIndexCount: BattleSearchCountIndex,
          itemLocationStats: itemLocations.stats,
        };
      })
    )
  );
}

export async function buildOverridesFromRom(arrayBuffer, { log } = {}) {
  const u8 = new Uint8Array(arrayBuffer);
  const editor = new RomBrowser(u8);
  const header = editor.readHeader();
  const titleRaw = new TextDecoder("ascii").decode(u8.subarray(0x00, 0x0C));
  const romTitle = titleRaw.replace(/\0/g, "").trim() || header.romId;
  const data = await collectDspreData(editor, { log: log || (() => {}) });
  const built = await buildOverridesAndSearchIndex(data, { log });
  return {
    overrides: built.overrides,
    searchIndex: built.searchIndex,
    searchIndexOffset: built.searchIndexOffset,
    searchIndexCount: built.searchIndexCount,
    itemLocationStats: built.itemLocationStats || null,
    texts: data.texts,
    romTitle,
    romFamily: data.family,
    romVersion: data.version,
  };
}

export async function readRomFileByPath(arrayBuffer, path) {
  const editor = new RomBrowser(new Uint8Array(arrayBuffer));
  const file = editor.readFileByPath(path);
  return file.fileBuffer;
}

function detectGame(romId) {
  if (GAME_IDS.Platinum.includes(romId)) return { family: "Plat", version: "Platinum" };
  if (GAME_IDS.HeartGold.includes(romId)) return { family: "HGSS", version: "HeartGold" };
  if (GAME_IDS.SoulSilver.includes(romId)) return { family: "HGSS", version: "SoulSilver" };
  return null;
}

async function readTextFallback(path) {
  try {
    const url = resolveAssetUrl(path);
    const res = await fetch(url);
    if (!res.ok) return [];
    const text = await res.text();
    return text.split(/\r?\n/);
  } catch {
    return [];
  }
}

function parseTextBank(u8) {
  const model = parseGen4MsgBank(u8, { symbols: GEN4_SYMBOLS });
  return model.entries.map((e) => e.text ?? "");
}

function appendForms(baseNames, totalCount) {
  const extraCount = totalCount - baseNames.length;
  if (extraCount <= 0) return baseNames.slice();

  const extraNames = [];
  for (let i = 0; i < extraCount && i < PERSONAL_EXTRA_FORMS.length; i += 1) {
    const extra = PERSONAL_EXTRA_FORMS[i];
    const base = baseNames[extra.monId] ?? `UNKNOWN_${extra.monId}`;
    extraNames.push(`${base} - ${extra.description}`);
  }
  return baseNames.concat(extraNames);
}

function csvLine(values) {
  return values.join(",");
}

function normalizeTypeName(name) {
  if (name === "???") return "Fairy";
  return name;
}

function parseCsvText(csvText, delimiter = ",") {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i += 1) {
    const char = csvText[i];
    const next = csvText[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (next === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char === "\r") {
      if (next === "\n") {
        continue;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length === 0) return [];
  const headers = rows[0].map((h, idx) => (h.trim() === "" ? `column_${idx + 1}` : h.trim()));
  const dataRows = rows.slice(1).filter((r) => r.some((cell) => cell !== ""));
  return dataRows.map((cells) => {
    const obj = {};
    for (let i = 0; i < headers.length; i += 1) {
      obj[headers[i]] = i < cells.length ? cells[i] : "";
    }
    return obj;
  });
}

function parseCsvLines(lines, delimiter = ",") {
  return parseCsvText(lines.join("\n"), delimiter);
}

function attackRangeName(target) {
  for (const r of ATTACK_RANGE_DESCRIPTIONS) {
    if (r.value === target) return r.name;
  }
  const names = [];
  for (const r of ATTACK_RANGE_DESCRIPTIONS) {
    if (r.value !== 0 && (target & r.value)) names.push(r.name);
  }
  return names.length ? names.join("|") : "Unknown";
}

function moveFlagsString(flagField) {
  const flags = [];
  for (let i = 1; i < MOVE_FLAGS.length; i += 1) {
    if (flagField & (1 << (i - 1))) flags.push(MOVE_FLAGS[i]);
  }
  return `[${flags.join("|")}]`;
}

function battleEffectDesc(effectId) {
  if (effectId < BATTLE_SEQUENCE_DESCRIPTIONS.length) return BATTLE_SEQUENCE_DESCRIPTIONS[effectId];
  return `UnknownEffect_${effectId}`;
}

function formatEvolutionParam(methodName, param, names) {
  const meaning = EVOLUTION_PARAM_MEANING[methodName] || "Ignored";
  if (meaning === "Ignored") return "Ignored";
  if (meaning === "FromLevel") return String(param);
  if (meaning === "BeautyValue") return String(param);
  if (meaning === "ItemName") return names.itemNames[param] ?? `ITEM_${param}`;
  if (meaning === "MoveName") return names.moveNames[param] ?? `MOVE_${param}`;
  if (meaning === "PokemonName") return names.pokemonNames[param] ?? `SPECIES_${param}`;
  return String(param);
}

function crc32(u8) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < u8.length; i += 1) {
    crc ^= u8[i];
    for (let j = 0; j < 8; j += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xEDB88320 & mask);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function makeZip(entries) {
  const encoder = new TextEncoder();
  const files = [];
  let offset = 0;
  const central = [];

  for (const entry of entries) {
    const name = entry.path.replace(/\\\\/g, "/");
    const nameBytes = encoder.encode(name);
    const data = entry.data instanceof Uint8Array ? entry.data : new Uint8Array(entry.data);
    const crc = crc32(data);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const dv = new DataView(localHeader.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 0, true);
    dv.setUint16(8, 0, true);
    dv.setUint16(10, 0, true);
    dv.setUint16(12, 0, true);
    dv.setUint32(14, crc, true);
    dv.setUint32(18, data.length, true);
    dv.setUint32(22, data.length, true);
    dv.setUint16(26, nameBytes.length, true);
    dv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    files.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cdv = new DataView(centralHeader.buffer);
    cdv.setUint32(0, 0x02014b50, true);
    cdv.setUint16(4, 20, true);
    cdv.setUint16(6, 20, true);
    cdv.setUint16(8, 0, true);
    cdv.setUint16(10, 0, true);
    cdv.setUint16(12, 0, true);
    cdv.setUint16(14, 0, true);
    cdv.setUint32(16, crc, true);
    cdv.setUint32(20, data.length, true);
    cdv.setUint32(24, data.length, true);
    cdv.setUint16(28, nameBytes.length, true);
    cdv.setUint16(30, 0, true);
    cdv.setUint16(32, 0, true);
    cdv.setUint16(34, 0, true);
    cdv.setUint16(36, 0, true);
    cdv.setUint32(38, 0, true);
    cdv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);
    central.push(centralHeader);

    offset += localHeader.length + data.length;
  }

  const centralSize = central.reduce((sum, b) => sum + b.length, 0);
  const end = new Uint8Array(22);
  const edv = new DataView(end.buffer);
  edv.setUint32(0, 0x06054b50, true);
  edv.setUint16(4, 0, true);
  edv.setUint16(6, 0, true);
  edv.setUint16(8, entries.length, true);
  edv.setUint16(10, entries.length, true);
  edv.setUint32(12, centralSize, true);
  edv.setUint32(16, offset, true);
  edv.setUint16(20, 0, true);

  const total = [...files, ...central, end];
  const outLen = total.reduce((s, b) => s + b.length, 0);
  const out = new Uint8Array(outLen);
  let pos = 0;
  for (const chunk of total) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  return out;
}

function detectAppendedData(data) {
  for (let possibleAmt = 0; possibleAmt < 0x20; possibleAmt += 4) {
    const headerOffset = data.length - possibleAmt - 8;
    if (headerOffset < 0) return null;
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const compLenHeaderLen = dv.getUint32(headerOffset, true);
    const headerLen = compLenHeaderLen >>> 24;
    const compressedLen = compLenHeaderLen & 0xFFFFFF;
    if (headerLen < 8) continue;
    if (compressedLen > data.length) continue;
    let ok = true;
    for (let i = data.length - possibleAmt - headerLen; i < data.length - possibleAmt - 8; i += 1) {
      if (data[i] !== 0xFF) { ok = false; break; }
    }
    if (ok) return possibleAmt;
  }
  return null;
}

function decompressCode(data) {
  const appendedDataAmount = detectAppendedData(data);
  if (appendedDataAmount == null) return data;

  let appendedData = new Uint8Array(0);
  let main = data;
  if (appendedDataAmount > 0) {
    appendedData = data.subarray(data.length - appendedDataAmount);
    main = data.subarray(0, data.length - appendedDataAmount);
  }

  if (main.length >= 4 && main.subarray(main.length - 4).every((b) => b === 0)) {
    return main;
  }

  const dv = new DataView(main.buffer, main.byteOffset, main.byteLength);
  const headerOffset = main.length - 8;
  const compLenHeaderLen = dv.getUint32(headerOffset, true);
  const extraSize = dv.getUint32(headerOffset + 4, true);
  const headerLen = compLenHeaderLen >>> 24;
  let compressedLen = compLenHeaderLen & 0xFFFFFF;
  if (compressedLen >= main.length) compressedLen = main.length;

  const passthroughLen = main.length - compressedLen;
  const passthroughData = main.subarray(0, passthroughLen);
  const compData = main.subarray(passthroughLen, passthroughLen + compressedLen - headerLen);
  const decompData = new Uint8Array(main.length + extraSize - passthroughLen);

  let currentOutSize = 0;
  const decompLen = decompData.length;
  let readBytes = 0;
  let flags = 0;
  let mask = 1;

  while (currentOutSize < decompLen) {
    if (mask === 1) {
      if (readBytes >= compressedLen) throw new Error("Not enough data to decompress");
      flags = compData[compData.length - 1 - readBytes];
      readBytes += 1;
      mask = 0x80;
    } else {
      mask >>= 1;
    }

    if (flags & mask) {
      if (readBytes + 1 >= compData.length) throw new Error("Not enough data to decompress");
      const byte1 = compData[compData.length - 1 - readBytes]; readBytes += 1;
      const byte2 = compData[compData.length - 1 - readBytes]; readBytes += 1;
      const length = (byte1 >> 4) + 3;
      let disp = (((byte1 & 0x0F) << 8) | byte2) + 3;
      if (disp > currentOutSize) {
        if (currentOutSize < 2) throw new Error("Bad disp in decompression");
        disp = 2;
      }
      let bufIdx = currentOutSize - disp;
      for (let i = 0; i < length; i += 1) {
        const next = decompData[decompData.length - 1 - bufIdx];
        bufIdx += 1;
        decompData[decompData.length - 1 - currentOutSize] = next;
        currentOutSize += 1;
      }
    } else {
      if (readBytes > compData.length) throw new Error("Not enough data to decompress");
      const next = compData[compData.length - 1 - readBytes];
      readBytes += 1;
      decompData[decompData.length - 1 - currentOutSize] = next;
      currentOutSize += 1;
    }
  }

  const out = new Uint8Array(passthroughData.length + decompData.length + appendedData.length);
  out.set(passthroughData, 0);
  out.set(decompData, passthroughData.length);
  out.set(appendedData, passthroughData.length + decompData.length);
  return out;
}

async function readOverlay(editor, overlayTable, overlayId) {
  const entry = overlayTable.get(overlayId);
  if (!entry) return null;
  const { fileId, flags } = entry;
  const res = await editor.readFileById(fileId);
  let data = new Uint8Array(res.fileBuffer);
  if (flags & 1) {
    data = decompressCode(data);
  }
  return { ...entry, data };
}

function parseOverlayTable(u8) {
  const table = new Map();
  const r = new Reader(u8);
  while (r.off + 32 <= u8.length) {
    const ovId = r.u32();
    const ramAddress = r.u32();
    const ramSize = r.u32();
    const bssSize = r.u32();
    const staticInitStart = r.u32();
    const staticInitEnd = r.u32();
    const fileId = r.u32();
    const compressedSizeFlags = r.u32();
    const compressedSize = compressedSizeFlags & 0xFFFFFF;
    const flags = compressedSizeFlags >>> 24;
    table.set(ovId, {
      ovId,
      ramAddress,
      ramSize,
      bssSize,
      staticInitStart,
      staticInitEnd,
      fileId,
      compressedSize,
      flags,
    });
  }
  return table;
}

function parsePersonal(u8) {
  const r = new Reader(u8);
  const baseHP = r.u8();
  const baseAtk = r.u8();
  const baseDef = r.u8();
  const baseSpeed = r.u8();
  const baseSpAtk = r.u8();
  const baseSpDef = r.u8();
  const type1 = r.u8();
  const type2 = r.u8();
  r.u8(); // catchRate
  r.u8(); // givenExp
  r.u16(); // evData
  const item1 = r.u16();
  const item2 = r.u16();
  const genderVec = r.u8();
  r.u8(); // eggSteps
  r.u8(); // baseFriendship
  r.u8(); // growthCurve
  r.u8(); // eggGroup1
  r.u8(); // eggGroup2
  const firstAbility = r.u8();
  const secondAbility = r.u8();
  r.u8(); // escapeRate
  r.u8(); // colorAndFlip
  const alignmentU16 = r.u16(); // alignment (unused in vanilla)
  const tm1 = r.u32();
  const tm2 = r.u32();
  const tm3 = r.u32();
  const tm4 = r.u32();
  const machines = new Set();
  const bits = [tm1, tm2, tm3, tm4];
  for (let i = 0; i < bits.length; i += 1) {
    const chunk = bits[i];
    for (let b = 0; b < 32; b += 1) {
      if (chunk & (1 << b)) machines.add(i * 32 + b);
    }
  }
  const abilityU16 = firstAbility | (secondAbility << 8);
  return {
    baseHP,
    baseAtk,
    baseDef,
    baseSpeed,
    baseSpAtk,
    baseSpDef,
    type1,
    type2,
    item1,
    item2,
    firstAbility,
    secondAbility,
    abilityU16,
    alignmentU16,
    genderVec,
    machines,
  };
}

function parseLearnset(u8, { expanded = false } = {}) {
  const r = new Reader(u8);
  const list = [];
  if (expanded) {
    while (r.off + 4 <= u8.length) {
      const move = r.u16();
      const level = r.u16();
      if (move === 0xFFFF || level === 0xFFFF) break;
      if (move === 0) continue;
      list.push({ level, move });
    }
    return list;
  }
  while (r.off + 2 <= u8.length) {
    const entry = r.u16();
    if (entry === 0xFFFF) break;
    const move = entry & ((1 << 9) - 1);
    const level = (entry >> 9) & ((1 << 7) - 1);
    list.push({ level, move });
  }
  return list;
}

function learnsetAtLevel(list, level) {
  const moves = [];
  for (const entry of list) {
    if (entry.level > level) continue;
    if (entry.move === 0) continue;
    if (!moves.includes(entry.move)) {
      if (moves.length >= 4) moves.shift();
      moves.push(entry.move);
    }
  }
  while (moves.length < 4) moves.push(0);
  return moves;
}

function parseEvolution(u8) {
  const r = new Reader(u8);
  const out = [];
  for (let i = 0; i < 7; i += 1) {
    const method = r.s16();
    const param = r.s16();
    const target = r.s16();
    out.push({ method, param, target });
  }
  return out;
}

function parseMove(u8) {
  const r = new Reader(u8);
  return {
    battleeffect: r.u16(),
    split: r.u8(),
    damage: r.u8(),
    movetype: r.u8(),
    accuracy: r.u8(),
    pp: r.u8(),
    sideEffectProbability: r.u8(),
    target: r.u16(),
    priority: r.s8(),
    flagField: r.u8(),
  };
}

function parseEncounterDPPt(u8) {
  const r = new Reader(u8);
  const walkingRate = r.u32() & 0xFF;
  const walkingLevels = new Uint8Array(12);
  const walkingPokemon = new Uint32Array(12);
  for (let i = 0; i < 12; i += 1) {
    walkingLevels[i] = r.u32() & 0xFF;
    walkingPokemon[i] = r.u32();
  }
  const swarmPokemon = new Uint16Array(2);
  for (let i = 0; i < 2; i += 1) swarmPokemon[i] = r.u32() & 0xFFFF;
  const dayPokemon = new Uint32Array(2);
  const nightPokemon = new Uint32Array(2);
  for (let i = 0; i < 2; i += 1) dayPokemon[i] = r.u32();
  for (let i = 0; i < 2; i += 1) nightPokemon[i] = r.u32();
  const radarPokemon = new Uint32Array(4);
  for (let i = 0; i < 4; i += 1) radarPokemon[i] = r.u32();
  const regionalForms = new Uint32Array(5);
  for (let i = 0; i < 5; i += 1) regionalForms[i] = r.u32();
  const unknownTable = r.u32();
  const rubyPokemon = new Uint32Array(2);
  const sapphirePokemon = new Uint32Array(2);
  const emeraldPokemon = new Uint32Array(2);
  const fireRedPokemon = new Uint32Array(2);
  const leafGreenPokemon = new Uint32Array(2);
  for (let i = 0; i < 2; i += 1) rubyPokemon[i] = r.u32();
  for (let i = 0; i < 2; i += 1) sapphirePokemon[i] = r.u32();
  for (let i = 0; i < 2; i += 1) emeraldPokemon[i] = r.u32();
  for (let i = 0; i < 2; i += 1) fireRedPokemon[i] = r.u32();
  for (let i = 0; i < 2; i += 1) leafGreenPokemon[i] = r.u32();
  const surfRate = r.u32() & 0xFF;
  const surfMaxLevels = new Uint8Array(5);
  const surfMinLevels = new Uint8Array(5);
  const surfPokemon = new Uint16Array(5);
  for (let i = 0; i < 5; i += 1) {
    surfMaxLevels[i] = r.u8();
    surfMinLevels[i] = r.u8();
    r.skip(2);
    surfPokemon[i] = r.u32() & 0xFFFF;
  }
  r.seek(0x124);
  const oldRodRate = r.u32() & 0xFF;
  const oldRodMaxLevels = new Uint8Array(5);
  const oldRodMinLevels = new Uint8Array(5);
  const oldRodPokemon = new Uint16Array(5);
  for (let i = 0; i < 5; i += 1) {
    oldRodMaxLevels[i] = r.u8();
    oldRodMinLevels[i] = r.u8();
    r.skip(2);
    oldRodPokemon[i] = r.u32() & 0xFFFF;
  }
  const goodRodRate = r.u32() & 0xFF;
  const goodRodMaxLevels = new Uint8Array(5);
  const goodRodMinLevels = new Uint8Array(5);
  const goodRodPokemon = new Uint16Array(5);
  for (let i = 0; i < 5; i += 1) {
    goodRodMaxLevels[i] = r.u8();
    goodRodMinLevels[i] = r.u8();
    r.skip(2);
    goodRodPokemon[i] = r.u32() & 0xFFFF;
  }
  let superRodRate = 0;
  let superRodMaxLevels = null;
  let superRodMinLevels = null;
  let superRodPokemon = null;
  try {
    superRodRate = r.u32() & 0xFF;
    superRodMaxLevels = new Uint8Array(5);
    superRodMinLevels = new Uint8Array(5);
    superRodPokemon = new Uint16Array(5);
    for (let i = 0; i < 5; i += 1) {
      superRodMaxLevels[i] = r.u8();
      superRodMinLevels[i] = r.u8();
      r.skip(2);
      superRodPokemon[i] = r.u32() & 0xFFFF;
    }
  } catch {
    superRodRate = 0;
    superRodMaxLevels = null;
    superRodMinLevels = null;
    superRodPokemon = null;
  }
  return {
    walkingRate,
    surfRate,
    walkingLevels,
    walkingPokemon,
    swarmPokemon,
    dayPokemon,
    nightPokemon,
    radarPokemon,
    regionalForms,
    unknownTable,
    rubyPokemon,
    sapphirePokemon,
    emeraldPokemon,
    fireRedPokemon,
    leafGreenPokemon,
    surfRate,
    surfMaxLevels,
    surfMinLevels,
    surfPokemon,
    oldRodRate,
    oldRodMaxLevels,
    oldRodMinLevels,
    oldRodPokemon,
    goodRodRate,
    goodRodMaxLevels,
    goodRodMinLevels,
    goodRodPokemon,
    superRodRate,
    superRodMaxLevels,
    superRodMinLevels,
    superRodPokemon,
  };
}

function parseEncounterHGSS(u8) {
  const r = new Reader(u8);
  const walkingRate = r.u8();
  const surfRate = r.u8();
  const rockSmashRate = r.u8();
  const oldRodRate = r.u8();
  const goodRodRate = r.u8();
  const superRodRate = r.u8();
  r.skip(2);
  const walkingLevels = new Uint8Array(12);
  for (let i = 0; i < 12; i += 1) walkingLevels[i] = r.u8();
  const morningPokemon = new Uint16Array(12);
  const dayPokemon = new Uint16Array(12);
  const nightPokemon = new Uint16Array(12);
  for (let i = 0; i < 12; i += 1) morningPokemon[i] = r.u16();
  for (let i = 0; i < 12; i += 1) dayPokemon[i] = r.u16();
  for (let i = 0; i < 12; i += 1) nightPokemon[i] = r.u16();
  const hoennMusicPokemon = new Uint16Array(2);
  const sinnohMusicPokemon = new Uint16Array(2);
  for (let i = 0; i < 2; i += 1) hoennMusicPokemon[i] = r.u16();
  for (let i = 0; i < 2; i += 1) sinnohMusicPokemon[i] = r.u16();
  const surfMinLevels = new Uint8Array(5);
  const surfMaxLevels = new Uint8Array(5);
  const surfPokemon = new Uint16Array(5);
  for (let i = 0; i < 5; i += 1) {
    surfMinLevels[i] = r.u8();
    surfMaxLevels[i] = r.u8();
    surfPokemon[i] = r.u16();
  }
  const rockSmashMinLevels = new Uint8Array(2);
  const rockSmashMaxLevels = new Uint8Array(2);
  const rockSmashPokemon = new Uint16Array(2);
  for (let i = 0; i < 2; i += 1) {
    rockSmashMinLevels[i] = r.u8();
    rockSmashMaxLevels[i] = r.u8();
    rockSmashPokemon[i] = r.u16();
  }
  const oldRodMinLevels = new Uint8Array(5);
  const oldRodMaxLevels = new Uint8Array(5);
  const oldRodPokemon = new Uint16Array(5);
  for (let i = 0; i < 5; i += 1) {
    oldRodMinLevels[i] = r.u8();
    oldRodMaxLevels[i] = r.u8();
    oldRodPokemon[i] = r.u16();
  }
  const goodRodMinLevels = new Uint8Array(5);
  const goodRodMaxLevels = new Uint8Array(5);
  const goodRodPokemon = new Uint16Array(5);
  for (let i = 0; i < 5; i += 1) {
    goodRodMinLevels[i] = r.u8();
    goodRodMaxLevels[i] = r.u8();
    goodRodPokemon[i] = r.u16();
  }
  const superRodMinLevels = new Uint8Array(5);
  const superRodMaxLevels = new Uint8Array(5);
  const superRodPokemon = new Uint16Array(5);
  for (let i = 0; i < 5; i += 1) {
    superRodMinLevels[i] = r.u8();
    superRodMaxLevels[i] = r.u8();
    superRodPokemon[i] = r.u16();
  }
  const swarmPokemon = new Uint16Array(4);
  for (let i = 0; i < 4; i += 1) swarmPokemon[i] = r.u16();
  return {
    walkingRate,
    surfRate,
    rockSmashRate,
    oldRodRate,
    goodRodRate,
    superRodRate,
    walkingLevels,
    morningPokemon,
    dayPokemon,
    nightPokemon,
    hoennMusicPokemon,
    sinnohMusicPokemon,
    surfMinLevels,
    surfMaxLevels,
    surfPokemon,
    rockSmashMinLevels,
    rockSmashMaxLevels,
    rockSmashPokemon,
    oldRodMinLevels,
    oldRodMaxLevels,
    oldRodPokemon,
    goodRodMinLevels,
    goodRodMaxLevels,
    goodRodPokemon,
    superRodMinLevels,
    superRodMaxLevels,
    superRodPokemon,
    swarmPokemon,
  };
}

let ENCOUNTER_FORM_STRIDE = 1024;

function resolveAltFormName(speciesId, names) {
  if (speciesId < 0) return `UNKNOWN_${speciesId}`;
  const stride = ENCOUNTER_FORM_STRIDE || 1024;
  if (speciesId < stride) {
    if (speciesId >= names.length) return `UNKNOWN_${speciesId}`;
    return names[speciesId];
  }

  const baseId = speciesId % stride;
  const altIndex = Math.floor(speciesId / stride);
  if (baseId < 0 || baseId >= names.length) return `UNKNOWN_${speciesId}`;
  const baseName = names[baseId];

  try {
    if (typeof BattlePokedex !== "undefined") {
      const baseIdStr = toID(baseName);
      const entry = BattlePokedex[baseIdStr];
      if (entry && Array.isArray(entry.otherFormes)) {
        const formName = entry.otherFormes[altIndex - 1];
        if (formName) return formName;
      }
    }
  } catch {
    // fall through to base name
  }

  return baseName || `UNKNOWN_${speciesId}`;
}

function speciesName(speciesId, names) {
  return resolveAltFormName(speciesId, names);
}

function exportU16Named(arr, names) {
  return Array.from(arr).map((val, slot) => ({
    slot,
    species: val,
    speciesName: speciesName(val, names),
  }));
}

function exportU32Named(arr, names) {
  return Array.from(arr).map((val, slot) => ({
    slot,
    species: val,
    speciesName: speciesName(val, names),
  }));
}

function exportMinMaxU16Named(mons, minLv, maxLv, names) {
  if (!mons || !minLv || !maxLv) return null;
  const list = [];
  const n = Math.min(mons.length, minLv.length, maxLv.length);
  for (let i = 0; i < n; i += 1) {
    list.push({
      slot: i,
      species: mons[i],
      speciesName: speciesName(mons[i], names),
      minLv: minLv[i],
      maxLv: maxLv[i],
    });
  }
  return list;
}

function exportWalkingDPPt(enc, names) {
  const slots = [];
  for (let i = 0; i < 12; i += 1) {
    const speciesId = enc.walkingPokemon[i];
    slots.push({
      slot: i,
      level: enc.walkingLevels[i],
      species: speciesId,
      speciesName: speciesName(speciesId, names),
    });
  }
  return slots;
}

function exportEncountersJson(encounters, meta) {
  return JSON.stringify({
    generatedAt: new Date().toISOString(),
    projectName: meta.romId,
    romID: meta.romId,
    gameFamily: meta.family,
    gameVersion: meta.version,
    gameLanguage: "English",
    encounters,
  }, null, 2) + "\n";
}

function parseEventOverworlds(u8) {
  const r = new Reader(u8);
  const spawnablesCount = r.u32();
  r.skip(spawnablesCount * 0x14);
  const overworldsCount = r.u32();
  const overworlds = [];
  for (let i = 0; i < overworldsCount; i += 1) {
    const owID = r.u16();
    const overlayTableEntry = r.u16();
    const movement = r.u16();
    const type = r.u16();
    const flag = r.u16();
    const scriptNumber = r.u16();
    const orientation = r.u16();
    const sightRange = r.u16();
    const unknown1 = r.u16();
    const unknown2 = r.u16();
    const xRange = r.u16();
    const yRange = r.u16();
    const xPosition = r.s16();
    const yPosition = r.s16();
    const zPosition = r.u32();
    const xMapPosition = xPosition % 32;
    const yMapPosition = yPosition % 32;
    const xMatrixPosition = Math.floor(xPosition / 32);
    const yMatrixPosition = Math.floor(yPosition / 32);
    overworlds.push({
      owID,
      overlayTableEntry,
      movement,
      type,
      flag,
      scriptNumber,
      orientation,
      sightRange,
      unknown1,
      unknown2,
      xRange,
      yRange,
      xMapPosition,
      yMapPosition,
      xMatrixPosition,
      yMatrixPosition,
      zPosition,
    });
  }
  return overworlds;
}

function parseMapHeaderPlat(arm9, offset) {
  const r = new Reader(arm9);
  r.seek(offset);
  r.u8(); // areaDataID
  r.u8(); // unknown1
  r.u16(); // matrixID
  const scriptFileID = r.u16();
  r.u16(); // levelScriptID
  r.u16(); // textArchiveID
  r.u16(); // musicDayID
  r.u16(); // musicNightID
  const wildPokemon = r.u16();
  const eventFileID = r.u16();
  const locationName = r.u8();
  r.u8(); // areaIcon
  const weatherID = r.u8();
  r.u8(); // cameraAngleID
  r.u16(); // mapSettings
  return { scriptFileID, eventFileID, wildPokemon, weatherID, locationName };
}

function parseMapHeaderHGSS(arm9, offset) {
  const r = new Reader(arm9);
  r.seek(offset);
  const wildPokemon = r.u8();
  r.u8(); // areaDataID
  r.u16(); // coords
  r.u16(); // matrixID
  const scriptFileID = r.u16();
  r.u16(); // levelScriptID
  r.u16(); // textArchiveID
  r.u16(); // musicDayID
  r.u16(); // musicNightID
  const eventFileID = r.u16();
  const locationName = r.u8();
  r.u8(); // areaProperties
  const last32 = r.u32();
  const weatherID = (last32 >> 1) & 0x7F;
  return { scriptFileID, eventFileID, wildPokemon, weatherID, locationName };
}

function parseMapHeaderPlatFromBytes(u8) {
  const r = new Reader(u8);
  r.u8(); // areaDataID
  r.u8(); // unknown1
  r.u16(); // matrixID
  const scriptFileID = r.u16();
  r.u16(); // levelScriptID
  r.u16(); // textArchiveID
  r.u16(); // musicDayID
  r.u16(); // musicNightID
  const wildPokemon = r.u16();
  const eventFileID = r.u16();
  const locationName = r.u8();
  r.u8(); // areaIcon
  const weatherID = r.u8();
  r.u8(); // cameraAngleID
  r.u16(); // mapSettings
  return { scriptFileID, eventFileID, wildPokemon, weatherID, locationName };
}

function parseMapHeaderHGSSFromBytes(u8) {
  const r = new Reader(u8);
  const wildPokemon = r.u8();
  r.u8(); // areaDataID
  r.u16(); // coords
  r.u16(); // matrixID
  const scriptFileID = r.u16();
  r.u16(); // levelScriptID
  r.u16(); // textArchiveID
  r.u16(); // musicDayID
  r.u16(); // musicNightID
  const eventFileID = r.u16();
  const locationName = r.u8();
  r.u8(); // areaProperties
  const last32 = r.u32();
  const weatherID = (last32 >> 1) & 0x7F;
  return { scriptFileID, eventFileID, wildPokemon, weatherID, locationName };
}

function formatTrainerDoc(trainer) {
  const sb = [];
  sb.push(`[${trainer.index}] ${trainer.trainerClass} ${trainer.trainerName}`);
  const items = trainer.trainerItems.filter((it) => it !== "None");
  if (items.length) {
    sb.push(` @ (${items.join(", ")})`);
  }
  sb.push(":\n\n");

  for (const mon of trainer.party) {
    sb.push(mon.name);
    if (mon.gender !== "random") sb.push(` (${mon.gender})`);
    if (mon.item !== "None") sb.push(` @ ${mon.item}`);
    sb.push(`\nAbility: ${mon.ability}`);
    sb.push(`\nLevel: ${mon.level}`);
    sb.push(`\n${mon.nature} Nature`);
    sb.push(`\nIVs: ${Array(6).fill(mon.ivs).join(" / ")}`);
    const moves = mon.moves.filter((m) => m !== "None" && m !== "-");
    sb.push(`\n- ${moves.join("\n- ")}`);
    sb.push("\n\n");
  }

  sb.push("\n\n\n");
  return sb.join("");
}

function dvGeneratePID(params) {
  let state = (params.trainerIdx + params.pokeIdx + params.pokeLevel + params.difficultyValue) >>> 0;
  const randStep = () => {
    state = (1103515245 * state + 24691) >>> 0;
    return state >>> 16;
  };
  let random = 0;
  for (let i = 0; i < params.trainerClassIdx; i += 1) {
    random = randStep();
  }
  let genderMod = params.trainerMale ? 136 : 120;
  if (params.useGenderUpdate) {
    if (params.genderOverride === 1) genderMod = params.baseGenderRatio + 2;
    else if (params.genderOverride === 2) genderMod = params.baseGenderRatio - 2;
    if (params.abilityOverride === 1) genderMod = genderMod & ~1;
    else if (params.abilityOverride === 2) genderMod = genderMod | 1;
  }
  return ((random << 8) + genderMod) >>> 0;
}

function dvNatureFromPid(pid) {
  return (pid % 100) % 25;
}

const NATURES = [
  "Hardy", "Lonely", "Brave", "Adamant", "Naughty",
  "Bold", "Docile", "Relaxed", "Impish", "Lax",
  "Timid", "Hasty", "Serious", "Jolly", "Naive",
  "Modest", "Mild", "Quiet", "Bashful", "Rash",
  "Calm", "Gentle", "Sassy", "Careful", "Quirky",
];

async function loadArm9(editor, header) {
  const res = await editor.readBytes(header.arm9Offset, header.arm9Size);
  const raw = new Uint8Array(res.bytes);
  return decompressCode(raw);
}

function readU16List(u8, offset, count, log) {
  const maxCount = Math.max(0, Math.floor((u8.length - offset) / 2));
  const useCount = Math.min(count, maxCount);
  if (useCount < count && log) {
    log(`[warn] ARM9 read truncated: wanted ${count} u16 at 0x${offset.toString(16)}, got ${useCount}.`);
  }
  const r = new Reader(u8);
  r.seek(offset);
  const out = [];
  for (let i = 0; i < useCount; i += 1) out.push(r.u16());
  return out;
}

function stripSpecialCharacters(input) {
  return input
    .replace(/É/g, "E")
    .replace(/&/g, "AND")
    .replace(/\./g, "")
    .replace(/-/g, "_")
    .replace(/’/g, "")
    .replace(/♂/g, "M")
    .replace(/♀/g, "F");
}

function formatStringForScripting(input) {
  return stripSpecialCharacters(String(input || "").toUpperCase().replace(/\s+/g, "_"));
}

async function loadScriptDatabase(family) {
  const json = family === "Plat" ? window.PLATINUM_SCRCMD_DB : window.HGSS_SCRCMD_DB;
  if (!json) {
    throw new Error("Script database not loaded. Make sure the JS database files are included in index.html.");
  }

  const scrcmd = new Map();
  for (const [key, val] of Object.entries(json.scrcmd || {})) {
    const id = Number.parseInt(key, 16);
    scrcmd.set(id, {
      name: val.name || `CMD_${id.toString(16).toUpperCase()}`,
      parameters: (val.parameters || []).map((n) => Number(n)),
      parameterTypes: (val.parameter_types || []).map((t) => String(t)),
    });
  }

  const comparisonOperators = new Map();
  for (const [key, val] of Object.entries(json.comparisonOperators || {})) {
    const id = Number.parseInt(key, 16);
    comparisonOperators.set(id, val);
  }

  const specialOverworlds = new Map();
  for (const [key, val] of Object.entries(json.specialOverworlds || {})) {
    const id = Number.parseInt(key, 16);
    specialOverworlds.set(id, val);
  }

  const overworldDirections = new Map();
  for (const [key, val] of Object.entries(json.overworldDirections || {})) {
    const id = Number.parseInt(key, 16);
    overworldDirections.set(id, val);
  }

  const sounds = new Map();
  for (const [key, val] of Object.entries(json.sounds || {})) {
    const id = Number.parseInt(key, 10);
    sounds.set(id, val.name || val);
  }

  return { scrcmd, comparisonOperators, specialOverworlds, overworldDirections, sounds };
}

function buildScriptNameMaps(names) {
  const pokemon = new Map();
  const items = new Map();
  const moves = new Map();
  const trainers = new Map();

  names.pokemonNames.forEach((name, idx) => {
    pokemon.set(idx, `SPECIES_${formatStringForScripting(name)}`);
  });
  names.itemNames.forEach((name, idx) => {
    items.set(idx, `ITEM_${formatStringForScripting(name)}`);
  });
  names.moveNames.forEach((name, idx) => {
    moves.set(idx, `MOVE_${formatStringForScripting(name)}`);
  });
  names.trainerNames.forEach((name, idx) => {
    if (idx === 0) {
      trainers.set(idx, "TRAINER_NONE");
    } else {
      trainers.set(idx, `TRAINER_${formatStringForScripting(name)}_${String(idx).padStart(3, "0")}`);
    }
  });

  return { pokemon, items, moves, trainers };
}

function formatNumber(value) {
  if (value >= 4000) return `0x${value.toString(16).toUpperCase()}`;
  return String(value);
}

function formatParam(rawBytes, type, ctx) {
  let value = 0;
  if (rawBytes.length === 1) value = rawBytes[0];
  else if (rawBytes.length === 2) value = rawBytes[0] | (rawBytes[1] << 8);
  else if (rawBytes.length === 4) value = rawBytes[0] | (rawBytes[1] << 8) | (rawBytes[2] << 16) | (rawBytes[3] << 24);

  switch (type) {
    case "Pokemon": return ctx.nameMaps.pokemon.get(value) || formatNumber(value);
    case "Item": return ctx.nameMaps.items.get(value) || formatNumber(value);
    case "Move": return ctx.nameMaps.moves.get(value) || formatNumber(value);
    case "Trainer": return ctx.nameMaps.trainers.get(value) || formatNumber(value);
    case "Sound": return ctx.sounds.get(value) || formatNumber(value);
    case "ComparisonOperator": return ctx.comparisonOperators.get(value) || formatNumber(value);
    case "Function": return `Function#${value}`;
    case "Action": return `Action#${value}`;
    case "CMDNumber": return `CMD_${value.toString(16).toUpperCase()}`;
    case "Overworld": return ctx.specialOverworlds.get(value) || (value < 4000 ? `Overworld.${value}` : formatNumber(value));
    case "OwMovementType": return value < 4000 ? `Move.${value}` : formatNumber(value);
    case "OwMovementDirection": return ctx.overworldDirections.get(value) || formatNumber(value);
    case "Variable":
    case "Flex":
    case "Integer":
    default:
      return formatNumber(value >>> 0);
  }
}

function addParametersFromDatabase(paramList, id, reader, db) {
  const info = db.scrcmd.get(id);
  if (!info) return false;
  const sizes = info.parameters || [];
  for (const size of sizes) {
    if (size === 0xFF) break;
    if (!size) continue;
    const bytes = new Uint8Array(size);
    for (let i = 0; i < size; i += 1) bytes[i] = reader.u8();
    paramList.push(bytes);
  }
  return true;
}

function processRelativeJump(reader, paramList, offsetsList) {
  const relative = reader.s32();
  const offsetFromStart = relative + reader.off;
  if (!offsetsList.includes(offsetFromStart)) offsetsList.push(offsetFromStart);
  const fnIndex = offsetsList.indexOf(offsetFromStart);
  const val = fnIndex + 1;
  paramList.push(new Uint8Array([val & 0xff, (val >> 8) & 0xff, (val >> 16) & 0xff, (val >> 24) & 0xff]));
}

function readCommand(reader, family, version, db, functionOffsets, actionOffsets) {
  const id = reader.u16();
  const params = [];

  if (family === "Plat") {
    switch (id) {
      case 0x16:
      case 0x1A:
        processRelativeJump(reader, params, functionOffsets);
        break;
      case 0x17:
      case 0x18:
      case 0x19:
      case 0x1C:
      case 0x1D:
        params.push(new Uint8Array([reader.u8()]));
        processRelativeJump(reader, params, functionOffsets);
        break;
      case 0x5E:
        params.push(new Uint8Array([reader.u8(), reader.u8()]));
        processRelativeJump(reader, params, actionOffsets);
        break;
      case 0x1CF:
      case 0x1D0:
      case 0x1D1: {
        const p1 = reader.u8();
        params.push(new Uint8Array([p1]));
        if (p1 === 0x2) params.push(new Uint8Array([reader.u8(), reader.u8()]));
        break;
      }
      case 0x21D: {
        const p1 = reader.u16();
        params.push(new Uint8Array([p1 & 0xff, (p1 >> 8) & 0xff]));
        if (p1 === 0 || p1 === 1 || p1 === 2 || p1 === 3) {
          params.push(new Uint8Array([reader.u8(), reader.u8()]));
          params.push(new Uint8Array([reader.u8(), reader.u8()]));
        } else if (p1 === 4 || p1 === 5) {
          params.push(new Uint8Array([reader.u8(), reader.u8()]));
        }
        break;
      }
      case 0x235: {
        const p1 = reader.s16();
        params.push(new Uint8Array([p1 & 0xff, (p1 >> 8) & 0xff]));
        if (p1 === 0x1 || p1 === 0x3) {
          params.push(new Uint8Array([reader.u8(), reader.u8()]));
          params.push(new Uint8Array([reader.u8(), reader.u8()]));
          params.push(new Uint8Array([reader.u8(), reader.u8()]));
        } else if (p1 === 0x4) {
          params.push(new Uint8Array([reader.u8(), reader.u8()]));
          params.push(new Uint8Array([reader.u8(), reader.u8()]));
        } else if (p1 === 0x0 || p1 === 0x6) {
          params.push(new Uint8Array([reader.u8(), reader.u8()]));
        }
        break;
      }
      case 0x23E: {
        const p1 = reader.s16();
        params.push(new Uint8Array([p1 & 0xff, (p1 >> 8) & 0xff]));
        if (p1 === 0x1 || p1 === 0x3) {
          params.push(new Uint8Array([reader.u8(), reader.u8()]));
        } else if (p1 === 0x5 || p1 === 0x6) {
          params.push(new Uint8Array([reader.u8(), reader.u8()]));
          params.push(new Uint8Array([reader.u8(), reader.u8()]));
        }
        break;
      }
      case 0x2C4: {
        const p1 = reader.u8();
        params.push(new Uint8Array([p1]));
        if (p1 === 0 || p1 === 1) params.push(new Uint8Array([reader.u8(), reader.u8()]));
        break;
      }
      case 0x2C5:
        if (version === "Platinum") {
          params.push(new Uint8Array([reader.u8(), reader.u8()]));
          params.push(new Uint8Array([reader.u8(), reader.u8()]));
        } else {
          addParametersFromDatabase(params, id, reader, db);
        }
        break;
      case 0x2C6:
      case 0x2C9:
      case 0x2CA:
      case 0x2CD:
        if (version !== "Platinum") addParametersFromDatabase(params, id, reader, db);
        break;
      case 0x2CF:
        if (version === "Platinum") {
          params.push(new Uint8Array([reader.u8(), reader.u8()]));
          params.push(new Uint8Array([reader.u8(), reader.u8()]));
        } else {
          addParametersFromDatabase(params, id, reader, db);
        }
        break;
      default:
        addParametersFromDatabase(params, id, reader, db);
        break;
    }
  } else {
    switch (id) {
      case 0x16:
      case 0x1A:
        processRelativeJump(reader, params, functionOffsets);
        break;
      case 0x17:
      case 0x18:
      case 0x19:
      case 0x1C:
      case 0x1D:
        params.push(new Uint8Array([reader.u8()]));
        processRelativeJump(reader, params, functionOffsets);
        break;
      case 0x5E:
        params.push(new Uint8Array([reader.u8(), reader.u8()]));
        processRelativeJump(reader, params, actionOffsets);
        break;
      case 0x190:
      case 0x191:
      case 0x192: {
        const p1 = reader.u8();
        params.push(new Uint8Array([p1]));
        if (p1 === 0x2) params.push(new Uint8Array([reader.u8(), reader.u8()]));
        break;
      }
      case 0x1D1: {
        const p1 = reader.s16();
        params.push(new Uint8Array([p1 & 0xff, (p1 >> 8) & 0xff]));
        if (p1 === 0 || p1 === 1 || p1 === 2 || p1 === 3) {
          params.push(new Uint8Array([reader.u8(), reader.u8()]));
          params.push(new Uint8Array([reader.u8(), reader.u8()]));
        } else if (p1 === 4 || p1 === 5) {
          params.push(new Uint8Array([reader.u8(), reader.u8()]));
        } else if (p1 === 7) {
          params.push(new Uint8Array([reader.u8(), reader.u8()]));
        }
        break;
      }
      case 0x1E9: {
        const p1 = reader.s16();
        params.push(new Uint8Array([p1 & 0xff, (p1 >> 8) & 0xff]));
        if (p1 === 0x1 || p1 === 0x2 || p1 === 0x3) {
          params.push(new Uint8Array([reader.u8(), reader.u8()]));
        } else if (p1 === 0x5 || p1 === 0x6) {
          params.push(new Uint8Array([reader.u8(), reader.u8()]));
          params.push(new Uint8Array([reader.u8(), reader.u8()]));
        }
        break;
      }
      default:
        addParametersFromDatabase(params, id, reader, db);
        break;
    }
  }

  return { id, params };
}

function parseScriptFile(u8, ctx) {
  const reader = new Reader(u8);
  const scriptOffsets = [];
  const functionOffsets = [];
  const actionOffsets = [];
  let isLevelScript = true;

  while (reader.off + 4 <= u8.length) {
    const checker = reader.u16();
    reader.off -= 2;
    const value = reader.u32();
    if (value === 0 && scriptOffsets.length === 0) {
      isLevelScript = true;
      return { isLevelScript: true, scripts: [], functions: [] };
    }
    if (checker === 0xFD13) {
      reader.off -= 4;
      isLevelScript = false;
      break;
    }
    const offsetFromStart = value + reader.off;
    scriptOffsets.push(offsetFromStart);
  }

  if (isLevelScript) return { isLevelScript: true, scripts: [], functions: [] };

  reader.u16(); // skip 0xFD13

  const scripts = [];
  for (let i = 0; i < scriptOffsets.length; i += 1) {
    const offset = scriptOffsets[i];
    const index = scriptOffsets.indexOf(offset);
    if (index !== i) {
      scripts.push({ usedScriptId: index + 1, commands: [] });
      continue;
    }
    reader.seek(offset);
    const commands = [];
    while (reader.off < u8.length) {
      const cmd = readCommand(reader, ctx.family, ctx.version, ctx.db, functionOffsets, actionOffsets);
      commands.push(cmd);
      if (ctx.endCodes.has(cmd.id)) break;
    }
    scripts.push({ usedScriptId: -1, commands });
  }

  const functions = [];
  for (let i = 0; i < functionOffsets.length; i += 1) {
    const offset = functionOffsets[i];
    const posInList = scriptOffsets.indexOf(offset);
    if (posInList !== -1) {
      functions.push({ usedScriptId: posInList + 1, commands: [] });
      continue;
    }
    reader.seek(offset);
    const commands = [];
    while (reader.off < u8.length) {
      const cmd = readCommand(reader, ctx.family, ctx.version, ctx.db, functionOffsets, actionOffsets);
      commands.push(cmd);
      if (ctx.endCodes.has(cmd.id)) break;
    }
    functions.push({ usedScriptId: -1, commands });
  }

  return { isLevelScript: false, scripts, functions };
}

function formatCommand(cmd, ctx) {
  const info = ctx.db.scrcmd.get(cmd.id);
  let name = info?.name || `CMD_${cmd.id.toString(16).toUpperCase()}`;
  const types = info?.parameterTypes || [];
  for (let i = 0; i < cmd.params.length; i += 1) {
    const type = types[i] || "Integer";
    const value = formatParam(cmd.params[i], type, ctx);
    name += ` ${value}`;
  }
  return name;
}

function buildScriptText(script, ctx, fileId) {
  const lines = [];
  const now = new Date().toLocaleString("en-US");
  lines.push("/*");
  lines.push(" * DSPRE Script File");
  lines.push(` * Rom ID: ${ctx.romId}`);
  lines.push(` * Game: ${ctx.family}`);
  lines.push(` * File: ${String(fileId).padStart(4, "0")}`);
  lines.push(` * Generated: ${now}`);
  lines.push(" */");
  lines.push("");
  lines.push("//===== SCRIPTS =====//");

  for (let i = 0; i < script.scripts.length; i += 1) {
    lines.push(`Script ${i + 1}:`);
    const cont = script.scripts[i];
    if (cont.usedScriptId > 0) {
      lines.push(`\tUseScript_#${cont.usedScriptId}`);
    } else {
      for (const cmd of cont.commands) {
        const text = formatCommand(cmd, ctx);
        if (!ctx.endCodes.has(cmd.id)) lines.push(`\t${text}`);
        else lines.push(text);
      }
    }
    lines.push("");
  }

  lines.push("//===== FUNCTIONS =====//");
  for (let i = 0; i < script.functions.length; i += 1) {
    lines.push(`Function ${i + 1}:`);
    const cont = script.functions[i];
    if (cont.usedScriptId > 0) {
      lines.push(`\tUseScript_#${cont.usedScriptId}`);
    } else {
      for (const cmd of cont.commands) {
        const text = formatCommand(cmd, ctx);
        if (!ctx.endCodes.has(cmd.id)) lines.push(`\t${text}`);
        else lines.push(text);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function collectDspreData(editor, { log }) {
  log("Reading ROM header...");
  const header = await editor.readHeader();
  const romId = header.romId;
  let game = detectGame(romId);
  if (!game) {
    try {
      log(`[warn] Unknown ROM ID "${romId}". Attempting Platinum fallback detection...`);
      const probe = await editor.openNarcAtPath("poketool/personal/pl_personal.narc");
      const hasEntries = probe && Number.isFinite(probe.fileCount) && probe.fileCount > 0;
      await editor.closeNarc(probe.handle);
      if (hasEntries) {
        game = { family: "Plat", version: "Platinum" };
        log("[warn] Fallback detection: treating ROM as Platinum (pl_personal.narc present).");
      }
    } catch (e) {
      log(`[warn] Platinum fallback detection failed: ${e?.message || e}`);
    }
  }
  if (!game) {
    game = { family: "Plat", version: "Platinum" };
    log("[warn] Unknown ROM ID; defaulting to Platinum.");
  }
  const family = game.family;
  const version = game.version;
  log(`ROM ID: ${romId} (${version})`);

  log("Loading ARM9...");
  const arm9 = await loadArm9(editor, header);

  log("Parsing overlay table...");
  const ovtBytes = await editor.readBytes(header.arm9OvTOffset, header.arm9OvTSize);
  const overlayTable = parseOverlayTable(new Uint8Array(ovtBytes.bytes));

  const overlay5 = await readOverlay(editor, overlayTable, 5);
  const overlay1 = await readOverlay(editor, overlayTable, 1);
  const overlay131 = await readOverlay(editor, overlayTable, 131);

  const textBanks = TEXT_BANKS[family];
  const paths = NARC_PATHS[family];

  log("Loading text banks...");
  const textNarc = await editor.openNarcAtPath(paths.text);
  if (typeof window !== "undefined" && window.DDEX_SCAN_TEXTBANKS) {
    try {
      log("Debug: scanning all text banks for length 2550-2560...");
      const matches = [];
      for (let i = 0; i < textNarc.fileCount; i += 1) {
        const { subfileBuffer } = await editor.getNarcSubfile(textNarc.handle, i);
        const entries = parseTextBank(new Uint8Array(subfileBuffer));
        const len = Array.isArray(entries) ? entries.length : 0;
        if (len >= 2550 && len <= 2560) {
          matches.push({ bank: i, length: len });
        }
      }
      log(`Debug: text banks with length 2550-2560: ${JSON.stringify(matches)}`);
    } catch (e) {
      log(`[warn] Debug text bank scan failed: ${e?.message || e}`);
    }
  }
  const readTextBank = async (bankId) => {
    const { subfileBuffer } = await editor.getNarcSubfile(textNarc.handle, bankId);
    return parseTextBank(new Uint8Array(subfileBuffer));
  };

  let pokemonNames = [];
  try {
    pokemonNames = await readTextBank(textBanks.pokemonNames[0]);
  } catch {
    pokemonNames = await readTextFallback("./texts/pokedex.txt");
    log(`[warn] Falling back to texts/pokedex.txt for pokemon names`);
  }

  let abilityNames = [];
  try {
    abilityNames = await readTextBank(textBanks.abilities);
  } catch {
    abilityNames = await readTextFallback("./texts/abilities.txt");
    log(`[warn] Falling back to texts/abilities.txt for abilities`);
  }

  let moveNames = [];
  try {
    moveNames = await readTextBank(textBanks.moves);
  } catch {
    moveNames = await readTextFallback("./texts/moves.txt");
    log(`[warn] Falling back to texts/moves.txt for moves`);
  }

  let moveDescriptions = [];
  try {
    moveDescriptions = await readTextBank(textBanks.moveDescriptions);
  } catch {
    moveDescriptions = await readTextFallback("./texts/move_descriptions.txt");
    log(`[warn] Falling back to texts/move_descriptions.txt for move descriptions`);
  }

  let itemNames = [];
  try {
    itemNames = await readTextBank(textBanks.items);
  } catch {
    itemNames = await readTextFallback("./texts/items.txt");
    log(`[warn] Falling back to texts/items.txt for items`);
  }

  let itemDescriptions = [];
  try {
    itemDescriptions = await readTextBank(textBanks.itemDescriptions);
    if (!Array.isArray(itemDescriptions) || itemDescriptions.length <= 1) {
      throw new Error(`Item descriptions bank invalid (len=${itemDescriptions?.length ?? 0})`);
    }
  } catch {
    itemDescriptions = await readTextFallback("./texts/item_descriptions.txt");
    log(`[warn] Falling back to texts/item_descriptions.txt for item descriptions`);
  }

  let abilityDescriptions = [];
  try {
    if (textBanks.abilityDescriptions == null) {
      throw new Error("No ability descriptions bank configured.");
    }
    abilityDescriptions = await readTextBank(textBanks.abilityDescriptions);
  } catch {
    abilityDescriptions = await readTextFallback("./texts/ability_descriptions.txt");
    log(`[warn] Falling back to texts/ability_descriptions.txt for ability descriptions`);
  }

  let locationNames = [];
  try {
    locationNames = await readTextBank(textBanks.locations);
  } catch {
    locationNames = await readTextFallback("./texts/locations.txt");
    log(`[warn] Falling back to texts/locations.txt for locations`);
  }

  let trainerNames = [];
  try {
    trainerNames = await readTextBank(textBanks.trainerNames);
  } catch {
    trainerNames = await readTextFallback("./texts/tr_names.txt");
    log(`[warn] Falling back to texts/tr_names.txt for trainer names`);
  }

  let trainerClasses = [];
  try {
    trainerClasses = await readTextBank(textBanks.trainerClasses);
  } catch {
    trainerClasses = await readTextFallback("./texts/tr_classes.txt");
    log(`[warn] Falling back to texts/tr_classes.txt for trainer classes`);
  }

  let typeNames = [];
  try {
    typeNames = await readTextBank(textBanks.types);
  } catch {
    typeNames = [];
    log(`[warn] Unable to read type names; will emit UnknownType_*`);
  }

  await editor.closeNarc(textNarc.handle);

  const personalNarc = await editor.openNarcAtPath(paths.personal);
  const learnsetNarc = await editor.openNarcAtPath(paths.learnsets);
  const evolutionNarc = await editor.openNarcAtPath(paths.evolutions);
  const moveNarc = await editor.openNarcAtPath(paths.moveData);
  const trainerPropsNarc = await editor.openNarcAtPath(paths.trainerProperties);
  const trainerPartyNarc = await editor.openNarcAtPath(paths.trainerParty);

  log("Parsing personal data...");
  const personalEntries = [];
  for (let i = 0; i < personalNarc.fileCount; i += 1) {
    const { subfileBuffer } = await editor.getNarcSubfile(personalNarc.handle, i);
    personalEntries.push(parsePersonal(new Uint8Array(subfileBuffer)));
  }

  pokemonNames = appendForms(pokemonNames, personalEntries.length);

  if (typeof window !== "undefined" && window.BattleAliases && pokemonNames.length) {
    let removedAliasCount = 0;
    for (const name of pokemonNames) {
      const key = toID(name);
      if (key && Object.prototype.hasOwnProperty.call(window.BattleAliases, key)) {
        delete window.BattleAliases[key];
        removedAliasCount += 1;
      }
    }
    if (removedAliasCount) {
      log(`Removed ${removedAliasCount} BattleAliases entries matching ROM species names.`);
    }
  }

  const expandedHgssLearnsets = family === "HGSS" && personalEntries.length > 700;
  if (expandedHgssLearnsets) {
    log(`Detected HG-Engine ROM (expanded learnsets). personal entries=${personalEntries.length}`);
  }

  const isValidAbilityId = (id) => {
    if (!Number.isFinite(id) || id < 0 || id >= abilityNames.length) return false;
    const name = String(abilityNames[id] ?? "").trim();
    if (!name || name === "-" || name === "-----") return false;
    return true;
  };

  ENCOUNTER_FORM_STRIDE = expandedHgssLearnsets ? 2048 : 1024;
  if (expandedHgssLearnsets) {
    log(`HG-Engine encounter form stride set to ${ENCOUNTER_FORM_STRIDE}.`);
  }

  let expandedAbility3 = null;
  if (expandedHgssLearnsets) {
    try {
      const abilityNarc = await editor.openNarcAtPath("a/0/2/8");
      const { subfileBuffer } = await editor.getNarcSubfile(abilityNarc.handle, 7);
      await editor.closeNarc(abilityNarc.handle);
      const raw = new Uint8Array(subfileBuffer);
      const r = new Reader(raw);
      const entries = Math.floor(raw.length / 2);
      const count = Math.min(entries, personalEntries.length);
      expandedAbility3 = [];
      for (let i = 0; i < count; i += 1) expandedAbility3.push(r.u16());
      if (count < personalEntries.length) {
        log(`[warn] HG-Engine ability3 list shorter than personal entries (${count}/${personalEntries.length}).`);
      }
      log(`HG-Engine ability3 list loaded (entries=${expandedAbility3.length}).`);
    } catch (err) {
      expandedAbility3 = null;
      log(`[warn] Failed to load HG-Engine ability3 list: ${err.message || String(err)}`);
    }
  }

  if (expandedHgssLearnsets) {
    let has16BitAbilities = false;
    for (const entry of personalEntries) {
      const ability2U16 = entry.alignmentU16;
      if (ability2U16 === 0) continue;
      if (!isValidAbilityId(ability2U16)) continue;
      has16BitAbilities = true;
      break;
    }

    if (has16BitAbilities) {
      for (const entry of personalEntries) {
        entry.firstAbility = entry.abilityU16;
        entry.secondAbility = entry.alignmentU16;
      }
      log(`HG-Engine 16-bit abilities detected (entries updated=${personalEntries.length}).`);
    }
  }

  log("Parsing learnsets...");
  const learnsets = [];
  if (expandedHgssLearnsets) {
    log(`HG-Engine learnset NARC fileCount=${learnsetNarc.fileCount}`);
  }
  if (expandedHgssLearnsets && learnsetNarc.fileCount === 1) {
    const { subfileBuffer } = await editor.getNarcSubfile(learnsetNarc.handle, 0);
    const byteLen = subfileBuffer?.byteLength ?? 0;
    // log(`HG-Engine learnset subfile[0] size=${byteLen} (packed mode)`);
    const u8 = new Uint8Array(subfileBuffer);
    const pairCount = Math.floor(u8.length / 4);
    const monCount = personalEntries.length;
    let blockPairs = null;
    let blockCount = null;
    if (pairCount % monCount === 0) {
      blockPairs = pairCount / monCount;
      blockCount = monCount;
    } else if (pairCount % (monCount + 1) === 0) {
      blockPairs = pairCount / (monCount + 1);
      blockCount = monCount + 1;
    }

    if (blockPairs) {
      log(`HG-Engine packed learnsets detected (blockPairs=${blockPairs}, blocks=${blockCount}).`);
      const allBlocks = [];
      for (let i = 0; i < blockCount; i += 1) {
        const list = [];
        const base = i * blockPairs * 4;
        for (let j = 0; j < blockPairs; j += 1) {
          const off = base + j * 4;
          if (off + 4 > u8.length) break;
          const move = u8[off] | (u8[off + 1] << 8);
          const level = u8[off + 2] | (u8[off + 3] << 8);
          if (move === 0xFFFF || level === 0xFFFF) break;
          if (move === 0) continue;
          list.push({ level, move });
        }
        allBlocks.push(list);
      }

      if (allBlocks.length === monCount + 1) {
        const firstEmpty = allBlocks[0].length === 0;
        const lastEmpty = allBlocks[allBlocks.length - 1].length === 0;
        if (firstEmpty && !lastEmpty) {
          allBlocks.shift();
          log("HG-Engine packed learnsets: dropped empty leading block.");
        } else if (lastEmpty && !firstEmpty) {
          allBlocks.pop();
          log("HG-Engine packed learnsets: dropped empty trailing block.");
        }
      }

      learnsets.push(...allBlocks.slice(0, monCount));
    } else {
      log(`[warn] HG-Engine packed learnsets: unable to infer block size (pairCount=${pairCount}, mons=${monCount}). Falling back to terminator scan.`);
      const r = new Reader(u8);
      for (let i = 0; i < monCount && r.off + 4 <= u8.length; i += 1) {
        const list = [];
        while (r.off + 4 <= u8.length) {
          const move = r.u16();
          const level = r.u16();
          if (move === 0xFFFF || level === 0xFFFF) break;
          if (move === 0) continue;
          list.push({ level, move });
        }
        learnsets.push(list);
      }
    }

    if (learnsets.length < monCount) {
      log(`[warn] HG-Engine packed learnsets ended early (${learnsets.length}/${monCount}).`);
      while (learnsets.length < monCount) learnsets.push([]);
    }
  } else {
    for (let i = 0; i < learnsetNarc.fileCount; i += 1) {
      const { subfileBuffer } = await editor.getNarcSubfile(learnsetNarc.handle, i);
      if (expandedHgssLearnsets) {
        const byteLen = subfileBuffer?.byteLength ?? 0;
        log(`HG-Engine learnset subfile[${i}] size=${byteLen}`);
      }
      learnsets.push(parseLearnset(new Uint8Array(subfileBuffer), { expanded: expandedHgssLearnsets }));
    }
  }
  log(`Learnset[1] = ${JSON.stringify(learnsets[1] ?? [])}`);

  log("Parsing evolutions...");
  const evolutions = [];
  for (let i = 0; i < evolutionNarc.fileCount; i += 1) {
    const { subfileBuffer } = await editor.getNarcSubfile(evolutionNarc.handle, i);
    evolutions.push(parseEvolution(new Uint8Array(subfileBuffer)));
  }

  log("Parsing move data...");
  const moveData = [];
  for (let i = 0; i < moveNarc.fileCount; i += 1) {
    const { subfileBuffer } = await editor.getNarcSubfile(moveNarc.handle, i);
    moveData.push(parseMove(new Uint8Array(subfileBuffer)));
  }

  await editor.closeNarc(personalNarc.handle);
  await editor.closeNarc(learnsetNarc.handle);
  await editor.closeNarc(evolutionNarc.handle);
  await editor.closeNarc(moveNarc.handle);

  log("Reading machine moves...");
  const machineOffset = family === "Plat" ? 0xF0BFC : 0x1000CC;
  const machineMoves = readU16List(arm9, machineOffset, 100, log);
  const machineMoveNames = machineMoves.map((id) => moveNames[id] ?? `UNK_${id}`);

  log("Building CSV outputs...");
  const pokemonPersonalCsv = [];
  const personalHeaders = [
    "ID",
    "Name",
    "Type1",
    "Type2",
    "BaseHP",
    "BaseAttack",
    "BaseDefense",
    "BaseSpecialAttack",
    "BaseSpecialDefense",
    "BaseSpeed",
    "Ability1",
    "Ability2",
    ...(expandedAbility3 ? ["Ability3"] : []),
    "Item1",
    "Item2",
  ];
  pokemonPersonalCsv.push(personalHeaders.join(","));
  for (let i = 0; i < personalEntries.length; i += 1) {
    const entry = personalEntries[i];
    const t1 = normalizeTypeName(typeNames[entry.type1] ?? `UnknownType_${entry.type1}`);
    const t2 = normalizeTypeName(typeNames[entry.type2] ?? `UnknownType_${entry.type2}`);
    const ability3Id = expandedAbility3 ? expandedAbility3[i] : null;
    const ability3Name =
      expandedAbility3 && Number.isFinite(ability3Id)
        ? abilityNames[ability3Id] ?? `ABILITY_${ability3Id}`
        : "";
    const row = [
      i,
      pokemonNames[i] ?? `UNKNOWN_${i}`,
      t1,
      t2,
      entry.baseHP,
      entry.baseAtk,
      entry.baseDef,
      entry.baseSpAtk,
      entry.baseSpDef,
      entry.baseSpeed,
      abilityNames[entry.firstAbility] ?? `ABILITY_${entry.firstAbility}`,
      abilityNames[entry.secondAbility] ?? `ABILITY_${entry.secondAbility}`,
      ...(expandedAbility3 ? [ability3Name] : []),
      itemNames[entry.item1] ?? `ITEM_${entry.item1}`,
      itemNames[entry.item2] ?? `ITEM_${entry.item2}`,
    ];
    pokemonPersonalCsv.push(csvLine(row));
  }

  const learnsetCsv = [];
  const learnsetLimit = expandedHgssLearnsets ? 40 : 20;
  if (expandedHgssLearnsets) {
    log(`HG-Engine learnset format enabled (LevelMove columns=${learnsetLimit}).`);
  }
  learnsetCsv.push(["ID", "Name", ...Array.from({ length: learnsetLimit }, (_, i) => `LevelMove${i}`)].join(","));
  for (let i = 0; i < learnsets.length; i += 1) {
    const moves = learnsets[i];
    const cells = [String(i), pokemonNames[i] ?? `UNKNOWN_${i}`];
    let count = 0;
    for (const entry of moves) {
      if (count >= learnsetLimit) break;
      const moveName = moveNames[entry.move] ?? `MOVE_${entry.move}`;
      cells.push(`${entry.level}|${moveName}`);
      count += 1;
    }
    while (count < learnsetLimit) {
      cells.push("");
      count += 1;
    }
    learnsetCsv.push(cells.join(","));
  }

  const evolutionCsv = [];
  evolutionCsv.push("ID,Name,[Method|Param|Target]");
  for (let i = 0; i < evolutions.length; i += 1) {
    const list = evolutions[i];
    const row = [String(i), pokemonNames[i] ?? `UNKNOWN_${i}`];
    for (const evo of list) {
      if (evo.target === 0) break;
      const methodName = EVOLUTION_METHOD_NAMES[evo.method] ?? String(evo.method);
      const paramString = formatEvolutionParam(methodName, evo.param, { itemNames, moveNames, pokemonNames });
      const targetName = pokemonNames[evo.target] ?? `UNKNOWN_${evo.target}`;
      row.push(`[${methodName}|${paramString}|${targetName}]`);
    }
    evolutionCsv.push(row.join(","));
  }

  const moveCsv = [];
  moveCsv.push("Move ID,Move Name,Move Type,Move Split,Power,Accuracy,Priority,Side Effect Probability,PP,Range,Flags,Effect Description");
  for (let i = 0; i < moveData.length; i += 1) {
    const m = moveData[i];
    const typeStr = normalizeTypeName(typeNames[m.movetype] ?? `UnknownType_${m.movetype}`);
    const splitStr = ["PHYSICAL", "SPECIAL", "STATUS"][m.split] ?? m.split;
    const row = [
      i,
      moveNames[i] ?? `MOVE_${i}`,
      typeStr,
      splitStr,
      m.damage,
      m.accuracy,
      m.priority,
      m.sideEffectProbability,
      m.pp,
      attackRangeName(m.target),
      moveFlagsString(m.flagField),
      battleEffectDesc(m.battleeffect),
    ];
    moveCsv.push(row.join(","));
  }

  const tmhmCsv = [];
  const tmHeader = ["ID", "Name"];
  for (let i = 0; i < machineMoveNames.length; i += 1) {
    const label = i < 92 ? `TM${String(i + 1).padStart(2, "0")}` : `HM${String(i - 92 + 1).padStart(2, "0")}`;
    tmHeader.push(`${label} - ${machineMoveNames[i]}`);
  }
  tmhmCsv.push(tmHeader.join(","));
  for (let i = 0; i < personalEntries.length; i += 1) {
    const entry = personalEntries[i];
    const bits = [];
    for (let b = 0; b < machineMoveNames.length; b += 1) {
      bits.push(entry.machines.has(b) ? "true" : "false");
    }
    tmhmCsv.push(`${i},${pokemonNames[i] ?? `UNKNOWN_${i}`},[${bits.join(",")}]`);
  }

  log("Parsing egg moves...");
  const eggMoveCsv = [];
  eggMoveCsv.push("SpeciesID,SpeciesName,MoveID,MoveName");
  if (family === "HGSS") {
    try {
      const eggNarc = await editor.openNarcAtPath(paths.eggMoves);
      const { subfileBuffer } = await editor.getNarcSubfile(eggNarc.handle, 0);
      await editor.closeNarc(eggNarc.handle);
      const eggU8 = new Uint8Array(subfileBuffer);
      const r = new Reader(eggU8);
      let currentSpecies = null;
      while (r.off + 2 <= eggU8.length) {
        const val = r.u16();
        if (val === 0xFFFF) break;
        if (val > 20000) {
          currentSpecies = val - 20000;
        } else if (currentSpecies != null) {
          const speciesName = pokemonNames[currentSpecies] ?? `SPECIES_${currentSpecies}`;
          const moveName = moveNames[val] ?? `MOVE_${val}`;
          eggMoveCsv.push(`${currentSpecies},${speciesName},${val},${moveName}`);
        }
      }
    } catch (err) {
      if (expandedHgssLearnsets) {
        log(`[warn] HG-Engine egg moves skipped due to error: ${err.message || String(err)}`);
      } else {
        throw err;
      }
    }
  } else {
    if (!overlay5) {
      log("[warn] Overlay 5 not available; egg move data skipped.");
    } else {
      const offset = 0x29222;
      const r = new Reader(overlay5.data);
      r.seek(offset);
      let currentSpecies = null;
      while (r.off + 2 <= overlay5.data.length) {
        const val = r.u16();
        if (val === 0xFFFF) break;
        if (val > 20000) {
          currentSpecies = val - 20000;
        } else if (currentSpecies != null) {
          const speciesName = pokemonNames[currentSpecies] ?? `SPECIES_${currentSpecies}`;
          const moveName = moveNames[val] ?? `MOVE_${val}`;
          eggMoveCsv.push(`${currentSpecies},${speciesName},${val},${moveName}`);
        }
      }
    }
  }

  log("Parsing encounters...");
  const encounters = [];
  let encounterPath = family === "HGSS"
    ? (version === "HeartGold" ? paths.encountersHG : paths.encountersSS)
    : paths.encounters;

  const openEncounterNarc = async (path) => {
    const narc = await editor.openNarcAtPath(path);
    let score = 0;
    try {
      if (family === "HGSS" && narc.fileCount > 1) {
        const { subfileBuffer } = await editor.getNarcSubfile(narc.handle, 1);
        const u8 = new Uint8Array(subfileBuffer);
        const enc = parseEncounterHGSS(u8);
        const distinctLevels = new Set(Array.from(enc.walkingLevels)).size;
        const distinctMorning = new Set(Array.from(enc.morningPokemon)).size;
        score = distinctLevels + distinctMorning;
      }
    } catch {
      score = 0;
    }
    return { narc, score };
  };

  if (family === "HGSS") {
    const primary = encounterPath;
    const alt = encounterPath.startsWith("data/") ? encounterPath.slice(5) : `data/${encounterPath}`;
    let chosen = null;
    try {
      const primaryRes = await openEncounterNarc(primary);
      const altRes = await openEncounterNarc(alt);
      if (log) {
        log(`HGSS encounter path scores: ${primary}=${primaryRes.score}, ${alt}=${altRes.score}`);
      }
      if (altRes.score > primaryRes.score) {
        await editor.closeNarc(primaryRes.narc.handle);
        chosen = { path: alt, narc: altRes.narc };
      } else {
        await editor.closeNarc(altRes.narc.handle);
        chosen = { path: primary, narc: primaryRes.narc };
      }
    } catch {
      chosen = { path: encounterPath, narc: await editor.openNarcAtPath(encounterPath) };
    }
    encounterPath = chosen.path;
    var encounterNarc = chosen.narc;
  } else {
    var encounterNarc = await editor.openNarcAtPath(encounterPath);
  }
  if (log && (encounterNarc.sizeMismatch || encounterNarc.lenient)) {
    log("[warn] Encounter NARC parsed leniently; offsets may be unreliable.");
  }
  let hgssWalkingSampleLogged = false;
  for (let i = 0; i < encounterNarc.fileCount; i += 1) {
    try {
      const { subfileBuffer } = await editor.getNarcSubfile(encounterNarc.handle, i);
      const u8 = new Uint8Array(subfileBuffer);
      if (family === "HGSS") {
        const enc = parseEncounterHGSS(u8);
        if (!hgssWalkingSampleLogged && i === 1) {
          hgssWalkingSampleLogged = true;
          const rawLevels = Array.from(u8.slice(8, 20));
          log(`HGSS encounter[${i}] walkingRate=${enc.walkingRate} levels=${Array.from(enc.walkingLevels).join(",")}`);
          log(`HGSS encounter[${i}] raw walking level bytes=${rawLevels.join(",")}`);
          log(`HGSS encounter[${i}] morning=${Array.from(enc.morningPokemon).slice(0, 12).join(",")}`);
          log(`HGSS encounter[${i}] day=${Array.from(enc.dayPokemon).slice(0, 12).join(",")}`);
          log(`HGSS encounter[${i}] night=${Array.from(enc.nightPokemon).slice(0, 12).join(",")}`);
        }
        encounters.push({
          fileId: i,
          rates: {
            walking: enc.walkingRate,
            surf: enc.surfRate,
            rockSmash: enc.rockSmashRate,
            oldRod: enc.oldRodRate,
            goodRod: enc.goodRodRate,
            superRod: enc.superRodRate,
          },
          walkingLevels: Array.from(enc.walkingLevels),
          grass: {
            morning: exportU16Named(enc.morningPokemon, pokemonNames),
            day: exportU16Named(enc.dayPokemon, pokemonNames),
            night: exportU16Named(enc.nightPokemon, pokemonNames),
          },
          surf: exportMinMaxU16Named(enc.surfPokemon, enc.surfMinLevels, enc.surfMaxLevels, pokemonNames),
          rockSmash: exportMinMaxU16Named(enc.rockSmashPokemon, enc.rockSmashMinLevels, enc.rockSmashMaxLevels, pokemonNames),
          oldRod: exportMinMaxU16Named(enc.oldRodPokemon, enc.oldRodMinLevels, enc.oldRodMaxLevels, pokemonNames),
          goodRod: exportMinMaxU16Named(enc.goodRodPokemon, enc.goodRodMinLevels, enc.goodRodMaxLevels, pokemonNames),
          superRod: exportMinMaxU16Named(enc.superRodPokemon, enc.superRodMinLevels, enc.superRodMaxLevels, pokemonNames),
          swarms: exportU16Named(enc.swarmPokemon, pokemonNames),
          pokegearMusic: {
            hoenn: exportU16Named(enc.hoennMusicPokemon, pokemonNames),
            sinnoh: exportU16Named(enc.sinnohMusicPokemon, pokemonNames),
          },
        });
      } else {
        const enc = parseEncounterDPPt(u8);
        encounters.push({
          fileId: i,
          rates: {
            walking: enc.walkingRate,
            surf: enc.surfRate,
            oldRod: enc.oldRodRate,
            goodRod: enc.goodRodRate,
            superRod: enc.superRodRate,
          },
          walking: exportWalkingDPPt(enc, pokemonNames),
          timeSpecific: {
            day: exportU32Named(enc.dayPokemon, pokemonNames),
            night: exportU32Named(enc.nightPokemon, pokemonNames),
          },
          radar: exportU32Named(enc.radarPokemon, pokemonNames),
          dualSlot: {
            ruby: exportU32Named(enc.rubyPokemon, pokemonNames),
            sapphire: exportU32Named(enc.sapphirePokemon, pokemonNames),
            emerald: exportU32Named(enc.emeraldPokemon, pokemonNames),
            fireRed: exportU32Named(enc.fireRedPokemon, pokemonNames),
            leafGreen: exportU32Named(enc.leafGreenPokemon, pokemonNames),
          },
          swarms: exportU16Named(enc.swarmPokemon, pokemonNames),
          forms: {
            regionalForms: Array.from(enc.regionalForms),
            unknownTable: enc.unknownTable,
          },
          surf: exportMinMaxU16Named(enc.surfPokemon, enc.surfMinLevels, enc.surfMaxLevels, pokemonNames),
          oldRod: exportMinMaxU16Named(enc.oldRodPokemon, enc.oldRodMinLevels, enc.oldRodMaxLevels, pokemonNames),
          goodRod: exportMinMaxU16Named(enc.goodRodPokemon, enc.goodRodMinLevels, enc.goodRodMaxLevels, pokemonNames),
          superRod: exportMinMaxU16Named(enc.superRodPokemon, enc.superRodMinLevels, enc.superRodMaxLevels, pokemonNames),
        });
      }
    } catch (e) {
      log(`[warn] Encounter file ${i} parse failed; leaving blank. ${e?.message || e}`);
      encounters.push({ fileId: i, blank: true, error: e?.message || String(e) });
    }
  }
  await editor.closeNarc(encounterNarc.handle);

  log("Parsing event overworlds...");
  const eventOverworldCsv = [];
  eventOverworldCsv.push("EventFileID,OverworldIndex,OwID,OverlayTableEntry,OwSpriteID,Movement,Type,Flag,ScriptNumber,Orientation,SightRange,Unknown1,Unknown2,XRange,YRange,XMatrix,YMatrix,XMap,YMap,XCoord,YCoord,ZPosition,IsAlias");
  const eventNarc = await editor.openNarcAtPath(paths.eventFiles);
  const eventFileCount = eventNarc.fileCount;

  const overworldTable = new Map();
  if (family === "Plat" && overlay5) {
    const tableOffset = 0x2BC34;
    if (tableOffset + 8 <= overlay5.data.length) {
      const r = new Reader(overlay5.data);
      r.seek(tableOffset);
      while (r.off + 8 <= overlay5.data.length) {
        const entryId = r.u32();
        if (entryId === 0xFFFF) break;
        const spriteId = r.u32();
        overworldTable.set(entryId, spriteId);
      }
    } else {
      log("[warn] Platinum overworld table offset outside overlay5.");
    }
  } else if (family === "HGSS" && overlay1) {
    const pointerAddr = 0x021F92FC;
    const pointerOffset = pointerAddr - overlay1.ramAddress;
    if (pointerOffset >= 0 && pointerOffset + 4 <= overlay1.data.length) {
      const r = new Reader(overlay1.data);
      r.seek(pointerOffset);
      const tableRam = r.u32();
      let tableData = overlay1;
      if (overlay131 && tableRam >= overlay131.ramAddress && tableRam < overlay131.ramAddress + overlay131.data.length) {
        tableData = overlay131;
      }
      const tableOffset = tableRam - tableData.ramAddress;
      const tr = new Reader(tableData.data);
      tr.seek(tableOffset);
      while (tr.off + 6 <= tableData.data.length) {
        const entryId = tr.u16();
        if (entryId === 0xFFFF) break;
        const spriteId = tr.u16();
        tr.u16(); // properties
        overworldTable.set(entryId, spriteId);
      }
    } else {
      log("[warn] Unable to read HGSS overworld table pointer from overlay 1.");
    }
  }

  for (let i = 0; i < eventNarc.fileCount; i += 1) {
    const { subfileBuffer } = await editor.getNarcSubfile(eventNarc.handle, i);
    const overworlds = parseEventOverworlds(new Uint8Array(subfileBuffer));
    for (let j = 0; j < overworlds.length; j += 1) {
      const ow = overworlds[j];
      const xCoord = ow.xMapPosition + 32 * ow.xMatrixPosition;
      const yCoord = ow.yMapPosition + 32 * ow.yMatrixPosition;
      const isAlias = ow.scriptNumber === 0xFFFF ? 1 : 0;
      let owSpriteIdStr = "";
      if (!OW_3D_ENTRIES.has(ow.overlayTableEntry)) {
        const spriteId = overworldTable.get(ow.overlayTableEntry);
        if (spriteId != null) owSpriteIdStr = String(spriteId);
      }
      eventOverworldCsv.push([
        i,
        j,
        ow.owID,
        ow.overlayTableEntry,
        owSpriteIdStr,
        ow.movement,
        ow.type,
        ow.flag,
        ow.scriptNumber,
        ow.orientation,
        ow.sightRange,
        ow.unknown1,
        ow.unknown2,
        ow.xRange,
        ow.yRange,
        ow.xMatrixPosition,
        ow.yMatrixPosition,
        ow.xMapPosition,
        ow.yMapPosition,
        xCoord,
        yCoord,
        ow.zPosition,
        isAlias,
      ].join(","));
    }
  }
  await editor.closeNarc(eventNarc.handle);

  log("Parsing map headers...");
  const mapHeadersCsv = [];
  mapHeadersCsv.push("HeaderID,ScriptFileID,EventFileID,MapNameIndexInTextArchive,WildPokemonFileID,WeatherID");
  let dynamicHeaders = null;
  const dynamicPath = family === "Plat"
    ? ["data/debug/cb_edit/d_test.narc", "debug/cb_edit/d_test.narc"]
    : ["a/0/5/0"];
  const isHeaderValid = (headerBytes) => {
    if (!headerBytes || headerBytes.length < 24) return false;
    const h = family === "Plat"
      ? parseMapHeaderPlatFromBytes(headerBytes)
      : parseMapHeaderHGSSFromBytes(headerBytes);
    const scriptOk = h.scriptFileID === 0xFFFF || h.scriptFileID < trainerPropsNarc.fileCount || h.scriptFileID < 6000;
    const eventOk = h.eventFileID === 0xFFFF || h.eventFileID < eventFileCount;
    return scriptOk && eventOk;
  };

  for (const path of dynamicPath) {
    try {
      const candidate = await editor.openNarcAtPath(path);
      if (candidate && candidate.fileCount > 0) {
        const sampleCount = Math.min(5, candidate.fileCount);
        let validCount = 0;
        for (let i = 0; i < sampleCount; i += 1) {
          const { subfileBuffer } = await editor.getNarcSubfile(candidate.handle, i);
          const headerBytes = new Uint8Array(subfileBuffer);
          if (isHeaderValid(headerBytes)) validCount += 1;
        }
        if (validCount >= Math.max(1, Math.floor(sampleCount * 0.6))) {
          dynamicHeaders = candidate;
          break;
        }
      }
      if (candidate) await editor.closeNarc(candidate.handle);
    } catch {
      dynamicHeaders = null;
    }
  }

  if (dynamicHeaders) {
    log("Detected dynamic header patch. Reading headers from NARC...");
    for (let i = 0; i < dynamicHeaders.fileCount; i += 1) {
      const { subfileBuffer } = await editor.getNarcSubfile(dynamicHeaders.handle, i);
      const headerBytes = new Uint8Array(subfileBuffer);
      if (headerBytes.length < 24) {
        log(`[warn] Header file ${i} too small (${headerBytes.length} bytes), skipping.`);
        continue;
      }
      const h = family === "Plat"
        ? parseMapHeaderPlatFromBytes(headerBytes)
        : parseMapHeaderHGSSFromBytes(headerBytes);
      mapHeadersCsv.push([i, h.scriptFileID, h.eventFileID, h.locationName, h.wildPokemon, h.weatherID].join(","));
    }
    await editor.closeNarc(dynamicHeaders.handle);
  } else {
    let mapnameLength = 0;
    try {
      const mapnameRes = await editor.readFileByPath("fielddata/maptable/mapname.bin");
      mapnameLength = new Uint8Array(mapnameRes.fileBuffer).length;
    } catch {
      log("[warn] Unable to read mapname.bin for header count; defaulting to 1024.");
      mapnameLength = 16 * 1024;
    }
    const headerCount = Math.floor(mapnameLength / 16);
    const headerTableOffset = family === "Plat" ? 0xE601C : 0xF6BE0;
    for (let i = 0; i < headerCount; i += 1) {
      const offset = headerTableOffset + i * 24;
      if (offset + 24 > arm9.length) {
        log(`[warn] ARM9 header table exceeds ARM9 size at header ${i}, stopping.`);
        break;
      }
      const h = family === "Plat"
        ? parseMapHeaderPlat(arm9, offset)
        : parseMapHeaderHGSS(arm9, offset);
      mapHeadersCsv.push([i, h.scriptFileID, h.eventFileID, h.locationName, h.wildPokemon, h.weatherID].join(","));
    }
  }

  log("Parsing trainers...");
  const trainerText = [];
  const trainerProps = [];
  for (let i = 0; i < trainerPropsNarc.fileCount; i += 1) {
    try {
      const { subfileBuffer } = await editor.getNarcSubfile(trainerPropsNarc.handle, i);
      const r = new Reader(new Uint8Array(subfileBuffer));
      const flags = r.u8();
      const chooseMoves = (flags & 1) !== 0;
      const chooseItems = (flags & 2) !== 0;
      const trainerClass = r.u8();
      r.u8(); // trDataUnknown
      const partyCount = r.u8();
      const trainerItems = [r.u16(), r.u16(), r.u16(), r.u16()];
      r.u32(); // AI
      const doubleBattle = r.u32() === 2;
      trainerProps.push({ chooseMoves, chooseItems, trainerClass, partyCount, trainerItems, doubleBattle });
    } catch (e) {
      log(`[warn] Trainer props ${i} parse failed; skipping trainer. ${e?.message || e}`);
      trainerProps.push(null);
    }
  }

  const genderTableOffset = family === "Plat" ? 0xF0714 : 0xFFB90;
  const genderTableLength = family === "Plat" ? 105 : 128;
  const genderTable = arm9.subarray(genderTableOffset, genderTableOffset + genderTableLength);
  const trainerClassIsMale = (id) => (genderTable[id] ?? 0) !== 1;

  const aiBackportEnabled = family === "Plat" && arm9.subarray(0x793B8, 0x793BC).every((b, idx) => b === [0xF0, 0xB5, 0x93, 0xB0][idx]);

  for (let i = 1; i < trainerPartyNarc.fileCount; i += 1) {
    const props = trainerProps[i];
    if (!props) continue;
    let party = [];
    try {
      const { subfileBuffer } = await editor.getNarcSubfile(trainerPartyNarc.handle, i);
      const r = new Reader(new Uint8Array(subfileBuffer));
      const max = Math.min(props.partyCount, 6);
      for (let p = 0; p < max; p += 1) {
        const difficulty = r.u8();
        const genderAbilityFlags = r.u8();
        const level = r.u16();
        const monFull = r.u16();
        const pokeId = monFull & ((1 << 10) - 1);
        const formId = (monFull >> 10) & ((1 << 6) - 1);
        let heldItem = null;
        let moves = null;
        if (props.chooseItems) heldItem = r.u16();
        if (props.chooseMoves) {
          moves = [r.u16(), r.u16(), r.u16(), r.u16()].map((v) => (v === 0xFFFF ? 0 : v));
        }
        if (family === "HGSS" || family === "Plat") r.u16(); // ballSeals
        party.push({ difficulty, genderAbilityFlags, level, pokeId, formId, heldItem, moves });
      }
    } catch (e) {
      log(`[warn] Trainer ${i} party parse failed; skipping trainer. ${e?.message || e}`);
      continue;
    }

    const trainerMale = trainerClassIsMale(props.trainerClass);
    const partyOut = party.map((mon) => {
      const genderOverride = mon.genderAbilityFlags & 0x0F;
      const abilityOverride = mon.genderAbilityFlags >> 4;
      const baseGenderRatio = personalEntries[mon.pokeId]?.genderVec ?? 0;
      const pid = dvGeneratePID({
        trainerIdx: i,
        trainerClassIdx: props.trainerClass,
        pokeIdx: mon.pokeId,
        pokeLevel: mon.level,
        baseGenderRatio,
        genderOverride,
        abilityOverride,
        difficultyValue: mon.difficulty,
        trainerMale,
        useGenderUpdate: family === "HGSS" || aiBackportEnabled,
      });
      const nature = NATURES[dvNatureFromPid(pid)];
      let gender = "random";
      if (genderOverride === 1) gender = "M";
      if (genderOverride === 2) gender = "F";
      const abilityIndex = pid % 2 === 0 ? personalEntries[mon.pokeId]?.firstAbility : personalEntries[mon.pokeId]?.secondAbility;
      const ability = abilityNames[abilityIndex] ?? `ABILITY_${abilityIndex}`;
      const item = mon.heldItem != null ? (itemNames[mon.heldItem] ?? `ITEM_${mon.heldItem}`) : "None";
      const ivs = Math.floor((mon.difficulty * 31) / 255);
      let movesOut = [];
      if (mon.moves) {
        movesOut = mon.moves.map((m) => moveNames[m] ?? "None");
      } else {
        const learnset = learnsets[mon.pokeId] ?? [];
        movesOut = learnsetAtLevel(learnset, mon.level).map((m) => moveNames[m] ?? "None");
      }
      return {
        name: pokemonNames[mon.pokeId] ?? `SPECIES_${mon.pokeId}`,
        gender,
        item,
        ability,
        level: mon.level,
        nature,
        ivs,
        moves: movesOut,
      };
    });

    const trainerItems = props.trainerItems.map((id) => (id ? (itemNames[id] ?? `ITEM_${id}`) : "None"));
    const trainerData = {
      index: i,
      trainerName: trainerNames[i] ?? `TRAINER_${i}`,
      trainerClass: trainerClasses[props.trainerClass] ?? `CLASS_${props.trainerClass}`,
      trainerItems,
      party: partyOut,
    };
    trainerText.push(formatTrainerDoc(trainerData));
  }

  await editor.closeNarc(trainerPropsNarc.handle);
  await editor.closeNarc(trainerPartyNarc.handle);

  log("Preparing scripts export...");
  const scriptDb = await loadScriptDatabase(family);
  const nameMaps = buildScriptNameMaps({ pokemonNames, itemNames, moveNames, trainerNames });
  const scriptCtx = {
    db: scriptDb,
    comparisonOperators: scriptDb.comparisonOperators,
    specialOverworlds: scriptDb.specialOverworlds,
    overworldDirections: scriptDb.overworldDirections,
    sounds: scriptDb.sounds,
    nameMaps,
    endCodes: new Set([0x2, 0x16, 0x1B]),
    family,
    version,
    romId,
  };

  const scriptsEntries = [];
  const scriptsTextMap = new Map();
  try {
    const scriptsNarc = await editor.openNarcAtPath(paths.scripts);
    if (scriptsNarc.sizeMismatch || scriptsNarc.lenient) {
      log("[warn] Script NARC parsed leniently; some scripts may be truncated.");
    }
    for (let i = 0; i < scriptsNarc.fileCount; i += 1) {
      try {
        const { subfileBuffer } = await editor.getNarcSubfile(scriptsNarc.handle, i);
        if (scriptsNarc.lenient && subfileBuffer.byteLength === 0) {
          log(`[warn] Script file ${i} is empty (possible NARC truncation).`);
          continue;
        }
        const parsed = parseScriptFile(new Uint8Array(subfileBuffer), scriptCtx);
        if (parsed.isLevelScript) continue;
        if (!parsed.scripts.length) continue;
        const txt = buildScriptText(parsed, scriptCtx, i);
        scriptsTextMap.set(i, txt);
        scriptsEntries.push({
          path: `scripts/${String(i).padStart(4, "0")}.txt`,
          data: TEXT_ENCODER.encode(txt + "\n"),
        });
      } catch (e) {
        log(`[warn] Script file ${i} parse failed: ${e?.message || e}`);
      }
    }
    await editor.closeNarc(scriptsNarc.handle);
  } catch (e) {
    log(`[warn] Scripts export skipped: ${e?.message || e}`);
    scriptsEntries.push({
      path: "scripts/README.txt",
      data: TEXT_ENCODER.encode(`Scripts export skipped due to error: ${e?.message || e}\n`),
    });
  }

  return {
    romId,
    family,
    version,
    csv: {
      pokemonPersonal: pokemonPersonalCsv,
      learnsets: learnsetCsv,
      evolutions: evolutionCsv,
      moves: moveCsv,
      tmhm: tmhmCsv,
      eggMoves: eggMoveCsv,
      eventOverworlds: eventOverworldCsv,
      mapHeaders: mapHeadersCsv,
    },
    encounters,
    trainerText,
    scriptsEntries,
    scriptsTextMap,
    texts: {
      pokemonNames,
      abilityNames,
      abilityDescriptions,
      moveNames,
      moveDescriptions,
      itemNames,
      itemDescriptions,
      trainerNames,
      trainerClasses,
      typeNames,
      locationNames,
    },
  };
}
