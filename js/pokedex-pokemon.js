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

var PokedexPokemonPanel = PokedexResultPanel.extend({
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

    if (itemData) {
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
      buf +=
        '<dl class="colentry"><dt>Egg groups:</dt><dd><span class="picon" style="margin-top:-12px;' +
        Dex.getPokemonIcon("egg") +
        '"></span><a href="/egggroups/' +
        pokemon.eggGroups.map(toID).join("+") +
        '" data-target="push">' +
        pokemon.eggGroups.join(", ") +
        "</a></dd></dl>";
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

    // learnset
    if (pokemon.tier === "obtainable") {
      buf +=
        '<ul class="tabbar"><li><button class="button nav-first cur" value="move">Moves</button></li><li><button class="button" value="encounters">Encounters</button></li></ul>';
    } else {
      buf +=
        '<ul class="tabbar"><li><button class="button nav-first cur" value="move">Moves</button></li></ul>';
    }

    buf += '<ul class="utilichart nokbd">';
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
          moveHighlights[moves[i].substr(5)],
        );
      }
    }
    buf += "</ul>";

    buf += "</div>";

    this.html(buf);

    if (
      window.DDEX_NUZLOCKE_BOX &&
      typeof window.DDEX_NUZLOCKE_BOX.subscribe === "function"
    ) {
      this.handleNuzlockeUpdate = function () {
        if (this.$(".tabbar button.cur").val() === "encounters") {
          this.renderEncounters();
        }
      }.bind(this);
      window.DDEX_NUZLOCKE_BOX.subscribe(this.handleNuzlockeUpdate);
    }

    setTimeout(this.renderFullLearnset.bind(this));
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
      case "encounters":
        this.renderEncounters();
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
            buf += BattleSearch.renderTaggedMoveRow(groupMove, tutorDesc);
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
          last === "a" ? moveHighlights[moveId] : null,
        );
      }
    }
    this.$(".utilichart").html(buf);
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

    this.$(".utilichart").html(buf);
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
        let species = cleanString(slot["s"]);
        if (species === pokemon) {
           sum_rate += rateSlots[i] || 0;
        }
      }

      return sum_rate;
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
        locationsForType.push({
          kind: "location",
          encType: encType,
          rate: rate,
          zoneid: location,
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
  renderEncounters: function () {
    var locations = this.getEncounterLocations(this.id);
    var formatRate = function (i) {
      return i.toString().padStart(3, "z") + "% ";
    };
    var buf = "";
    for (let i = 0; i < locations.length; i++) {
      let location = locations[i];
      if (location.kind === "header") {
        if (buf.length != 0) {
          buf += "</ul>";
        }

        buf += `<li class="resultheader"><h3>${snakeToTitleCase(location.encType)}</h3></li>`;
       
        buf += "<ul>";
      } else {
        let rate = formatRate(location.rate).trim().replaceAll("z", "");
        let zone = BattleLocationdex[location.zoneid];
        if (!zone || !zone.name) {
          continue;
        }
        buf += BattleSearch.renderTaggedEncounterRow(zone, rate, location.zoneid);
      }
    }

    if (buf.length != 0) {
      buf += "</ul>";
    }

    this.$(".utilichart").html(buf);
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
