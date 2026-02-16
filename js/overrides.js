params = new URLSearchParams(window.location.search);
const gameParam = params.get('game');
const romOverrideActive = localStorage.romOverrides === "1";
game = gameParam || (romOverrideActive ? null : localStorage.game);
gameTitles = {
	"vintagewhiteplus": "Vintage White+",
	"blazeblack2redux": "Blaze Black/Volt White 2 Redux",
	"blindingwhite2": "Blinding White 2",
	"cascadewhite": "Cascade White",
	"cascadewhite2": "Cascade White",
	"renegadeplatinum": "Renegade Platinum",
  "sterlingsilver": "Sterling Silver"
}
unrecognizedPoks = {}

truncatedSpeciesNames = {
	"fletcinder": "fletchinder"
}

const ROM_CACHE_FLAG = "romOverrides";
const ROM_KEYS = {
  overrides: "overrides",
  searchIndex: "searchindex",
  searchIndexOffset: "searchindex_offset",
  searchIndexCount: "searchindex_count",
  title: "gameTitle",
};

function setDexTitle(title) {
  if (!title) return;
  const el = document.getElementById("dex-title");
  if (el) {
    el.textContent = `${title} Dex`;
  }
}

function setDexTitleFromStorage() {
  const gameKey = localStorage.game;
  if (gameKey && gameTitles[gameKey]) {
    setDexTitle(gameTitles[gameKey]);
    return true;
  }
  const romTitle = localStorage.romTitle;
  if (romTitle) {
    const displayTitle = toTitleCaseWords(romTitle);
    setDexTitle(displayTitle || romTitle);
    return true;
  }
  
  return false;
}

function applySearchIndex(searchIndex, offsets, counts) {
  if (Array.isArray(searchIndex)) window.BattleSearchIndex = searchIndex;
  if (Array.isArray(offsets)) window.BattleSearchIndexOffset = offsets;
  if (counts && typeof counts === "object") window.BattleSearchCountIndex = counts;
}

function applyRomOverridesFromCache() {
  if (localStorage[ROM_CACHE_FLAG] !== "1") return false;
  try {
    const overrides = JSON.parse(localStorage[ROM_KEYS.overrides] || "null");
    window.overrides = overrides
    const searchIndex = JSON.parse(localStorage[ROM_KEYS.searchIndex] || "null");
    const searchIndexOffset = JSON.parse(localStorage[ROM_KEYS.searchIndexOffset] || "null");
    const searchIndexCount = JSON.parse(localStorage[ROM_KEYS.searchIndexCount] || "null");
    const title = localStorage[ROM_KEYS.title];
    if (!overrides || !searchIndex || !searchIndexOffset || !searchIndexCount) return false;
    overrideDexData(overrides);
    applySearchIndex(searchIndex, searchIndexOffset, searchIndexCount);
    const displayTitle = toTitleCaseWords(title);
    setDexTitle(displayTitle || title);
    window.DDEX_ROM_OVERRIDES = { overrides, searchIndex, searchIndexOffset, searchIndexCount, title };
    console.log("Loaded ROM overrides from cache");
    return true;
  } catch (e) {
    console.warn("Failed to load ROM overrides from cache", e);
    return false;
  }
}

if (!params.get('game')) {
  applyRomOverridesFromCache();
} else {
  localStorage.removeItem("gameTitle");
}

function setGameDexTitle(gameKey) {
  const title = gameTitles[gameKey];
  if (!title) return;
  const el = document.getElementById("dex-title");
  if (el) {
    el.textContent = `${title} Dex`;
  }
}

function applyGameOverridesFromCache() {
  if (romOverrideActive) return false;
  if (!localStorage.overrides) return false;
  const gameKey = localStorage.game;
  if (!gameKey || !gameTitles[gameKey]) return false;
  if (['/', '/index.html'].includes(window.location.pathname)) return false;
  try {
    const overrides = JSON.parse(localStorage.overrides || "null");
    if (!overrides) return false;
    overrideDexData(overrides);
    setGameDexTitle(gameKey);
    console.log("Loaded game overrides from cache");
    return true;
  } catch (e) {
    console.warn("Failed to load game overrides from cache", e);
    return false;
  }
}

if (!params.get('game')) {
  applyGameOverridesFromCache();
}

setDexTitleFromStorage();

function clearRomCache() {
  localStorage.removeItem(ROM_CACHE_FLAG);
  localStorage.removeItem(ROM_KEYS.overrides);
  localStorage.removeItem(ROM_KEYS.searchIndex);
  localStorage.removeItem(ROM_KEYS.searchIndexOffset);
  localStorage.removeItem(ROM_KEYS.searchIndexCount);
  localStorage.removeItem(ROM_KEYS.title);
  localStorage.removeItem("romTitle");
  localStorage.removeItem("gameTitle");
}

$(document).on('click', '#reset-cache', function() {
  delete localStorage.overrides
  clearRomCache();
  localStorage.removeItem("game");
  location.reload()
})

function setRomStatus(msg, isErr) {
  const prefix = isErr ? "[error] " : "";
  if (isErr) console.error(`${prefix}${msg}`);
  else console.log(msg);
}

function getRomOverridePayload() {
  if (window.DDEX_ROM_OVERRIDES) return window.DDEX_ROM_OVERRIDES;
  if (localStorage[ROM_CACHE_FLAG] !== "1") return null;
  try {
    const overrides = JSON.parse(localStorage[ROM_KEYS.overrides] || "null");
    const searchIndex = JSON.parse(localStorage[ROM_KEYS.searchIndex] || "null");
    const searchIndexOffset = JSON.parse(localStorage[ROM_KEYS.searchIndexOffset] || "null");
    const searchIndexCount = JSON.parse(localStorage[ROM_KEYS.searchIndexCount] || "null");
    const title = localStorage[ROM_KEYS.title] || "rom";
    if (!overrides || !searchIndex || !searchIndexOffset || !searchIndexCount) return null;
    return { overrides, searchIndex, searchIndexOffset, searchIndexCount, title };
  } catch (e) {
    console.warn("Failed to read ROM overrides from cache", e);
    return null;
  }
}

function formatOverridesFile(overridesData) {
  return `var overrides = ${JSON.stringify(overridesData)};`;
}

function formatSearchIndexFile(payload) {
  return [
    "// DO NOT EDIT - automatically built with build-tools/build-indexes",
    "",
    `exports.BattleSearchIndex = ${JSON.stringify(payload.searchIndex)};`,
    "",
    `exports.BattleSearchIndexOffset = ${JSON.stringify(payload.searchIndexOffset)};`,
    "",
    `exports.BattleSearchCountIndex = ${JSON.stringify(payload.searchIndexCount)};`,
    "",
    "exports.BattleArticleTitles = {};",
    "",
  ].join("\n");
}

function downloadTextFile(filename, contents) {
  const blob = new Blob([contents], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function safeFileBase(name) {
  if (!name) return "rom";
  if (typeof toID === "function") {
    const id = toID(name);
    return id || "rom";
  }
  const id = String(name).toLowerCase().replace(/[^a-z0-9]+/g, "");
  return id || "rom";
}

function toTitleCaseWords(name) {
  const base = String(name || "").trim();
  if (!base) return "";
  const words = base
    .replace(/\.nds$/i, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/);
  return words
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : ""))
    .join(" ");
}

window.downloadRomOverrideFiles = function (baseName) {
  const payload = getRomOverridePayload();
  if (!payload) {
    console.warn("No ROM overrides found. Load a ROM via file upload first.");
    return false;
  }
  const base = safeFileBase(baseName || payload.title);
  downloadTextFile(`${base}.js`, formatOverridesFile(payload.overrides));
  downloadTextFile(`${base}_searchindex.js`, formatSearchIndexFile(payload));
  console.log(`Downloaded overrides for ${payload.title || base} as ${base}.js and ${base}_searchindex.js`);
  return true;
};

window.downloadRomFileByPath = async function (path, filename) {
  if (!window.__DDEX_LAST_ROM_BUFFER) {
    console.warn("No ROM buffer found. Load a ROM via file upload first.");
    return false;
  }
  try {
    await ensureRomExporterLoaded();
    if (typeof window.readRomFileByPath !== "function") {
      console.warn("ROM reader not available. Ensure /rom/loader.js is loaded.");
      return false;
    }
    const fileBuffer = await window.readRomFileByPath(window.__DDEX_LAST_ROM_BUFFER, path);
    const name = filename || path.replace(/\//g, "_");
    const blob = new Blob([fileBuffer], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    console.log(`Downloaded ${path} as ${name}`);
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
};

window.downloadRomLearnsetNarc = function (filename) {
  return window.downloadRomFileByPath("a/0/3/3", filename || "a_0_3_3.narc");
};

window.listRomTextBanks = function () {
  if (!window.DDEX_ROM_TEXTS) {
    console.warn("No ROM text banks found. Load a ROM via file upload first.");
    return [];
  }
  return Object.keys(window.DDEX_ROM_TEXTS);
};

window.getRomTextBank = function (key) {
  if (!window.DDEX_ROM_TEXTS) {
    console.warn("No ROM text banks found. Load a ROM via file upload first.");
    return null;
  }
  if (!key) return window.DDEX_ROM_TEXTS;
  return window.DDEX_ROM_TEXTS[key];
};

let romModulesLoaded = false;
async function ensureRomModulesLoaded() {
  if (romModulesLoaded) return;
  if (!window.BattleTypeChart) {
    await checkAndLoadScript("/data/typechart.js?v0");
  }
  if (!window.GEN4_SYMBOLS) {
    await checkAndLoadScript("/rom/gen4_symbols.js");
  }
  if (!window.PLATINUM_SCRCMD_DB) {
    await checkAndLoadScript("/rom/platinum_scrcmd_database.js");
  }
  if (!window.HGSS_SCRCMD_DB) {
    await checkAndLoadScript("/rom/hgss_scrcmd_database.js");
  }
  romModulesLoaded = true;
}

async function ensureRomExporterLoaded() {
  if (typeof window.buildOverridesFromRom === "function") return;
  if (window.__romLoaderReady) return;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("ROM exporter module not loaded. Make sure /rom/loader.js is reachable."));
    }, 3000);
    window.addEventListener(
      "rom-loader-ready",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true }
    );
  });
  if (typeof window.buildOverridesFromRom !== "function") {
    throw new Error("ROM exporter module not loaded. Make sure /rom/loader.js is reachable.");
  }
}

$(document).on('change', '#rom-upload', async function(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    setRomStatus(`Loading ROM: ${file.name}`);
    await ensureRomModulesLoaded();
    await ensureRomExporterLoaded();
    const buf = await file.arrayBuffer();
    window.__DDEX_LAST_ROM_BUFFER = buf;
    const result = await window.buildOverridesFromRom(buf, { log: (msg) => setRomStatus(msg) });
    overrideDexData(result.overrides);
    applySearchIndex(result.searchIndex, result.searchIndexOffset, result.searchIndexCount);
    const rawRomName = String(file.name || "").replace(/\.nds$/i, "") || result.romTitle || "rom";
    const displayRomTitle = toTitleCaseWords(rawRomName);
    setDexTitle(displayRomTitle || rawRomName);
    window.DDEX_ROM_TEXTS = result.texts || null;
    if (result.itemLocationStats) {
      setRomStatus(`Item locations (event=${result.itemLocationStats.eventScriptCount}, script=${result.itemLocationStats.scriptParseCount})`);
    }

    localStorage[ROM_CACHE_FLAG] = "1";
    localStorage[ROM_KEYS.overrides] = JSON.stringify(result.overrides);
    localStorage[ROM_KEYS.searchIndex] = JSON.stringify(result.searchIndex);
    localStorage[ROM_KEYS.searchIndexOffset] = JSON.stringify(result.searchIndexOffset);
    localStorage[ROM_KEYS.searchIndexCount] = JSON.stringify(result.searchIndexCount);
    localStorage[ROM_KEYS.title] = rawRomName;
    localStorage.romTitle = rawRomName;
    localStorage.removeItem("game");
    setRomStatus("ROM overrides loaded and cached.");
    window.location.href = "/";
  } catch (err) {
    setRomStatus(err.message || String(err), true);
  }
});


$(document).ready(function() {
	

	if (game) {
		$('#dex-title').text(`${gameTitles[game]} Dex`)
	 	checkAndLoadScript(`/data/overrides/${game}.js`, {
            onLoad: (src) => {
                overrideDexData(overrides)
                if (localStorage.game != game) {
                	localStorage.overrides = JSON.stringify(overrides)
                	localStorage.game = game
                }
                if (!localStorage.overrides){
                	localStorage.overrides = JSON.stringify(overrides)
                	console.log("Stored override data in cache")
                }              
            },
            onNotFound: (src) => console.log(`Not found: ${src}`)
    	});
    	checkAndLoadScript(`/data/overrides/${game}_searchindex.js`, {
            onLoad: (src) => {
                console.log(`search index loaded for ${game}`)
            },
            onNotFound: (src) => console.log(`Not found: ${src}`)
    	});       
	}
})

function overrideDexData(dexOverides) {
	monOverrides = dexOverides.poks
	moveOverrides = dexOverides.moves
	abilityOverrides = dexOverides.abilities
	itemOverrides = dexOverides.items

	console.log("Overriding Ability data...")
	overrideAbilityData(abilityOverrides)

	console.log("Overriding Item data...")
	overrideItemData(itemOverrides)

	console.log("Overriding mon data...")
	overrideMonData(monOverrides)

	console.log("Overriding move data...")
	overrideMoveData(moveOverrides)

	console.log("Overriding enc data...")
	BattleLocationdex = dexOverides.encs

	encTypes = []
    for (encType in BattleLocationdex["rates"]) {
      encTypes.push(encType)
    }
}

function overrideAbilityData(abilityOverrides) {
	for (let abName in abilityOverrides) {
		let abId = cleanString(abName)

		if (typeof BattleAbilities[abId] != "undefined") {
			BattleAbilities[abId].desc = abilityOverrides[abName].desc
			BattleAbilities[abId].shortDesc = abilityOverrides[abName].desc
		} else {
			BattleAbilities[abId] = abilityOverrides[abName]
			BattleAbilities[abId].shortDesc = abilityOverrides[abName].desc
			BattleAbilities[abId].flags = {}
		}
	}
}

function overrideItemData(itemOverrides) {
	for (let itemName in itemOverrides) {
		let itemId = cleanString(itemName)

		if (typeof BattleItems[itemId] != "undefined") {
			BattleItems[itemId].desc = itemOverrides[itemName].desc.replaceAll('\\n', " ")
			BattleItems[itemId]["location"] = itemOverrides[itemName]["location"]
			BattleItems[itemId].rewards = itemOverrides[itemName].rewards
		} else {
			BattleItems[itemId] = itemOverrides[itemName]
		}
	}
}

function overrideMoveData(moveOverrides) {
	let movCount = 934
	let customMoveCount = 0
	for (let moveName in moveOverrides) {
		let moveId = cleanString(moveName)
		let moveData = moveOverrides[moveName]

		if (typeof BattleMovedex[moveId] != "undefined") {
			BattleMovedex[moveId].type = moveData.t
			BattleMovedex[moveId].basePower = moveData.bp
			BattleMovedex[moveId].category = moveData.cat
			BattleMovedex[moveId].pp = moveData.pp
			BattleMovedex[moveId].accuracy = moveData.acc
			BattleMovedex[moveId].priority = moveData.prio
			BattleMovedex[moveId].desc = moveData.desc
			BattleMovedex[moveId].shortDesc = moveData.desc
		} else {
			customMoveCount += 1
			BattleMovedex[moveId] = {}

			// Override Fields
			BattleMovedex[moveId].type = moveData.t
			BattleMovedex[moveId].basePower = moveData.bp
			BattleMovedex[moveId].category = moveData.cat
			BattleMovedex[moveId].pp = moveData.pp
			BattleMovedex[moveId].accuracy = moveData.acc
			BattleMovedex[moveId].priority = moveData.prio
			BattleMovedex[moveId].desc = moveData.desc
			BattleMovedex[moveId].shortDesc = moveData.desc

			// New Fields
			BattleMovedex[moveId].name = moveData.name
			BattleMovedex[moveId].num = movCount + customMoveCount
			BattleMovedex[moveId].flags = {}
			BattleMovedex[moveId].contestType = ""
		}

	}
}


function overrideMonData(monOverrides) {
	let monCount = 1025
	let customMonCount = 0
	for (let speciesName in monOverrides) {
		
		let speciesId = cleanString(speciesName)
		let monData = monOverrides[speciesName]
		
		if (truncatedSpeciesNames[speciesId]) {
			speciesId = truncatedSpeciesNames[speciesId]
		}

		if (typeof BattlePokedex[speciesId] == "undefined") {
			customMonCount += 1
			BattlePokedex[speciesId] = {
				name: monData.name,
				num: monCount + customMonCount,
				tier: "obtainable",
				abilities: {},
				baseStats: {},
			}
			BattleLearnsets[speciesId] = {}
			unrecognizedPoks[speciesId] = 1
		}
		BattlePokedex[speciesId].types = monData.types
		BattlePokedex[speciesId].abilities[0] = monData.abs[0]
		BattlePokedex[speciesId].abilities[1] = monData.abs[1]
		BattlePokedex[speciesId].abilities["H"] = monData.abs[2]
		BattlePokedex[speciesId].wildItems = monData.items
		BattlePokedex[speciesId].tier = "obtainable"
		BattlePokedex[speciesId].baseStats = {
			hp: monData.bs.hp,
			atk: monData.bs.at,
			def: monData.bs.df,
			spa: monData.bs.sa,
			spd: monData.bs.sd,
			spe: monData.bs.sp,	
		}
		BattlePokedex[speciesId].evos = monData.evos

		BattlePokedex[speciesId].evoMethods = monData.evoMethods
		BattlePokedex[speciesId].evoParams = monData.evoParams

		let lvlUpMoves = monData.learnset_info.learnset
		let tms = monData.learnset_info.tms
		let tutors = monData.learnset_info.tutors


		BattleLearnsets[speciesId].learnset = {}


		for (let mv of lvlUpMoves) {
			let mvId = cleanString(mv[1])
			let level = mv[0]

			BattleLearnsets[speciesId].learnset[mvId] ||= []
			BattleLearnsets[speciesId].learnset[mvId].push(`L${level}`)
		}

		for (let mv of tms) {
			let mvId = cleanString(mv)

			BattleLearnsets[speciesId].learnset[mvId] ||= []
			BattleLearnsets[speciesId].learnset[mvId].push(`M`)
		}

		if (tutors) {
			for (let mv of tutors) {
				let mvId = cleanString(mv)
	
				BattleLearnsets[speciesId].learnset[mvId] ||= []
				BattleLearnsets[speciesId].learnset[mvId].push(`T`)
			}

		}
		

		// console.log(BattleLearnsets[speciesId].learnset)

		// Set optional fields
		for (let field of ["evoLevel", "evoType", "evoCondition"]) {
			if (typeof monData[field] != "undefined") {
				BattlePokedex[speciesId][field] = monData[field]
			}
		}

		// Set Abilities
		let abilityData = {}
		for (let abIndex in monData.abs) {
			if (abIndex == 0) {
				abilityData["0"] = monData.abs[abIndex]
			}
			if (abIndex == 1) {
				abilityData["1"] = monData.abs[abIndex]
			}
			if (abIndex == 2) {
				abilityData["H"] = monData.abs[abIndex]
			}
		}
		
	}
}




function cleanString(str) {return str.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()};

function checkAndLoadScript(src, options = {}) {
    const {
        onLoad = null,
        onError = null,
        onNotFound = null,
        timeout = 10000
    } = options;

    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.type = 'text/javascript';
        
        let timeoutId;
        let resolved = false;

        // Set up timeout
        if (timeout > 0) {
            timeoutId = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    console.error(`Timeout loading: ${src}`);
                    if (onError) onError(src, new Error('Timeout'));
                    resolve(false);
                }
            }, timeout);
        }

        script.onload = () => {
            if (!resolved) {
                resolved = true;
                if (timeoutId) clearTimeout(timeoutId);
                console.log(`Successfully loaded: ${src}`);
                if (onLoad) onLoad(src);
                resolve(true);
            }
        };
        
        script.onerror = (error) => {
            if (!resolved) {
                resolved = true;
                if (timeoutId) clearTimeout(timeoutId);
                console.log(`File not found or failed to load: ${src}`);
                if (onNotFound) onNotFound(src, error);
                resolve(false);
            }
        };
        
        // Add script to document head
        document.head.appendChild(script);
    });
}

function moveSubs() {
	return {
	    "faintattack": "feintattack",
	    "smellingsalt": "smellingsalts",
	    "vicegrip": "visegrip",
	    "hijumpkick": "highjumpkick",
	}
}

        // # "Fletchinder","Crabominable","Blacephalon","Corvisquire","Corviknight","Barraskewda","Centiskorch",
        // # "Polteageist","Stonjourner","Basculegion","Meowscarada","Squawkabilly","Kilowattrel","Brambleghast","Dudunsparce","Poltchageist",
        // # "Fezandipiti","Continental","Archipelago"
function unabv(speciesName) {
	let abvs = {
		"fletcinder": "fletchinder"
	}
	if (abvs[speciesName]) {
		return abvs[speciesName]
	} else {
		return speciesName
	}
}

function containsAll(a, b) {
  const setA = new Set(a);
  return b.every(v => setA.has(v));
}

const hasOverlap = (a, b) => a.some(v => b.includes(v));

function getOverlap(a, b) {
  const setB = new Set(b);
  return [...new Set(a.filter(v => setB.has(v)))];
}

function snakeToTitleCase(str) {
  return str
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function highlightChanged(oldStr, newStr) {
  oldStr = String(oldStr ?? "");
  newStr = String(newStr ?? "");

  // Escape first so we can safely inject spans
  const esc = Dex.escapeHTML;

  if (!oldStr) return esc(newStr);
  if (oldStr === newStr) return esc(newStr);

  // Fast path: appended text (your example)
  if (newStr.startsWith(oldStr)) {
    const same = newStr.slice(0, oldStr.length);
    const added = newStr.slice(oldStr.length);
    return esc(same) + `<span class="desc-diff">${esc(added)}</span>`;
  }

  // General path: highlight the differing middle (prefix + suffix match)
  let i = 0;
  const minLen = Math.min(oldStr.length, newStr.length);
  while (i < minLen && oldStr[i] === newStr[i]) i++;

  let j = 0;
  while (
    j < minLen - i &&
    oldStr[oldStr.length - 1 - j] === newStr[newStr.length - 1 - j]
  ) j++;

  const prefix = newStr.slice(0, i);
  const changed = newStr.slice(i, newStr.length - j);
  const suffix = newStr.slice(newStr.length - j);

  if (!changed) return esc(newStr); // fallback

  return (
    esc(prefix) +
    `<span class="desc-diff">${esc(changed)}</span>` +
    esc(suffix)
  );
}
