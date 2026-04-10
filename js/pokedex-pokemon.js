function getMergedLearnsetForPokemon(pokemon) {
  if (!pokemon) return null;

  var learnset = BattleLearnsets[pokemon.id] && BattleLearnsets[pokemon.id].learnset;
  if (!learnset && BattleLearnsets[toID(pokemon.baseSpecies)]) {
    learnset = BattleLearnsets[toID(pokemon.baseSpecies)].learnset;
  }
  if (!learnset) learnset = {};

  if (pokemon.changesFrom && BattleLearnsets[toID(pokemon.changesFrom)]) {
    learnset = $.extend(
      {},
      learnset,
      BattleLearnsets[toID(pokemon.changesFrom)].learnset,
    );
  }

  return learnset;
}

function getMostRecentGenForPokemon(pokemon) {
  var mostRecentGen = Dex.gen;
  var pastGenPoke = pokemon;
  for (; mostRecentGen > 7; mostRecentGen--) {
    if (pastGenPoke.isNonstandard !== "Past") break;
    pastGenPoke = Dex.forGen(mostRecentGen - 1).species.get(pastGenPoke.id);
  }
  return "" + mostRecentGen;
}

function getLevelUpLevelFromSource(source, currentGen) {
  if (!source) return null;
  if (source.charAt(0) === "L") return Number(source.substr(1));

  var genPrefix = currentGen + "L";
  if (source.substr(0, genPrefix.length) === genPrefix) {
    return Number(source.substr(genPrefix.length));
  }

  return null;
}

function getLevelUpMoveLevels(pokemon) {
  var learnset = getMergedLearnsetForPokemon(pokemon);
  var currentGen = getMostRecentGenForPokemon(pokemon);
  var moveLevels = {};

  for (var moveid in learnset) {
    var sources = learnset[moveid];
    if (typeof sources === "string") sources = [sources];

    for (var i = 0; i < sources.length; i++) {
      var level = getLevelUpLevelFromSource(sources[i], currentGen);
      if (level === null || isNaN(level)) continue;
      if (!(moveid in moveLevels) || level < moveLevels[moveid]) {
        moveLevels[moveid] = level;
      }
    }
  }

  return moveLevels;
}

function getDescendantSpecies(pokemon) {
  var descendants = [];
  var seen = {};
  var queue = pokemon.evos ? pokemon.evos.slice() : [];

  while (queue.length) {
    var speciesName = queue.shift();
    var speciesId = toID(speciesName);
    if (!speciesId || seen[speciesId]) continue;
    seen[speciesId] = true;

    var species = Dex.species.get(speciesName);
    if (!species || !species.exists) continue;

    descendants.push(species);
    if (species.evos && species.evos.length) {
      queue = queue.concat(species.evos);
    }
  }

  return descendants;
}

function getPrevoMoveHighlights(pokemon) {
  if (!pokemon || !pokemon.evos || !pokemon.evos.length) return {};

  var currentMoveLevels = getLevelUpMoveLevels(pokemon);
  var descendants = getDescendantSpecies(pokemon);
  var descendantMoveLevels = [];
  var highlights = {};

  for (var i = 0; i < descendants.length; i++) {
    descendantMoveLevels.push(getLevelUpMoveLevels(descendants[i]));
  }

  for (var moveid in currentMoveLevels) {
    var currentLevel = currentMoveLevels[moveid];
    var isExclusive = true;
    var minEarlyLevels = Infinity;

    for (var j = 0; j < descendantMoveLevels.length; j++) {
      var descendantLevel = descendantMoveLevels[j][moveid];
      if (typeof descendantLevel !== "number") continue;

      isExclusive = false;
      if (descendantLevel <= currentLevel) {
        minEarlyLevels = 0;
        break;
      }

      minEarlyLevels = Math.min(minEarlyLevels, descendantLevel - currentLevel);
    }

    if (isExclusive) {
      highlights[moveid] = {
        boldName: true,
        descPrefix: "Exclusive!",
      };
    } else if (minEarlyLevels !== Infinity && minEarlyLevels > 0) {
      highlights[moveid] = {
        boldName: true,
        descPrefix: minEarlyLevels + " lvls early!",
      };
    }
  }

  return highlights;
}

function getPokemonMoveRowOptions(highlight) {
  var options = { hideDescription: true };
  if (!highlight) return options;
  for (var key in highlight) {
    options[key] = highlight[key];
  }
  return options;
}

function getEncounterHeaderClassName(encType) {
  var normalized = String(encType || "").toLowerCase();
  var classNames = ["ddex-encounter-header"];

  if (normalized.indexOf("grass") >= 0) {
    classNames.push("ddex-encounter-header-grass");
  } else if (normalized.indexOf("rod") >= 0) {
    classNames.push("ddex-encounter-header-rod");
  } else if (normalized.indexOf("surf") >= 0) {
    classNames.push("ddex-encounter-header-surf");
  }

  return classNames.join(" ");
}

function getEncounterLevelValue(value) {
  value = Number(value);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function formatEncounterLocationLevel(minLevel, maxLevel) {
  minLevel = getEncounterLevelValue(minLevel);
  maxLevel = getEncounterLevelValue(maxLevel);
  if (!minLevel && !maxLevel) return "";
  if (!minLevel) minLevel = maxLevel;
  if (!maxLevel) maxLevel = minLevel;
  if (minLevel === maxLevel) return "Lv " + minLevel;
  return "Lv " + minLevel + "-" + maxLevel;
}

var DDEX_PENDING_POKEMON_LEVEL_KEY = "ddexPendingPokemonLevel";

var CATCH_RATE_STATUS_OPTIONS = [
  { key: "none", label: "None", multiplier: 1 },
  { key: "par", label: "Par", multiplier: 1.5 },
  { key: "psnbrn", label: "Psn/Brn", multiplier: 1.5 },
  { key: "slpfrz", label: "Slp/Frz", multiplier: 2 },
];

var CATCH_RATE_BALL_OPTIONS = [
  { key: "1", label: "1x", multiplier: 1 },
  { key: "1_5", label: "1.5x", multiplier: 1.5 },
  { key: "2", label: "2x", multiplier: 2 },
  { key: "3", label: "3x", multiplier: 3 },
  { key: "3_5", label: "3.5x", multiplier: 3.5 },
  { key: "4", label: "4x", multiplier: 4 },
];

function clampCatchRateValue(value, min, max) {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function normalizeCatchRateNumber(value) {
  if (value === null || typeof value === "undefined" || value === "") return null;
  var num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function formatCatchRatePercent(chance) {
  if (!Number.isFinite(chance) || chance <= 0) return "0%";
  if (chance >= 1) return "100%";
  var percent = chance * 100;
  if (percent < 0.01) return "<0.01%";
  var decimals = percent >= 10 ? 2 : 3;
  return percent.toFixed(decimals).replace(/\.?0+$/, "") + "%";
}

function formatCatchRateNumber(value, digits) {
  if (!Number.isFinite(value)) return "Infinity";
  return Number(value).toFixed(digits).replace(/\.?0+$/, "");
}

function formatCatchRateTries(value) {
  if (!Number.isFinite(value)) return "Infinity";
  if (value <= 1) return "1";
  return formatCatchRateNumber(value, value >= 10 ? 1 : 2);
}

function calculateCatchRateResult(options) {
  var catchRate = Math.max(0, Number(options.catchRate) || 0);
  var maxHp = Math.max(1, Math.floor(Number(options.maxHp) || 1));
  var currentHp = clampCatchRateValue(Math.floor(Number(options.currentHp) || maxHp), 1, maxHp);
  var ballMultiplier = Number(options.ballMultiplier) || 1;
  var statusMultiplier = Number(options.statusMultiplier) || 1;
  var numerator = (3 * maxHp - 2 * currentHp) * catchRate * ballMultiplier * statusMultiplier;
  var a = Math.floor(numerator / (3 * maxHp));
  if (!Number.isFinite(a) || a < 0) a = 0;

  var result = {
    rawCatchRate: catchRate,
    maxHp: maxHp,
    currentHp: currentHp,
    hpPercent: (currentHp / maxHp) * 100,
    a: a,
    b: 0,
    chance: 0,
    expectedThrows: Infinity,
    thresholdThrows: {
      50: Infinity,
      90: Infinity,
      95: Infinity,
    },
  };

  if (a >= 255) {
    result.b = 65535;
    result.chance = 1;
    result.expectedThrows = 1;
    result.thresholdThrows[50] = 1;
    result.thresholdThrows[90] = 1;
    result.thresholdThrows[95] = 1;
    return result;
  }

  if (a <= 0) return result;

  var x = Math.floor(16711680 / a);
  var y = Math.floor(Math.sqrt(x));
  var z = Math.floor(Math.sqrt(y));
  var b = z > 0 ? Math.floor(1048560 / z) : 65535;
  if (b > 65535) b = 65535;
  if (b < 0) b = 0;
  var chance = Math.pow(b / 65536, 4);

  result.b = b;
  result.chance = chance;
  result.expectedThrows = chance > 0 ? 1 / chance : Infinity;

  if (chance > 0 && chance < 1) {
    result.thresholdThrows[50] = Math.ceil(Math.log(1 - 0.5) / Math.log(1 - chance));
    result.thresholdThrows[90] = Math.ceil(Math.log(1 - 0.9) / Math.log(1 - chance));
    result.thresholdThrows[95] = Math.ceil(Math.log(1 - 0.95) / Math.log(1 - chance));
  } else if (chance >= 1) {
    result.thresholdThrows[50] = 1;
    result.thresholdThrows[90] = 1;
    result.thresholdThrows[95] = 1;
  }

  return result;
}

function consumePendingPokemonLevel(speciesId) {
  if (!speciesId) return null;
  try {
    var raw = sessionStorage.getItem(DDEX_PENDING_POKEMON_LEVEL_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(DDEX_PENDING_POKEMON_LEVEL_KEY);
    var parsed = JSON.parse(raw);
    if (!parsed || toID(parsed.speciesId) !== toID(speciesId)) return null;
    var level = Number(parsed.level);
    if (!Number.isFinite(level) || level <= 0) return null;
    return clampCatchRateValue(Math.floor(level), 1, 100);
  } catch (err) {
    try {
      sessionStorage.removeItem(DDEX_PENDING_POKEMON_LEVEL_KEY);
    } catch (removeErr) {}
    return null;
  }
}

var PokedexPokemonPanel = PokedexResultPanel.extend({
  applyDetailLayout: function () {
    if (window.DDEX_DETAIL_LAYOUT) {
      window.DDEX_DETAIL_LAYOUT.applyPokemonLayout(this);
    }
  },
  initialize: function (id) {
    id = toID(id);
    var pokemon = Dex.species.get(id);
    var spriteId = pokemon.spriteid;
    var spriteIdLookup = toID(spriteId || id);
    var resolvedId = Dex.resolvePokemonIconId(spriteIdLookup);
    if (resolvedId && resolvedId !== spriteIdLookup) {
      var resolvedSpecies = Dex.species.get(resolvedId);
      if (resolvedSpecies && resolvedSpecies.spriteid) {
        spriteId = resolvedSpecies.spriteid;
      }
    }
    this.id = id;
    this.shortTitle = pokemon.baseSpecies;
    this.initialLevel = consumePendingPokemonLevel(id);

    vanillaPokemon = vanillaSpecies[id]
    overrideData = {}
    if (localStorage.overrides) {
      overrideData = JSON.parse(localStorage.overrides).poks[pokemon.name]
    } else {
      overrideData = pokemon
    }
    this.overrideData = overrideData
    
    let itemData = false
    if (overrideData) {
      itemData = overrideData.items

    }

    if (typeof vanillaPokemon == "undefined") {
      vanillaPokemon = pokemon
    }

    var resolvedCatchRate = normalizeCatchRateNumber(
      overrideData && typeof overrideData.catchRate !== "undefined"
        ? overrideData.catchRate
        : pokemon && typeof pokemon.catchRate !== "undefined"
          ? pokemon.catchRate
          : vanillaPokemon && typeof vanillaPokemon.catchRate !== "undefined"
            ? vanillaPokemon.catchRate
            : null,
    );
    this.catchRateValue = resolvedCatchRate;
    this.catchRateState = {
      expanded: false,
      currentHp: null,
      statusKey: "none",
      statusMultiplier: 1,
      ballKey: "1",
      ballMultiplier: 1,
    };
    this.expandedRouteKeys = new Set();
    this.manualRouteFamilyOverrides = {};
    this.routeAnalysisCache = {};
    this.advancedRoutingState = {
      targetRouteKey: "",
      depth: 1,
      thresholdPercent: 100,
      ignoreBoxData: false,
      includeFamilyTree: true,
      searchMode: "search",
      lastResults: null,
      isRunning: false,
      expandedResultKeys: new Set(),
    };

    let obtainable = pokemon.tier === "obtainable";
    var buf = '<div class="pfx-body dexentry">';

    buf +=
      '<a href="/" class="pfx-backbutton" data-target="back"><i class="fa fa-chevron-left"></i> Pok&eacute;dex</a>';

    buf += "<h1>";
    if (pokemon.forme) {
      buf +=
        '<a href="/pokemon/' +
        id +
        '" data-target="push" class="subtle">' +
        pokemon.baseSpecies +
        "<small>-" +
        pokemon.forme +
        "</small></a>";
    } else {
      buf +=
        '<a href="/pokemon/' +
        id +
        '" data-target="push" class="subtle">' +
        pokemon.name +
        "</a>";
    }
    if (pokemon.num > 0) buf += " <code>#" + pokemon.num + "</code>";
    buf += "</h1>";

    if (pokemon.tier === "unobtainable") {
      buf +=
        '<div class="warning"><strong>Note:</strong> This Pok&eacute;mon cannot be obtained.</div>';
    }

    buf +=
      '<img src="' +
      Dex.resourcePrefix +
      "sprites/gen5/" +
      spriteId +
      ".png" +
      '" alt="" width="96" height="96" class="sprite" />';

    buf += '<dl class="typeentry">';
    buf += "<dt>Types:</dt> <dd>";
    for (var i = 0; i < pokemon.types.length; i++) {
      buf +=
        '<a class="type ' +
        toID(pokemon.types[i]) +
        '" href="/types/' +
        toID(pokemon.types[i]) +
        '" data-target="push">' +
        pokemon.types[i] +
        "</a> ";
    }
    buf += "</dd>";
    buf += "</dl>";

    buf += '<dl class="sizeentry">';
    buf += "<dt>Size:</dt> <dd>";
    var gkPower = (function (weightkg) {
      if (weightkg >= 200) return 120;
      if (weightkg >= 100) return 100;
      if (weightkg >= 50) return 80;
      if (weightkg >= 25) return 60;
      if (weightkg >= 10) return 40;
      return 20;
    })(pokemon.weightkg);
    buf +=
      "" +
      pokemon.heightm +
      " m, " +
      pokemon.weightkg +
      ' kg<br /><small><a class="subtle" href="/moves/grassknot" data-target="push">Grass Knot</a>: ' +
      gkPower +
      "</small>";
    buf += "</dd>";
    buf += "</dl>";


    buf += '<dl class="abilityentry">';
    buf += '<dt>Abilities:</dt> <dd class="imgentry">';
    var vanillaAbilities = [vanillaPokemon.abilities[0], vanillaPokemon.abilities[1], vanillaPokemon.abilities["H"]]
    for (var i in pokemon.abilities) {
      var ability = pokemon.abilities[i];
      var isNew = !vanillaAbilities.includes(ability)
      var isDash = String(ability).trim() === "-";

      if (!ability) continue;

      if (i !== "0") buf += " | ";
      if (i === "H") ability = "<em>" + pokemon.abilities[i] + "</em>";
      buf +=
        '<a href="/abilities/' +
        toID(pokemon.abilities[i]) +
        '" data-target="push">' +
        ability +
        "</a>" + `${(isNew && !isDash) ? " (New)" : ""}`;
      if (i === "H") buf += "<small> (H)</small>";
      if (i === "S") buf += "<small> (special)</small>";
    }
    buf += "</dd>";
    buf += "</dl>";

    buf += "<dl>";
    buf += '<dt style="clear:left">Base stats:</dt><dd><table class="stats">';

    var StatTitles = {
      hp: "HP",
      atk: "Attack",
      def: "Defense",
      spa: "Sp. Atk",
      spd: "Sp. Def",
      spe: "Speed",
    };
    buf +=
      '<tr><td></td><td></td><td style="width:200px"></td><th class="ministat"><abbr title="0 IVs, 0 EVs, negative nature">min&minus;</a></th><th class="ministat"><abbr title="31 IVs, 0 EVs, neutral nature">min</abbr></th><th class="ministat"><abbr title="31 IVs, 252 EVs, neutral nature">max</abbr></th><th class="ministat"><abbr title="31 IVs, 252 EVs, positive nature">max+</abbr></th>';
    var bst = 0;
    var vanillaBst = 0;
    for (var stat in BattleStatNames) {
      var baseStat = pokemon.baseStats[stat];
      var vanillaBaseStat = vanillaPokemon.baseStats[stat]
      

      vanillaBst += vanillaBaseStat
      bst += baseStat;
      var width = Math.floor((baseStat * 200) / 200);
      if (width > 200) width = 200;
      // Choose stat color based on value
      function getStatColor(baseStat) {
        if (baseStat <= 50) return "#BF616A";      // low
        if (baseStat <= 80) return "#D08770";      // mid-low
        if (baseStat <= 100) return "#EBCB8B";     // mid
        return "#A3BE8C";                          // high
      }

      var color = getStatColor(baseStat);

      if (baseStat == vanillaBaseStat) {
        buf +=
        "<tr><th>" +
        StatTitles[stat] +
        ':</th><td class="stat">' +
        `<span class="vnl"></span> ${baseStat}` +
        "</td>";
      } else {
        var delta = baseStat - vanillaBaseStat
        var statLine = ""
        if (delta > 0) {
          statLine = `<span class="vnl pos">+${delta}</span> ${baseStat}`
        } else {
          statLine = `<span class="vnl neg">${delta}</span> ${baseStat}`
        }

        buf +=
        "<tr><th>" +
        StatTitles[stat] +
        ':</th><td class="stat">' +
        statLine +
        "</td>";
      }

      

      buf +=
        '<td class="statbar"><span style="width:' +
        Math.floor(width) +
        "px;background:" +
        color +
        ";border-color:" +
        color +
        '"></span></td>';
      buf +=
        '<td class="ministat"><small>' +
        (stat === "hp" ? "" : this.getStat(baseStat, false, 100, 0, 0, 0.9)) +
        '</small></td><td class="ministat"><small>' +
        this.getStat(baseStat, stat === "hp", 100, 31, 0, 1.0) +
        "</small></td>";
      buf +=
        '<td class="ministat"><small>' +
        this.getStat(baseStat, stat === "hp", 100, 31, 255, 1.0) +
        '</small></td><td class="ministat"><small>' +
        (stat === "hp"
          ? ""
          : this.getStat(baseStat, false, 100, 31, 255, 1.1)) +
        "</small></td></tr>";
    }

    if (bst == vanillaBst) {
      buf +=
      '<tr><th class="bst">Total:</th><td class="bst">' +
      bst +
      '</td><td></td><td class="ministat" colspan="4">at level <input type="text" class="textbox" name="level" placeholder="100" size="5" /></td>';
    } else {
      var delta = bst - vanillaBst
      var statLine = ""

      if (delta > 0) {
        statLine = `<span class="vnl pos">+${delta}</span> ${bst}`
      } else {
        statLine = `<span class="vnl neg">${delta}</span> ${bst}`
      }
      
      buf +=
      '<tr><th class="bst">Total:</th><td class="bst">' +
      statLine +
      '</td><td></td><td class="ministat" colspan="4">at level <input type="text" class="textbox" name="level" placeholder="100" size="5" /></td>';
    }

    

    buf += "</table></dd>";

    if (Number.isFinite(this.catchRateValue)) {
      buf += this.renderCatchRateSection();
    }

    var hasPrimaryWildItems =
      itemData &&
      ((itemData[0] && itemData[0] !== "None") ||
        (itemData[1] && itemData[1] !== "None"));

    if (hasPrimaryWildItems) {
        buf += '<dl class="itementry">';
        buf += "<dt>Wild Items:</dt> <dd>";
        if (itemData[0] != "None") {
          buf += `50% <a href="/items/${cleanString(itemData[0])}">${itemData[0]}</a> `           
        }
        if (itemData[1] != "None") {
          buf += `5% <a href="/items/${cleanString(itemData[1])}">${itemData[1]}</a> `           
        }
        if (itemData[2] != "None" && itemData[2]) {
          buf += `1% <a href="/items/${cleanString(itemData[0])}">${itemData[2]}</a>`           
        }

        buf += "</dd>";
        buf += "</dl>";
    }



    buf += "<dt>Evolution:</dt> <dd>";
     
    var template = pokemon;
    // console.log(basePokemon)
    while (template.prevo) template = Dex.species.get(template.prevo);
    var basePokemon = BattlePokedex[cleanString(template.name)]

    if (typeof basePokemon == "undefined") {
      basePokemon = BattlePokedex[cleanString(template.baseSpecies)]
    }
    if (template.evos) {
      buf += '<table class="evos"><tr><td>';
      var evos = [template];




      var seenEvos = []
      var stopSearch = false;
      console.log(basePokemon)
      while (evos && !stopSearch) {
        var evoData = ""
        var evoSourceTemplate =
          typeof evos[0] === "string" ? template : evos[0];
        for (var i = 0; i < evos.length; i++) {
          template = Dex.species.get(evos[i]);
          if (i <= 0) {
            if (!evos[0].exists) {
              if (evos[1] === "Dustox") {
                buf +=
                  '</td><td class="arrow"><span>&rarr;<br />&rarr;</span></td><td>';
              } else if (template.prevo) {
                buf +=
                  '</td><td class="arrow"><div class="evo-param">' + 
                  '<abbr title="' +
                  this.getEvoMethod(template) +
                  '">&rarr;</abbr></div></td><td>';
              } else {
                buf += '</td><td class="arrow"><span>&rarr;</span></td><td>';
              }
            }  
          }
          var evoIndex = parseInt(i)

          if (basePokemon.evoMethods && basePokemon.evoMethods.length > 0) {
            if (typeof evos[0] === "string") {
              var nextEvos = BattlePokedex[cleanString(evos[i])].evos

              if (nextEvos) {
                if (hasOverlap(nextEvos, seenEvos) && seenEvos.includes(evos[i])) {
                  stopSearch = true;
                  break;
                }
              }

              var evoSource = BattlePokedex[cleanString(evoSourceTemplate.name)]
              evoData = evoSource && evoSource.evoParams
                ? evoSource.evoParams[evoIndex]
                : ""

              if (template.evos && template.evoParams && template.evoParams.length) {
                for (var j = 0; j < template.evos.length; j++) {
                  if (toID(template.evos[j]) === pokemon.id) {
                    evoSource = template
                    evoData = template.evoParams[j]
                    break
                  }
                }
              }
              
              if (typeof evoData === "undefined") {
                evoData = ""
              }

              if (
                evoData.length == 0 &&
                evoSource &&
                evoSource.evoMethods &&
                evoSource.evoMethods[evoIndex] == "levelFriendship"
              ) {
                evoData = "Max Happiness"
              }



              seenEvos.push(evos[i])

            } else {
              if (seenEvos.includes(evos["0"].name)) {
                stopSearch = true;
                break;
              }
              evoData = evos["0"].evoParams[evoIndex]
              seenEvos.push(evos["0"].name)
            }
            
            // evoData = evos[0].evoParams
            if (typeof evoData === 'number') {
              evoData = `L${evoData}`
            }
          }

          var name = template.forme
            ? template.baseSpecies
            : template.name;
          name =
            '<span class="picon" style="' +
            Dex.getPokemonIcon(template) +
            '"></span>' +
            name;
          if (template === pokemon) {
            buf += "<div><strong>" + name + "</strong></div>";
          } else {
            buf +=
              '<div><a href="/pokemon/' +
              template.id +
              '" data-target="replace">' +
              name + 
              "</a>" + `<div class="evo-desc">${evoData}</div>`  + "</div>";
          }
        }
        evos = template.evos;

      }
      buf += "</td></tr></table>";
      if (pokemon.prevo) {
        // buf +=
        //   "<div><small>Evolves from " +
        //   Dex.species.get(pokemon.prevo).name +
        //   " (" +
        //   this.getEvoMethod(pokemon) +
        //   ")</small></div>";
      }
    } else {
      buf += "<em>Does not evolve</em>";
    }

    if (pokemon.otherFormes || pokemon.forme) {
      buf += "</dd><dt>Formes:</dt> <dd>";
      template = pokemon.forme ? Dex.species.get(pokemon.baseSpecies) : pokemon;
      var name = template.baseForme || "Base";
      name =
        '<span class="picon" style="' +
        Dex.getPokemonIcon(template) +
        '"></span>' +
        name;
      if (template === pokemon) {
        buf += "<strong>" + name + "</strong>";
      } else {
        buf +=
          '<a href="/pokemon/' +
          template.id +
          '" data-target="replace">' +
          name +
          "</a>";
      }
      var otherFormes = template.otherFormes;
      if (otherFormes)
        for (var i = 0; i < otherFormes.length; i++) {
          template = Dex.species.get(otherFormes[i]);
          var name = template.forme;
          name =
            '<span class="picon" style="' +
            Dex.getPokemonIcon(template) +
            '"></span>' +
            name;
          if (template === pokemon) {
            buf += ", <strong>" + name + "</strong>";
          } else {
            buf +=
              ', <a href="/pokemon/' +
              template.id +
              '" data-target="replace">' +
              name +
              "</a>";
          }
        }
      if (template.requiredItem) {
        buf +=
          '<div><small>Must hold <a href="/items/' +
          toID(template.requiredItem) +
          '" data-target="push">' +
          template.requiredItem +
          "</a></small></div>";
      }
    }
    if (pokemon.cosmeticFormes) {
      buf += "</dd><dt>Cosmetic formes:</dt> <dd>";
      var name = pokemon.baseForme || "Base";
      name =
        '<span class="picon" style="' +
        Dex.getPokemonIcon(pokemon) +
        '"></span>' +
        name;
      buf += "" + name;

      for (var i = 0; i < pokemon.cosmeticFormes.length; i++) {
        template = Dex.species.get(pokemon.cosmeticFormes[i]);
        var name = template.forme;

        name =
          '<span class="picon" style="' +
          Dex.getPokemonIcon(template) +
          '"></span>' +
          name;
        buf += ", " + name;
      }
    }
    buf += "</dd></dl>";

    if (pokemon.eggGroups) {
      buf += '<dl class="colentry"><dt>Gender ratio:</dt><dd>';
      if (pokemon.gender)
        switch (pokemon.gender) {
          case "M":
            buf += "100% male";
            break;
          case "F":
            buf += "100% female";
            break;
          case "N":
            buf += "100% genderless";
            break;
        }
      else if (pokemon.genderRatio) {
        buf +=
          "" +
          pokemon.genderRatio.M * 100 +
          "% male, " +
          pokemon.genderRatio.F * 100 +
          "% female";
      } else {
        buf += "50% male, 50% female";
      }
      buf += "</dd></dl>";
      buf += '<div style="clear:left"></div>';
    }

    if (pokemon.tier === "obtainable") {
      buf +=
        '<section class="ddex-pokemon-encounters-section"><h3>Encounters</h3><ul class="utilichart nokbd ddex-pokemon-encounter-list"></ul></section>';
    }

    // learnset
    if (pokemon.tier === "obtainable") {
      buf +=
        '<ul class="tabbar"><li><button class="button nav-first cur" value="move">Moves</button></li><li><button class="button nav-last" value="advanced-routing">Advanced Routing</button></li></ul>';
    } else {
      buf +=
        '<ul class="tabbar"><li><button class="button nav-first cur" value="move">Moves</button></li></ul>';
    }

    buf += '<ul class="utilichart nokbd ddex-pokemon-move-list">';
    buf += '<li class="resultheader"><h3>Level-up</h3></li>';

    var learnset = getMergedLearnsetForPokemon(pokemon);
    var moveHighlights = getPrevoMoveHighlights(pokemon);

    var moves = [];
    for (var moveid in learnset) {
      var sources = learnset[moveid];
      if (typeof sources === "string") sources = [sources];
      for (var i = 0, len = sources.length; i < len; i++) {
        var source = sources[i];
        if (source.substr(0, 1) === "L") {
          moves.push("a" + source.substr(1).padStart(3, "0") + " " + moveid);
        }
      }
    }
    moves.sort();
    for (var i = 0, len = moves.length; i < len; i++) {
      var move = BattleMovedex[moves[i].substr(5)];
      if (move) {
        var desc =
          moves[i].substr(1, 3) === "001" || moves[i].substr(1, 3) === "000"
            ? "&ndash;"
            : "<small>L</small>" + (parseInt(moves[i].substr(1, 3), 10) || "?");
        buf += BattleSearch.renderTaggedMoveRow(
          move,
          desc,
          null,
          getPokemonMoveRowOptions(moveHighlights[moves[i].substr(5)]),
        );
      }
    }
    buf += "</ul>";

    buf += "</div>";

    this.html(buf);
    if (Number.isFinite(this.initialLevel)) {
      this.$('input[name=level]').val(this.initialLevel);
      this.updateLevel();
    } else {
      this.syncCatchRateCalculator();
    }

    if (
      window.DDEX_NUZLOCKE_BOX &&
      typeof window.DDEX_NUZLOCKE_BOX.subscribe === "function"
    ) {
      this.handleNuzlockeUpdate = function () {
        if (pokemon.tier === "obtainable") {
          this.renderEncounters();
        }
        var currentTab = this.$(".tabbar button.cur").val();
        if (currentTab === "advanced-routing") {
          if (this.advancedRoutingState.lastResults) {
            this.runAdvancedRoutingAnalysis();
          } else {
            this.renderAdvancedRouting();
          }
        }
      }.bind(this);
      window.DDEX_NUZLOCKE_BOX.subscribe(this.handleNuzlockeUpdate);
    }

    setTimeout(
      function () {
        if (pokemon.tier === "obtainable") {
          this.renderEncounters();
        }
        this.renderFullLearnset();
      }.bind(this),
    );
  },
  remove: function () {
    if (
      this.handleNuzlockeUpdate &&
      window.DDEX_NUZLOCKE_BOX &&
      typeof window.DDEX_NUZLOCKE_BOX.unsubscribe === "function"
    ) {
      window.DDEX_NUZLOCKE_BOX.unsubscribe(this.handleNuzlockeUpdate);
    }
    PokedexResultPanel.prototype.remove.apply(this, arguments);
  },
  events: {
    "click .tabbar button": "selectTab",
    "click .catchrate-summary": "toggleCatchRateCalculator",
    "input .catchrate-hp-slider": "updateCatchRateHpFromSlider",
    "input .catchrate-hp-percent": "updateCatchRateHpFromPercent",
    "click .catchrate-status-button": "updateCatchRateStatus",
    "click .catchrate-ball-button": "updateCatchRateBall",
    "click .ddex-route-toggle-button": "toggleEncounterRoutePanel",
    "click .ddex-route-family-row": "toggleEncounterRouteFamily",
    "change .ddex-advanced-route-select": "updateAdvancedRoutingTarget",
    "change .ddex-advanced-ignore-box": "updateAdvancedRoutingIgnoreBox",
    "change .ddex-advanced-include-family-tree": "updateAdvancedRoutingFamilyMode",
    "input .ddex-advanced-threshold-input": "updateAdvancedRoutingThreshold",
    "click .ddex-advanced-run-button": "runAdvancedRoutingSearch",
    "click .ddex-advanced-deep-run-button": "runAdvancedRoutingDeepSearch",
    "click .ddex-advanced-result-toggle": "toggleAdvancedRoutingResult",
    "input input[name=level]": "updateLevel",
    "keyup input[name=level]": "updateLevel",
    "change input[name=level]": "updateLevel",
  },
  updateLevel: function (e) {
    var val = this.$("input[name=level]").val();
    var level = val === "" ? 100 : parseInt(val, 10);
    var lowIV = 31,
      highIV = 31;
    var lowEV = 0,
      highEV = 255;
    if (val.slice(-1) === ":") {
      lowIV = 0;
      highEV = 0;
    }
    var i = 0;
    var $entries = this.$("table.stats td.ministat small");
    var pokemon = Dex.species.get(this.id);
    for (var stat in BattleStatNames) {
      var baseStat = pokemon.baseStats[stat];

      $entries
        .eq(4 * i + 0)
        .text(
          stat === "hp" ? "" : this.getStat(baseStat, false, level, 0, 0, 0.9),
        );
      $entries
        .eq(4 * i + 1)
        .text(this.getStat(baseStat, stat === "hp", level, lowIV, lowEV, 1.0));
      $entries
        .eq(4 * i + 2)
        .text(
          this.getStat(baseStat, stat === "hp", level, highIV, highEV, 1.0),
        );
      $entries
        .eq(4 * i + 3)
        .text(
          stat === "hp"
            ? ""
            : this.getStat(baseStat, false, level, highIV, highEV, 1.1),
        );
      i++;
    }
    this.syncCatchRateCalculator();
  },
  renderCatchRateSection: function () {
    var hasCatchRate = Number.isFinite(this.catchRateValue);
    var summaryValue = hasCatchRate ? this.catchRateValue : "unavailable";
    var disabledAttrs = hasCatchRate ? "" : ' disabled aria-disabled="true"';
    var section =
      '<dt class="catchrateentry-label">Catch Rate:</dt>' +
      '<dd class="catchrateentry">' +
      '<button type="button" class="button catchrate-summary" aria-expanded="false"' +
      disabledAttrs +
      '>' +
      '<span class="catchrate-summary-value">' +
      summaryValue +
      '</span>' +
      '<span class="catchrate-chevron" aria-hidden="true">&#9662;</span>' +
      "</button>";

    if (hasCatchRate) {
      var state = this.getCatchRateViewState();
      var result = calculateCatchRateResult({
        catchRate: this.catchRateValue,
        maxHp: state.maxHp,
        currentHp: state.currentHp,
        ballMultiplier: state.ballMultiplier,
        statusMultiplier: state.statusMultiplier,
      });
      section += this.renderCatchRateCalculatorBody(state, result);
    }

    section += "</dd>";
    return section;
  },
  renderCatchRateCalculatorBody: function (state, result) {
    var statusButtons = "";
    var ballButtons = "";
    for (var i = 0; i < CATCH_RATE_STATUS_OPTIONS.length; i++) {
      var status = CATCH_RATE_STATUS_OPTIONS[i];
      statusButtons +=
        '<button type="button" class="button catchrate-status-button' +
        (state.statusKey === status.key ? " active" : "") +
        '" data-status-key="' +
        status.key +
        '" data-status-multiplier="' +
        status.multiplier +
        '">' +
        status.label +
        "</button>";
    }
    for (var j = 0; j < CATCH_RATE_BALL_OPTIONS.length; j++) {
      var ball = CATCH_RATE_BALL_OPTIONS[j];
      ballButtons +=
        '<button type="button" class="button catchrate-ball-button' +
        (state.ballKey === ball.key ? " active" : "") +
        '" data-ball-key="' +
        ball.key +
        '" data-ball-multiplier="' +
        ball.multiplier +
        '">' +
        ball.label +
        "</button>";
    }

    return (
      '<div class="catchrate-calculator" hidden>' +
      '<div class="catchrate-controls">' +
      '<label class="catchrate-control catchrate-control-slider">' +
      "<span>HP</span>" +
      '<input type="range" class="catchrate-hp-slider" min="1" max="' +
      state.maxHp +
      '" value="' +
      state.currentHp +
      '" />' +
      '<span class="catchrate-hp-inline"><span class="catchrate-current-hp">' +
      result.currentHp +
      '</span> / <span class="catchrate-max-hp">' +
      result.maxHp +
      "</span></span>" +
      "</label>" +
      '<label class="catchrate-control catchrate-control-percent">' +
      "<span>HP%</span>" +
      '<input type="number" class="textbox catchrate-hp-percent" min="0.1" max="100" step="0.1" value="' +
      formatCatchRateNumber(result.hpPercent, 1) +
      '" />' +
      "</label>" +
      "</div>" +
      '<div class="catchrate-control-group">' +
      '<span class="catchrate-control-label">Status</span>' +
      '<div class="catchrate-button-group">' +
      statusButtons +
      "</div>" +
      "</div>" +
      '<div class="catchrate-control-group">' +
      '<span class="catchrate-control-label">Capture Power</span>' +
      '<div class="catchrate-button-group">' +
      ballButtons +
      "</div>" +
      "</div>" +
      '<div class="catchrate-results">' +
      '<div class="catchrate-result-row"><span>Single-throw chance</span><strong class="catchrate-output-chance">' +
      formatCatchRatePercent(result.chance) +
      '</strong></div>' +
      '<div class="catchrate-result-row"><span>Expected throws</span><strong class="catchrate-output-expected">' +
      formatCatchRateTries(result.expectedThrows) +
      "</strong></div>" +
      "</div>" +
      "</div>"
    );
  },
  getSharedLevel: function () {
    var val = this.$("input[name=level]").val();
    var level = val === "" ? 100 : parseInt(val, 10);
    if (!Number.isFinite(level) || isNaN(level)) level = 100;
    return clampCatchRateValue(level, 1, 100);
  },
  getCatchRateViewState: function () {
    var level = this.getSharedLevel();
    var pokemon = Dex.species.get(this.id);
    var maxHp = this.getStat(pokemon.baseStats.hp, true, level, 31, 0, 1);
    if (!this.catchRateState) {
      this.catchRateState = {
        expanded: false,
        currentHp: maxHp,
        statusKey: "none",
        statusMultiplier: 1,
        ballKey: "1",
        ballMultiplier: 1,
      };
    }
    if (!Number.isFinite(this.catchRateState.currentHp)) {
      this.catchRateState.currentHp = maxHp;
    }
    this.catchRateState.currentHp = clampCatchRateValue(this.catchRateState.currentHp, 1, maxHp);
    return {
      level: level,
      maxHp: maxHp,
      currentHp: this.catchRateState.currentHp,
      statusKey: this.catchRateState.statusKey || "none",
      statusMultiplier: Number(this.catchRateState.statusMultiplier) || 1,
      ballKey: this.catchRateState.ballKey || "1",
      ballMultiplier: Number(this.catchRateState.ballMultiplier) || 1,
      expanded: !!this.catchRateState.expanded,
    };
  },
  syncCatchRateCalculator: function () {
    if (!Number.isFinite(this.catchRateValue)) return;

    var state = this.getCatchRateViewState();
    var result = calculateCatchRateResult({
      catchRate: this.catchRateValue,
      maxHp: state.maxHp,
      currentHp: state.currentHp,
      ballMultiplier: state.ballMultiplier,
      statusMultiplier: state.statusMultiplier,
    });
    var $summary = this.$(".catchrate-summary");
    var $calculator = this.$(".catchrate-calculator");
    if (!$summary.length || !$calculator.length) return;

    $summary.attr("aria-expanded", state.expanded ? "true" : "false");
    $summary.toggleClass("expanded", state.expanded);
    $calculator.prop("hidden", !state.expanded);

    this.$(".catchrate-hp-slider")
      .attr("max", state.maxHp)
      .val(result.currentHp);
    this.$(".catchrate-hp-percent").val(formatCatchRateNumber(result.hpPercent, 1));
    this.$(".catchrate-current-hp").text(result.currentHp);
    this.$(".catchrate-max-hp").text(result.maxHp);
    this.$(".catchrate-output-chance").text(formatCatchRatePercent(result.chance));
    this.$(".catchrate-output-expected").text(formatCatchRateTries(result.expectedThrows));

    this.$(".catchrate-status-button").removeClass("active");
    this.$('.catchrate-status-button[data-status-key="' + state.statusKey + '"]').addClass("active");
    this.$(".catchrate-ball-button").removeClass("active");
    this.$('.catchrate-ball-button[data-ball-key="' + state.ballKey + '"]').addClass("active");
  },
  toggleCatchRateCalculator: function (e) {
    if (!Number.isFinite(this.catchRateValue)) return;
    e.preventDefault();
    this.catchRateState.expanded = !this.catchRateState.expanded;
    this.syncCatchRateCalculator();
  },
  updateCatchRateHpFromSlider: function (e) {
    if (!Number.isFinite(this.catchRateValue)) return;
    this.catchRateState.currentHp = Number($(e.currentTarget).val());
    this.syncCatchRateCalculator();
  },
  updateCatchRateHpFromPercent: function (e) {
    if (!Number.isFinite(this.catchRateValue)) return;
    var state = this.getCatchRateViewState();
    var percent = Number($(e.currentTarget).val());
    percent = clampCatchRateValue(percent, 0.1, 100);
    this.catchRateState.currentHp = clampCatchRateValue(
      Math.round((state.maxHp * percent) / 100),
      1,
      state.maxHp,
    );
    this.syncCatchRateCalculator();
  },
  updateCatchRateStatus: function (e) {
    if (!Number.isFinite(this.catchRateValue)) return;
    var $button = $(e.currentTarget);
    this.catchRateState.statusKey = $button.attr("data-status-key") || "none";
    this.catchRateState.statusMultiplier = Number($button.attr("data-status-multiplier")) || 1;
    this.syncCatchRateCalculator();
  },
  updateCatchRateBall: function (e) {
    if (!Number.isFinite(this.catchRateValue)) return;
    var $button = $(e.currentTarget);
    this.catchRateState.ballKey = $button.attr("data-ball-key") || "1";
    this.catchRateState.ballMultiplier = Number($button.attr("data-ball-multiplier")) || 1;
    this.syncCatchRateCalculator();
  },
  getEvoMethod: function (evo) {
    let condition = evo.evoCondition ? ` ${evo.evoCondition}` : ``;
    switch (evo.evoType) {
      case "levelExtra":
        return "level-up" + condition;
      case "levelFriendship":
        return "level-up with high Friendship" + condition;
      case "levelHold":
        return "level-up while holding " + evo.evoItem + condition;
      case "useItem":
        return "use " + evo.evoItem + condition;
      case "useMove":
        return "use " + evo.evoMove + condition;
      case "levelMove":
        return "level-up while knowing " + evo.evoMove + condition;
      case "levelMap":
        return "level-up while located in " + evo.evoMap;
      case "levelParty":
        return "level-up while " + evo.evoSpecies + " is in the party";
      case "trade":
        return "trade";
      case "tradeSpecies":
        return "trade for a " + evo.evoSpecies;
      case "tradeItem":
        return "trade" + condition + " " + evo.evoItem;
      case "other":
        return evo.evoCondition;
      default:
        return "level " + evo.evoLevel + condition;
    }
  },
  selectTab: function (e) {
    this.$(".tabbar button").removeClass("cur");
    $(e.currentTarget).addClass("cur");
    switch (e.currentTarget.value) {
      case "move":
        this.renderFullLearnset();
        break;
      case "details":
        this.renderDetails();
        break;
      case "advanced-routing":
        var $tabButton = $(e.currentTarget);
        var originalLabel = $tabButton.text();
        $tabButton.text("Loading...");
        setTimeout(
          function () {
            $tabButton.text(originalLabel);
            this.renderAdvancedRouting();
          }.bind(this),
          0,
        );
        break;
    }
  },
  renderFullLearnset: function () {
    var pokemon = Dex.species.get(this.id);
    var learnset = getMergedLearnsetForPokemon(pokemon);
    var moveHighlights = getPrevoMoveHighlights(pokemon);

    var tutorBySource = (pokemon.learnset_info && pokemon.learnset_info.tutorsBySource) ||
      (this.overrideData && this.overrideData.learnset_info && this.overrideData.learnset_info.tutorsBySource);
    if (tutorBySource && typeof tutorBySource !== "object") tutorBySource = null;

    // learnset
    var buf = "";
    var moves = [];
    var shownMoves = {};
    /** The most recent generation this pokemon has appeared in */
    var mostRecentGen = getMostRecentGenForPokemon(pokemon);
    for (var moveid in learnset) {
      var sources = learnset[moveid];
      if (typeof sources === "string") sources = [sources];
      for (var i = 0, len = sources.length; i < len; i++) {
        var source = sources[i];
        var sourceType = source.charAt(0);
        switch (sourceType) {
          case "L":
            moves.push("a" + source.substr(1).padStart(3, "0") + " " + moveid);
            shownMoves[moveid] = shownMoves[moveid] | 2;
            break;
          case "M":
            moves.push("d000 " + moveid);
            shownMoves[moveid] = shownMoves[moveid] | 1;
            break;
          case "T":
            if (!tutorBySource) moves.push("e000 " + moveid);
            shownMoves[moveid] = shownMoves[moveid] | 1;
            break;
          case "E":
            moves.push("f000 " + moveid);
            shownMoves[moveid] = shownMoves[moveid] | 4;
            break;
        }
        if (sourceType === "S") {
          if (shownMoves[moveid] & 8) continue;
          moves.push("i000 " + moveid);
          shownMoves[moveid] = shownMoves[moveid] | 8;
        }
      }
    }
    var prevo1, prevo2;
    if (pokemon.prevo) {
      prevo1 = toID(pokemon.prevo);
      var prevoLearnset = BattleLearnsets[prevo1].learnset;
      for (var moveid in prevoLearnset) {
        var sources = prevoLearnset[moveid];
        if (typeof sources === "string") sources = [sources];
        for (var i = 0, len = sources.length; i < len; i++) {
          var source = sources[i];
          if (source.substr(0, 2) === "" + mostRecentGen + "L") {
            if (shownMoves[moveid] & 2) continue;
            moves.push("b" + source.substr(2).padStart(3, "0") + " " + moveid);
            shownMoves[moveid] = shownMoves[moveid] | 2;
          } else if (source === "" + mostRecentGen + "E") {
            if (shownMoves[moveid] & 4) continue;
            moves.push("g000 " + moveid);
            shownMoves[moveid] = shownMoves[moveid] | 4;
          } else if (source.charAt(1) === "S") {
            if (shownMoves[moveid] & 8) continue;
            moves.push("i000 " + moveid);
            shownMoves[moveid] = shownMoves[moveid] | 8;
          }
        }
      }

      if (BattlePokedex[prevo1].prevo) {
        prevo2 = toID(BattlePokedex[prevo1].prevo);
        prevoLearnset = BattleLearnsets[prevo2].learnset;
        for (var moveid in prevoLearnset) {
          var sources = prevoLearnset[moveid];
          if (typeof sources === "string") sources = [sources];
          for (var i = 0, len = sources.length; i < len; i++) {
            var source = sources[i];
            if (source.substr(0, 2) === mostRecentGen + "L") {
              if (shownMoves[moveid] & 2) continue;
              moves.push(
                "b" + source.substr(2).padStart(3, "0") + " " + moveid,
              );
              shownMoves[moveid] = shownMoves[moveid] | 2;
            } else if (source === mostRecentGen + "E") {
              if (shownMoves[moveid] & 4) continue;
              moves.push("h000 " + moveid);
              shownMoves[moveid] = shownMoves[moveid] | 4;
            } else if (source.charAt(1) === "S") {
              if (shownMoves[moveid] & 8) continue;
              moves.push("i000 " + moveid);
              shownMoves[moveid] = shownMoves[moveid] | 8;
            }
          }
        }
      }
    }
    for (var moveid in learnset) {
      if (moveid in shownMoves) continue;
      moves.push("j000 " + moveid);
      shownMoves[moveid] = shownMoves[moveid] | 1;
    }

    var tutorGroups = null;
    if (tutorBySource) {
      tutorGroups = [];
      var scriptGroups = [];
      var shardGroup = null;
      var otherGroups = [];
      for (var key in tutorBySource) {
        var rawMoves = tutorBySource[key] || [];
        var moveIds = [];
        for (var i = 0; i < rawMoves.length; i++) {
          var mid = toID(rawMoves[i]);
          if (mid && BattleMovedex[mid]) moveIds.push(mid);
        }
        if (!moveIds.length) continue;
        moveIds.sort(function (a, b) {
          return BattleMovedex[a].name.localeCompare(BattleMovedex[b].name);
        });
        var label = key === "ShardTutor"
          ? "Shard Tutor"
          : key.replace(/^Script(\d+)Tutor$/i, "Script $1 Tutor");
        var group = { key: key, label: label, moveIds: moveIds };
        if (/^Script\d+Tutor$/i.test(key)) scriptGroups.push(group);
        else if (key === "ShardTutor") shardGroup = group;
        else otherGroups.push(group);
      }
      scriptGroups.sort(function (a, b) {
        var aNum = Number((a.key.match(/\d+/) || ["0"])[0]);
        var bNum = Number((b.key.match(/\d+/) || ["0"])[0]);
        return aNum - bNum;
      });
      if (scriptGroups.length) tutorGroups = tutorGroups.concat(scriptGroups);
      if (shardGroup) tutorGroups.push(shardGroup);
      if (otherGroups.length) tutorGroups = tutorGroups.concat(otherGroups);
      if (tutorGroups.length) moves.push("e000 __tutor__");
    }
    moves.sort();
    var last = "",
      lastChanged = false;
    for (var i = 0, len = moves.length; i < len; i++) {
      var moveId = moves[i].substr(5);
      if (tutorGroups && moves[i].charAt(0) === "e" && moveId === "__tutor__") {
        for (var gi = 0; gi < tutorGroups.length; gi++) {
          var group = tutorGroups[gi];
          buf += '<li class="resultheader"><h3>' + group.label + "</h3></li>";
          for (var mi = 0; mi < group.moveIds.length; mi++) {
            var groupMove = BattleMovedex[group.moveIds[mi]];
            if (!groupMove) continue;
            var tutorDesc =
              '<img src="//' +
              Config.routes.client +
              '/sprites/tutor.png" style="margin-top:-4px;opacity:.7" width="27" height="26" alt="T" />';
            buf += BattleSearch.renderTaggedMoveRow(groupMove, tutorDesc, null, {
              hideDescription: true,
            });
          }
        }
        continue;
      }
      var move = BattleMovedex[moveId];
      if (!move) {

        buf += '<li><pre>error: "' + moves[i] + '"</pre></li>';
      } else {
        if ((lastChanged = moves[i].substr(0, 1) !== last)) {
          last = moves[i].substr(0, 1);
        }
        var desc = "";
        switch (last) {
          case "a": // level-up move
            if (lastChanged)
              buf += '<li class="resultheader"><h3>Level-up</h3></li>';
            desc =
              moves[i].substr(1, 3) === "001"
                ? "&ndash;"
                : moves[i].substr(1, 3) === "000"
                  ? "Evo."
                  : "<small>L</small>" + (Number(moves[i].substr(1, 3)) || "?");
            break;
          case "b": // prevo1 level-up move
            if (lastChanged)
              buf +=
                '<li class="resultheader"><h3>Level-up from ' +
                BattlePokedex[prevo1].name +
                "</h3></li>";
            desc =
              moves[i].substr(1, 3) === "001" || moves[i].substr(1, 3) === "000"
                ? "&ndash;"
                : "<small>L</small>" + (Number(moves[i].substr(1, 3)) || "?");
            break;
          case "c": // prevo2 level-up move
            if (lastChanged)
              buf +=
                '<li class="resultheader"><h3>Level-up from ' +
                BattlePokedex[prevo2].name +
                "</h3></li>";
            desc =
              moves[i].substr(1, 3) === "001" || moves[i].substr(1, 3) === "000"
                ? "&ndash;"
                : "<small>L</small>" + (Number(moves[i].substr(1, 3)) || "?");
            break;
          case "d": // tm/hm
            if (lastChanged)
              buf += '<li class="resultheader"><h3>TM/HM</h3></li>';
            desc =
              '<img src="//' +
              Config.routes.client +
              '/sprites/itemicons/tm-normal.png" style="margin-top:-3px;opacity:.7" width="24" height="24" alt="M" />';
            break;
          case "e": // tutor
            if (lastChanged)
              buf += '<li class="resultheader"><h3>Tutor</h3></li>';
            desc =
              '<img src="//' +
              Config.routes.client +
              '/sprites/tutor.png" style="margin-top:-4px;opacity:.7" width="27" height="26" alt="T" />';
            break;
          case "f": // egg move
            if (lastChanged)
              buf += '<li class="resultheader"><h3>Egg</h3></li>';
            desc =
              '<span class="picon" style="margin-top:-12px;' +
              Dex.getPokemonIcon("egg") +
              '"></span>';
            break;
          case "g": // prevo1 egg move
            if (lastChanged)
              buf +=
                '<li class="resultheader"><h3>Egg from ' +
                BattlePokedex[prevo1].name +
                "</h3></li>";
            desc =
              '<span class="picon" style="margin-top:-12px;' +
              Dex.getPokemonIcon("egg") +
              '"></span>';
            break;
          case "h": // prevo2 egg move
            if (lastChanged)
              buf +=
                '<li class="resultheader"><h3>Egg from ' +
                BattlePokedex[prevo2].name +
                "</h3></li>";
            desc =
              '<span class="picon" style="margin-top:-12px;' +
              Dex.getPokemonIcon("egg") +
              '"></span>';
            break;
          case "i": // event
            if (lastChanged)
              buf += '<li class="resultheader"><h3>Event</h3></li>';
            desc = "!";
            break;
          case "j": // pastgen
            if (lastChanged)
              buf +=
                '<li class="resultheader"><h3>Past generation only</h3></li>';
            desc = "...";
            break;
        }
        buf += BattleSearch.renderTaggedMoveRow(
          move,
          desc,
          null,
          getPokemonMoveRowOptions(last === "a" ? moveHighlights[moveId] : null),
        );
      }
    }
    this.$(".ddex-pokemon-move-list").html(buf);
  },
  renderDetails: function () {
    var pokemon = Dex.species.get(this.id);
    var buf = "";

    // flavor
    buf += '<li class="resultheader"><h3>Flavor</h3></li>';
    buf += "<li><dl><dt>Color:</dt><dd>" + pokemon.color + "</dd></dl></li>";

    // animated gen 6
    if (
      pokemon.num > 0 &&
      pokemon.gen < 10 &&
      this.id !== "missingno" &&
      this.id !== "pichuspikyeared"
    ) {
      buf += '<li class="resultheader"><h3>Animated Gen 6-9 sprites</h3></li>';

      buf +=
        '<li class="content"><table class="sprites"><tr><td><img src="' +
        Dex.resourcePrefix +
        "sprites/ani/" +
        spriteId +
        '.gif" /></td>';
      buf +=
        '<td><img src="' +
        Dex.resourcePrefix +
        "sprites/ani-shiny/" +
        spriteId +
        '.gif" /></td></table>';
      buf +=
        '<table class="sprites"><tr><td><img src="' +
        Dex.resourcePrefix +
        "sprites/ani-back/" +
        spriteId +
        '.gif" /></td>';
      buf +=
        '<td><img src="' +
        Dex.resourcePrefix +
        "sprites/ani-back-shiny/" +
        spriteId +
        '.gif" /></td></table>';

      buf += '<div style="clear:left"></div></li>';
    }

    // cry
    buf += '<li class="resultheader"><h3>Cry</h3></li>';

    buf +=
      '<li class="content"><audio src="' +
      Dex.resourcePrefix +
      "audio/cries/" +
      spriteId +
      '.mp3" controls="controls"><a href="' +
      Dex.resourcePrefix +
      "audio/cries/" +
      spriteId +
      '.mp3">Play</a></audio></li>';

    // still gen 5
    if (this.id !== "pichuspikyeared") {
      buf += '<li class="resultheader"><h3>Gen 5 Sprites</h3></li>';
      buf +=
        '<li class="content"><table class="sprites"><tr><td><img src="' +
        Dex.resourcePrefix +
        "sprites/gen5/" +
        spriteId +
        '.png" /></td>';
      buf +=
        '<td><img src="' +
        Dex.resourcePrefix +
        "sprites/gen5-shiny/" +
        spriteId +
        '.png" /></td></table>';
      buf +=
        '<table class="sprites"><tr><td><img src="' +
        Dex.resourcePrefix +
        "sprites/gen5-back/" +
        spriteId +
        '.png" /></td>';
      buf +=
        '<td><img src="' +
        Dex.resourcePrefix +
        "sprites/gen5-back-shiny/" +
        spriteId +
        '.png" /></td></table>';

      buf += '<div style="clear:left"></div></li>';

      // animated gen 5
      if (pokemon.gen < 6 && this.id !== "missingno") {
        buf += '<li class="resultheader"><h3>Animated Gen 5 sprites</h3></li>';

        buf +=
          '<li class="content"><table class="sprites"><tr><td><img src="' +
          Dex.resourcePrefix +
          "sprites/gen5ani/" +
          spriteId +
          '.gif" /></td>';
        buf +=
          '<td><img src="' +
          Dex.resourcePrefix +
          "sprites/gen5ani-shiny/" +
          spriteId +
          '.gif" /></td></table>';
        buf +=
          '<table class="sprites"><tr><td><img src="' +
          Dex.resourcePrefix +
          "sprites/gen5ani-back/" +
          spriteId +
          '.gif" /></td>';
        buf +=
          '<td><img src="' +
          Dex.resourcePrefix +
          "sprites/gen5ani-back-shiny/" +
          spriteId +
          '.gif" /></td></table>';

        buf += '<div style="clear:left"></div></li>';
      }
    }

    if (pokemon.gen < 5) {
      buf += '<li class="resultheader"><h3>Gen 4 Sprites</h3></li>';
      buf +=
        '<li class="content"><table class="sprites"><tr><td><img src="' +
        Dex.resourcePrefix +
        "sprites/gen4/" +
        spriteId +
        '.png" /></td>';
      buf +=
        '<td><img src="' +
        Dex.resourcePrefix +
        "sprites/gen4-shiny/" +
        spriteId +
        '.png" /></td></table>';
      buf +=
        '<table class="sprites"><tr><td><img src="' +
        Dex.resourcePrefix +
        "sprites/gen4-back/" +
        spriteId +
        '.png" /></td>';
      buf +=
        '<td><img src="' +
        Dex.resourcePrefix +
        "sprites/gen4-back-shiny/" +
        spriteId +
        '.png" /></td></table>';
    }

    if (pokemon.gen < 4) {
      buf += '<li class="resultheader"><h3>Gen 3 Sprites</h3></li>';
      buf +=
        '<li class="content"><table class="sprites"><tr><td><img src="' +
        Dex.resourcePrefix +
        "sprites/gen3/" +
        spriteId +
        '.png" /></td>';
      buf +=
        '<td><img src="' +
        Dex.resourcePrefix +
        "sprites/gen3-shiny/" +
        spriteId +
        '.png" /></td></table>';
      buf +=
        '<table class="sprites"><tr><td><img src="' +
        Dex.resourcePrefix +
        "sprites/gen3-back/" +
        spriteId +
        '.png" /></td>';
      buf +=
        '<td><img src="' +
        Dex.resourcePrefix +
        "sprites/gen3-back-shiny/" +
        spriteId +
        '.png" /></td></table>';
    }

    if (pokemon.gen < 3) {
      buf += '<li class="resultheader"><h3>Gen 2 Sprites</h3></li>';
      buf +=
        '<li class="content"><table class="sprites"><tr><td><img src="' +
        Dex.resourcePrefix +
        "sprites/gen2/" +
        spriteId +
        '.png" /></td>';
      buf +=
        '<td><img src="' +
        Dex.resourcePrefix +
        "sprites/gen2-shiny/" +
        spriteId +
        '.png" /></td></table>';
      buf +=
        '<table class="sprites"><tr><td><img src="' +
        Dex.resourcePrefix +
        "sprites/gen2-back/" +
        spriteId +
        '.png" /></td>';
      buf +=
        '<td><img src="' +
        Dex.resourcePrefix +
        "sprites/gen2-back-shiny/" +
        spriteId +
        '.png" /></td></table>';
    }

    if (pokemon.gen < 2) {
      buf += '<li class="resultheader"><h3>Gen 1 Sprites</h3></li>';
      buf +=
        '<li class="content"><table class="sprites"><tr><td><img src="' +
        Dex.resourcePrefix +
        "sprites/gen1/" +
        spriteId +
        '.png" /></td>';
      buf +=
        '<table class="sprites"><tr><td><img src="' +
        Dex.resourcePrefix +
        "sprites/gen1-back/" +
        spriteId +
        '.png" /></td>';
    }

    this.$(".ddex-pokemon-move-list").html(buf);
  },
  getEncounterLocations: function (pokemon) {
    if (this.results) return this.results;

    let isInZone = function (location, enc_mode, pokemon) {
      let for_mode = location[enc_mode];

      if (typeof for_mode == "undefined" || !("encs" in for_mode)) {
        return 0;
      }
      const rateSlots = getEncounterRateSlots(location, enc_mode);

      let sum_rate = 0;
      for (let i = 0; i < for_mode["encs"].length; i++) {
        let slot = for_mode["encs"][i];
        let species = cleanString(slot["s"] || slot["species"]);
        if (species === pokemon) {
           sum_rate += rateSlots[i] || 0;
        }
      }

      return sum_rate;
    };

    let getLevelRangeInZone = function (location, enc_mode, pokemon) {
      let for_mode = location[enc_mode];

      if (typeof for_mode == "undefined" || !("encs" in for_mode)) {
        return { minLevel: 0, maxLevel: 0 };
      }

      let minLevel = Infinity;
      let maxLevel = 0;
      for (let i = 0; i < for_mode["encs"].length; i++) {
        let slot = for_mode["encs"][i];
        let species = cleanString(slot["s"] || slot["species"]);
        if (species !== pokemon) continue;
        let slotMin = getEncounterLevelValue(slot.mn || slot.minLvl || 0);
        let slotMax = getEncounterLevelValue(
          slot.mx || slot.maxLvl || slot.mn || slot.minLvl || 0,
        );
        if (slotMin) minLevel = Math.min(minLevel, slotMin);
        if (slotMax) maxLevel = Math.max(maxLevel, slotMax);
      }

      return {
        minLevel: minLevel === Infinity ? 0 : minLevel,
        maxLevel: maxLevel,
      };
    };

    var results = [];
    for (const encType of encTypes) {
      const locationsForType = [];
      for (let location in BattleLocationdex) {
        if (location === "rates") {
          continue;
        }

        let encounters = BattleLocationdex[location];
        let rate = isInZone(encounters, encType, pokemon);
        if (rate <= 0) {
          continue;
        }
        let levelRange = getLevelRangeInZone(encounters, encType, pokemon);
        locationsForType.push({
          kind: "location",
          encType: encType,
          rate: rate,
          zoneid: location,
          minLevel: levelRange.minLevel,
          maxLevel: levelRange.maxLevel,
        });
      }
      if (locationsForType.length === 0) {
        continue;
      }
      locationsForType.sort((a, b) => a.zoneid.localeCompare(b.zoneid));
      results.push({
        kind: "header",
        encType: encType,
      });
      results.push(...locationsForType);
    }

    return (this.results = results);
  },
  getEncounterRouteAnalysis: function (locationId, encType) {
    var routeKey = encType + ":" + locationId;
    if (this.routeAnalysisCache[routeKey]) return this.routeAnalysisCache[routeKey];
    if (!window.DDEXEncounterRouting) return null;
    var analysis = window.DDEXEncounterRouting.buildRouteAnalysis(
      this.id,
      locationId,
      encType,
    );
    this.routeAnalysisCache[routeKey] = analysis;
    return analysis;
  },
  getSyncedEncounterRouteFamilyKeys: function () {
    var syncedFamilyKeys = new Set();
    if (
      !window.DDEXEncounterRouting ||
      !window.DDEX_NUZLOCKE_BOX ||
      typeof window.DDEX_NUZLOCKE_BOX.getState !== "function"
    ) {
      return syncedFamilyKeys;
    }

    var state = window.DDEX_NUZLOCKE_BOX.getState();
    if (!state) return syncedFamilyKeys;

    var records = Array.isArray(state.records) ? state.records : [];
    for (var i = 0; i < records.length; i++) {
      var record = records[i] || {};
      var speciesRef = record.species || record.speciesId;
      if (!speciesRef) continue;
      var familyInfo = window.DDEXEncounterRouting.getFamilyInfo(speciesRef);
      if (familyInfo && familyInfo.key) syncedFamilyKeys.add(familyInfo.key);
    }

    if (!records.length && state.speciesIds && typeof state.speciesIds.forEach === "function") {
      state.speciesIds.forEach(function (speciesId) {
        var familyInfo = window.DDEXEncounterRouting.getFamilyInfo(speciesId);
        if (familyInfo && familyInfo.key) syncedFamilyKeys.add(familyInfo.key);
      });
    }

    return syncedFamilyKeys;
  },
  getEncounterRouteRowClassNames: function (locationId) {
    var rowClass = "result ddex-route-result";
    var nuzlockeService = window.DDEX_NUZLOCKE_BOX;
    if (
      nuzlockeService &&
      typeof nuzlockeService.getLocationSummary === "function"
    ) {
      var locationSummary = nuzlockeService.getLocationSummary(locationId);
      if (
        locationSummary &&
        locationSummary.speciesIds &&
        locationSummary.speciesIds.length
      ) {
        rowClass += " nuzlocke-location-hit";
      }
    }
    return rowClass;
  },
  renderEncounterRouteSpriteStrip: function (locationId) {
    var nuzlockeService = window.DDEX_NUZLOCKE_BOX;
    if (
      !nuzlockeService ||
      typeof nuzlockeService.getLocationSummary !== "function"
    ) {
      return "";
    }

    var locationSummary = nuzlockeService.getLocationSummary(locationId);
    if (
      !locationSummary ||
      !locationSummary.speciesIds ||
      !locationSummary.speciesIds.length
    ) {
      return "";
    }

    var strip =
      '<span class="col typecol nuzlocke-sprite-strip ddex-route-sprite-strip" aria-hidden="true">';
    for (var i = 0; i < locationSummary.speciesIds.length; i++) {
      var speciesTemplate = Dex.species.get(locationSummary.speciesIds[i]);
      if (!speciesTemplate || !speciesTemplate.exists) continue;
      strip +=
        '<span class="picon nuzlocke-picon" style="' +
        Dex.getPokemonIcon(speciesTemplate.name) +
        '"></span>';
    }
    strip += "</span>";
    return strip;
  },
  renderEncounterRouteRow: function (location, rate, syncedFamilyKeys) {
    var root =
      window.DDEXPaths && typeof window.DDEXPaths.routerRoot === "function"
        ? window.DDEXPaths.routerRoot()
        : "/";
    var zone = BattleLocationdex[location.zoneid];
    if (!zone || !zone.name) return "";

    var routeKey = location.encType + ":" + location.zoneid;
    var isExpanded = this.expandedRouteKeys.has(routeKey);
    var analysis = this.getEncounterRouteAnalysis(location.zoneid, location.encType);
    var spriteStrip = this.renderEncounterRouteSpriteStrip(location.zoneid);
    var levelLabel = formatEncounterLocationLevel(location.minLevel, location.maxLevel);
    var buf =
      '<li class="' +
      this.getEncounterRouteRowClassNames(location.zoneid) +
      '">' +
      '<div class="ddex-route-result-inner">' +
      '<a class="ddex-route-location-link" href="' +
      root +
      "encounters/" +
      location.zoneid +
      '" data-target="push" data-entry="encounters|' +
      BattleLog.escapeHTML(zone.name) +
      '">' +
      '<span class="col tagcol">' +
      Dex.escapeHTML(rate) +
      "</span>" +
      '<span class="col levelcol">' +
      Dex.escapeHTML(levelLabel || "") +
      "</span>" +
      '<span class="col shortmovenamecol ddex-route-location-name">' +
      Dex.escapeHTML(zone.name) +
      "</span>" +
      spriteStrip +
      "</a>" +
      '<button type="button" class="button ddex-route-toggle-button' +
      (isExpanded ? " active" : "") +
      '" data-route-key="' +
      routeKey +
      '" data-location-id="' +
      location.zoneid +
      '" data-enc-type="' +
      location.encType +
      '" aria-expanded="' +
      (isExpanded ? "true" : "false") +
      '">' +
      "Route" +
      "</button>" +
      "</div>";

    if (isExpanded && analysis) {
      buf += window.DDEXEncounterRouting.renderRoutePanel(analysis, {
        syncedFamilyKeys: syncedFamilyKeys,
        manualOverrides: this.manualRouteFamilyOverrides[routeKey] || {},
      });
    }

    buf += "</li>";
    return buf;
  },
  toggleEncounterRoutePanel: function (e) {
    e.preventDefault();
    e.stopPropagation();
    var routeKey = $(e.currentTarget).attr("data-route-key");
    if (!routeKey) return;

    if (this.expandedRouteKeys.has(routeKey)) {
      this.expandedRouteKeys.delete(routeKey);
    } else {
      this.expandedRouteKeys.add(routeKey);
    }
    this.renderEncounters();
  },
  toggleEncounterRouteFamily: function (e) {
    if ($(e.target).closest("a").length) return;

    var $row = $(e.currentTarget);
    var routeKey = $row.attr("data-route-key");
    var familyKey = $row.attr("data-family-key");
    if (!routeKey || !familyKey || !window.DDEXEncounterRouting) return;

    var locationId = routeKey.split(":").slice(1).join(":");
    var encType = routeKey.split(":")[0];
    var analysis = this.getEncounterRouteAnalysis(locationId, encType);
    if (!analysis) return;

    var manualOverrides = this.manualRouteFamilyOverrides[routeKey] || {};
    var syncedFamilyKeys = this.getSyncedEncounterRouteFamilyKeys();
    var effectiveSelected = window.DDEXEncounterRouting.getEffectiveSelectedFamilies(
      analysis,
      syncedFamilyKeys,
      manualOverrides,
    );
    var nextSelected = !effectiveSelected.has(familyKey);
    var syncedSelected = syncedFamilyKeys.has(familyKey);

    if (!this.manualRouteFamilyOverrides[routeKey]) {
      this.manualRouteFamilyOverrides[routeKey] = {};
    }

    if (nextSelected === syncedSelected) {
      delete this.manualRouteFamilyOverrides[routeKey][familyKey];
    } else {
      this.manualRouteFamilyOverrides[routeKey][familyKey] = nextSelected;
    }

    if (!Object.keys(this.manualRouteFamilyOverrides[routeKey]).length) {
      delete this.manualRouteFamilyOverrides[routeKey];
    }

    this.renderEncounters();
  },
  getAdvancedRoutingContext: function () {
    if (!window.DDEXEncounterRouting) return null;
    return window.DDEXEncounterRouting.buildOptimizationContext(this.id, {
      includeNuzlockeState: !this.advancedRoutingState.ignoreBoxData,
    });
  },
  getAdvancedRoutingEligibleRoutes: function (context) {
    var eligible = [];
    if (!context || !context.targetRoutes) return eligible;
    for (var i = 0; i < context.targetRoutes.length; i++) {
      var route = context.targetRoutes[i];
      if (context.usedLocationIds.has(route.locationId)) continue;
      eligible.push(route);
    }
    return eligible;
  },
  resetAdvancedRoutingResults: function () {
    this.advancedRoutingState.lastResults = null;
    this.advancedRoutingState.expandedResultKeys = new Set();
  },
  updateAdvancedRoutingTarget: function (e) {
    this.advancedRoutingState.targetRouteKey = $(e.currentTarget).val() || "";
    this.resetAdvancedRoutingResults();
    this.renderAdvancedRouting();
  },
  updateAdvancedRoutingIgnoreBox: function (e) {
    this.advancedRoutingState.ignoreBoxData = !!$(e.currentTarget).prop("checked");
    this.advancedRoutingState.targetRouteKey = "";
    this.resetAdvancedRoutingResults();
    this.renderAdvancedRouting();
  },
  updateAdvancedRoutingFamilyMode: function (e) {
    this.advancedRoutingState.includeFamilyTree = !!$(e.currentTarget).prop("checked");
    this.resetAdvancedRoutingResults();
    this.renderAdvancedRouting();
  },
  updateAdvancedRoutingThreshold: function (e) {
    var threshold = Number($(e.currentTarget).val());
    if (!Number.isFinite(threshold)) threshold = 100;
    this.advancedRoutingState.thresholdPercent = Math.max(0, Math.min(100, threshold));
    this.resetAdvancedRoutingResults();
    this.renderAdvancedRouting();
  },
  runAdvancedRoutingSearch: function (e) {
    this.runAdvancedRoutingAnalysis("search", e);
  },
  runAdvancedRoutingDeepSearch: function (e) {
    this.runAdvancedRoutingAnalysis("deep", e);
  },
  runAdvancedRoutingAnalysis: function (mode, e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    mode = mode === "deep" ? "deep" : "search";
    var context = this.getAdvancedRoutingContext();
    if (!context || !window.DDEXEncounterRouting) return;
    var eligibleRoutes = this.getAdvancedRoutingEligibleRoutes(context);
    if (!eligibleRoutes.length) {
      this.resetAdvancedRoutingResults();
      this.renderAdvancedRouting();
      return;
    }

    this.advancedRoutingState.searchMode = mode;
    this.advancedRoutingState.isRunning = true;
    this.renderAdvancedRouting();

    setTimeout(
      function () {
        var results = window.DDEXEncounterRouting.optimizeEncounterRouting(context, {
          targetRouteKey: this.advancedRoutingState.targetRouteKey,
          depth: mode === "deep" ? 2 : 1,
          thresholdPercent: this.advancedRoutingState.thresholdPercent,
          includeFamilyTree: this.advancedRoutingState.includeFamilyTree,
        });
        this.advancedRoutingState.lastResults = results;
        this.advancedRoutingState.isRunning = false;
        this.advancedRoutingState.expandedResultKeys = new Set();
        if (results && results.length) {
          this.advancedRoutingState.expandedResultKeys.add(
            results[0].targetRoute.routeKey,
          );
        }
        this.renderAdvancedRouting();
      }.bind(this),
      0,
    );
  },
  toggleAdvancedRoutingResult: function (e) {
    e.preventDefault();
    var routeKey = $(e.currentTarget).attr("data-route-key");
    if (!routeKey) return;
    if (this.advancedRoutingState.expandedResultKeys.has(routeKey)) {
      this.advancedRoutingState.expandedResultKeys.delete(routeKey);
    } else {
      this.advancedRoutingState.expandedResultKeys.add(routeKey);
    }
    this.renderAdvancedRouting();
  },
  renderAdvancedRoutingSummary: function (result) {
    if (!result) return "";
    var statusClass = result.thresholdMet ? "met" : "below";
    return (
      '<section class="ddex-advanced-summary ' +
      statusClass +
      '">' +
      '<div class="ddex-advanced-summary-row"><strong>' +
      Dex.escapeHTML(result.targetRouteLabel) +
      "</strong></div>" +
      '<div class="ddex-advanced-summary-row">Final success chance: <strong class="ddex-advanced-highlight">' +
      window.DDEXEncounterRouting.formatPercent(result.successChance * 100) +
      "</strong></div>" +
      '<div class="ddex-advanced-plan">' +
      window.DDEXEncounterRouting.renderOptimizationSectionsHtml(result) +
      "</div>" +
      "</section>"
    );
  },
  renderAdvancedRoutingResultCard: function (result) {
    var isExpanded = this.advancedRoutingState.expandedResultKeys.has(
      result.targetRoute.routeKey,
    );
    return (
      '<section class="ddex-advanced-result-card ' +
      (result.thresholdMet ? "met" : "below") +
      '">' +
      '<button type="button" class="button ddex-advanced-result-toggle" data-route-key="' +
      result.targetRoute.routeKey +
      '" aria-expanded="' +
      (isExpanded ? "true" : "false") +
      '">' +
      '<span class="ddex-advanced-result-title">' +
      Dex.escapeHTML(result.targetRouteLabel) +
      "</span>" +
      '<span class="ddex-advanced-result-metric">' +
      window.DDEXEncounterRouting.formatPercent(result.successChance * 100) +
      "</span>" +
      "</button>" +
      (isExpanded
        ? '<div class="ddex-advanced-result-body"><div class="ddex-advanced-plan">' +
            window.DDEXEncounterRouting.renderOptimizationSectionsHtml(result) +
            "</div></div>"
        : "") +
      "</section>"
    );
  },
  renderAdvancedRouting: function () {
    var context = this.getAdvancedRoutingContext();
    var buf = '<li class="resultheader"><h3>Advanced Routing</h3></li>';

    if (!context) {
      this.$(".ddex-pokemon-move-list").html(
        buf + '<li class="content"><p>Advanced routing is unavailable.</p></li>',
      );
      return;
    }

    var eligibleRoutes = this.getAdvancedRoutingEligibleRoutes(context);
    var targetRouteKey = this.advancedRoutingState.targetRouteKey;
    var selectableRoutes = eligibleRoutes;
    var hasSelectedRoute = false;
    var controls =
      '<li class="content"><section class="ddex-advanced-routing-panel">';

    if (this.advancedRoutingState.ignoreBoxData) {
      controls +=
        '<div class="ddex-advanced-note">Ignoring saved box data. Planning from a fresh state.</div>';
    } else if (!context.hasSavedProgress) {
      controls +=
        '<div class="ddex-advanced-note">No saved Nuzlocke progress detected. Planning from a fresh state.</div>';
    } else {
      controls +=
        '<div class="ddex-advanced-note">Using saved Nuzlocke progress from ' +
        Dex.escapeHTML(context.nuzlockeSource) +
        ".</div>";
    }
    if (!this.advancedRoutingState.includeFamilyTree) {
      controls +=
        '<div class="ddex-advanced-note">Exact-species mode is active. Earlier evolutions or pre-evolutions do not count as success.</div>';
    }

    controls += '<div class="ddex-advanced-controls">';
    controls += '<label class="ddex-advanced-control"><span>Target location</span><select class="textbox ddex-advanced-route-select">';
    controls += '<option value="">All target locations</option>';
    for (var i = 0; i < selectableRoutes.length; i++) {
      var route = selectableRoutes[i];
      var routeLabel =
        route.routeLabel ||
        (route.locationName + " (" + snakeToTitleCase(route.encType) + ")");
      if (route.routeKey === targetRouteKey) hasSelectedRoute = true;
      controls +=
        '<option value="' +
        route.routeKey +
        '"' +
        (route.routeKey === targetRouteKey ? ' selected="selected"' : "") +
        ">" +
        Dex.escapeHTML(routeLabel) +
        "</option>";
    }
    controls += "</select></label>";
    controls += '<label class="ddex-advanced-control ddex-advanced-toggle-control"><span>Saved data</span><label class="ddex-advanced-checkbox"><input type="checkbox" class="ddex-advanced-ignore-box"' +
      (this.advancedRoutingState.ignoreBoxData ? ' checked="checked"' : "") +
      ' /> Ignore box data</label></label>';
    controls += '<label class="ddex-advanced-control ddex-advanced-toggle-control"><span>Target mode</span><label class="ddex-advanced-checkbox"><input type="checkbox" class="ddex-advanced-include-family-tree"' +
      (this.advancedRoutingState.includeFamilyTree ? ' checked="checked"' : "") +
      ' /> Include whole family line</label></label>';
    controls += '<label class="ddex-advanced-control"><span>Minimum success %</span><input class="textbox ddex-advanced-threshold-input" type="number" min="0" max="100" step="1" value="' +
      this.advancedRoutingState.thresholdPercent +
      '" /></label>';
    controls += '<div class="ddex-advanced-button-group">';
    controls +=
      '<button type="button" class="button ddex-advanced-run-button"' +
      (!eligibleRoutes.length ? ' disabled="disabled"' : "") +
      ">Search</button>";
    controls +=
      '<button type="button" class="button ddex-advanced-deep-run-button"' +
      (!eligibleRoutes.length ? ' disabled="disabled"' : "") +
      ">Deep Search (WARNING: may freeze browser tab for a few minutes)</button>";
    controls += "</div>";
    controls += "</div>";

    if (targetRouteKey && !hasSelectedRoute) {
      this.advancedRoutingState.targetRouteKey = "";
      targetRouteKey = "";
    }

    if (this.advancedRoutingState.isRunning) {
      controls +=
        '<div class="ddex-advanced-status">' +
        (this.advancedRoutingState.searchMode === "deep"
          ? "Deep searching optimal routing. This may take a few minutes, you can navigate to other tabs in your browser while waiting"
          : "Searching optimal routing...") +
        "</div>";
    } else if (!eligibleRoutes.length) {
      controls += '<div class="ddex-advanced-status">No valid target locations remain. They may already be spent in your current run.</div>';
    } else if (!this.advancedRoutingState.lastResults) {
      controls += '<div class="ddex-advanced-status">Choose settings, then click Search or Deep Search.</div>';
    }

    if (this.advancedRoutingState.lastResults && this.advancedRoutingState.lastResults.length) {
      controls += this.renderAdvancedRoutingSummary(
        this.advancedRoutingState.lastResults[0],
      );
      controls += '<div class="ddex-advanced-results">';
      for (var resultIndex = 0; resultIndex < this.advancedRoutingState.lastResults.length; resultIndex++) {
        controls += this.renderAdvancedRoutingResultCard(
          this.advancedRoutingState.lastResults[resultIndex],
        );
      }
      controls += "</div>";
    }

    controls += "</section></li>";
    this.$(".ddex-pokemon-move-list").html(buf + controls);
  },
  renderEncounters: function () {
    var $encounterList = this.$(".ddex-pokemon-encounter-list");
    if (!$encounterList.length) return;
    var locations = this.getEncounterLocations(this.id);
    var formatRate = function (i) {
      return i.toString().padStart(3, "z") + "% ";
    };
    var syncedFamilyKeys = this.getSyncedEncounterRouteFamilyKeys();
    var buf = "";
    for (let i = 0; i < locations.length; i++) {
      let location = locations[i];
      if (location.kind === "header") {
        if (buf.length != 0) {
          buf += "</ul>";
        }

        buf += `<li class="resultheader"><h3 class="${getEncounterHeaderClassName(location.encType)}">${snakeToTitleCase(location.encType)}</h3></li>`;
       
        buf += "<ul>";
      } else {
        let rate = formatRate(location.rate).trim().replaceAll("z", "");
        let zone = BattleLocationdex[location.zoneid];
        if (!zone || !zone.name) {
          continue;
        }
        buf += this.renderEncounterRouteRow(location, rate, syncedFamilyKeys);
      }
    }

    if (buf.length != 0) {
      buf += "</ul>";
    }

    $encounterList.html(buf);
  },
  getStat: function (baseStat, isHP, level, iv, ev, natureMult) {
    if (isHP) {
      if (baseStat === 1) return 1;
      return Math.floor(
        (Math.floor(
          2 * baseStat + (iv || 0) + Math.floor((ev || 0) / 4) + 100,
        ) *
          level) /
          100 +
          10,
      );
    }
    var val = Math.floor(
      (Math.floor(2 * baseStat + (iv || 0) + Math.floor((ev || 0) / 4)) *
        level) /
        100 +
        5,
    );
    if (natureMult && !isHP) val *= natureMult;
    return Math.floor(val);
  },
});
