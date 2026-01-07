params = new URLSearchParams(window.location.search);
game = params.get('game') || localStorage.game
gameTitles = {
	"vintagewhiteplus": "Vintage White+",
	"blazeblack2redux": "Blaze Black/Volt White 2 Redux",
	"blindingwhite2": "Blinding White 2"
}

truncatedSpeciesNames = {
	"fletcinder": "fletchinder"
}

if (localStorage.overrides) {
	overrideDexData(JSON.parse(localStorage.overrides))
}

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

function snakeToTitleCase(str) {
  return str
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}
