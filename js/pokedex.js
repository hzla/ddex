BattleSearch.urlRoot =
  window.DDEXPaths && typeof window.DDEXPaths.routerRoot === "function"
    ? window.DDEXPaths.routerRoot()
    : "/";

Dex.escapeHTML = function (str, jsEscapeToo) {
  str = String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  if (jsEscapeToo) str = str.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  return str;
};


function frameIndexFromOrientation(numFrames, orientation) {
  var map;
  if (numFrames <= 1) return 0;
  if (numFrames <= 4) map = [0, 1, 2, 3];
  else if (numFrames <= 8) map = [0, 2, 4, 6];
  else if (numFrames <= 16) map = [0, 11, 2, 4];
  else map = [0, 27, 2, 4];
  return (map[orientation] !== undefined) ? map[orientation] : map[map.length - 1];
}

function renderNpcSprites(root) {
  var scope = root || document;
  var els = scope.querySelectorAll('.npc-sprite[data-sprite-id]');
  var spriteFolder = "sprites";
  var romFamily = (localStorage.romFamily || "").toLowerCase();
  if (romFamily === "plat") {
    spriteFolder = "plat_sprites";
  } else if (romFamily === "hgss") {
    spriteFolder = "hgss_sprites";
  }
  for (var i = 0; i < els.length; i++) {
    (function () {
      var el = els[i];
      var spriteID = el.getAttribute('data-sprite-id');
      var orientation = parseInt(el.getAttribute('data-orientation') || '0', 10);
      var url = '/img/' + spriteFolder + '/' + spriteID + '.png';
      var fallbackUrl = '/img/sprites/' + spriteID + '.png';
      if (window.DDEXPaths && typeof window.DDEXPaths.withBase === "function") {
        url = window.DDEXPaths.withBase(url);
        fallbackUrl = window.DDEXPaths.withBase(fallbackUrl);
      }
      var triedFallback = false;
      var img = new Image();
      el.style.backgroundImage = 'url("' + url + '")';
      img.onload = function () {
        var numFrames = Math.max(1, Math.floor(img.naturalHeight / 32));
        var idx = frameIndexFromOrientation(numFrames, orientation);
        el.style.backgroundSize = '32px ' + (numFrames * 32) + 'px';
        el.style.backgroundPosition = '0px ' + (-idx * 32) + 'px';
      };
      img.onerror = function () {
        if (triedFallback || url === fallbackUrl) return;
        triedFallback = true;
        url = fallbackUrl;
        el.style.backgroundImage = 'url("' + url + '")';
        img.src = url;
      };
      img.src = url;
    })();
  }
}

var Topbar = Panels.Topbar.extend({
  height: 51,
});

var PokedexResultPanel = Panels.Panel.extend({
  isContentPanel: true,
  minWidth: 639,
  maxWidth: 10000,
  goHistoryBack: function (e) {
    if (e) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
    if (window.history && typeof window.history.back === "function") {
      window.history.back();
    }
  },
  handleNavigation: function (e) {
    var target = $(e.currentTarget);
    if (target.hasClass("pfx-backbutton") || target.data("target") === "back") {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (this.app && typeof this.app.clearDetailPanel === "function") {
        this.app.clearDetailPanel();
      }
      return;
    }
    var href = target.data("href") || target.attr("href") || "";
    if (!target.data("target") && href) {
      try {
        var url = new URL(href, window.location.href);
        if (url.origin === window.location.origin) {
          var appPath = url.pathname + (url.search || "");
          if (window.DDEXPaths && typeof window.DDEXPaths.stripBase === "function") {
            appPath = window.DDEXPaths.stripBase(appPath);
          }
          appPath = String(appPath || "").replace(/^\/+/, "");
          if (appPath) {
            e.preventDefault();
            e.stopImmediatePropagation();
            this.app.go(appPath, this, true, target);
            return;
          }
        }
      } catch (error) {}
    }
    Panels.Panel.prototype.handleNavigation.call(this, e);
  },
  updateBackButton: function () {
    var backButton = this.$(".pfx-backbutton").first();
    if (!backButton.length) return;
    var sidebarPath = "/" + ((this.app && this.app.currentSidebarFragment) || "");
    if (window.DDEXPaths && typeof window.DDEXPaths.withBase === "function") {
      sidebarPath = window.DDEXPaths.withBase(sidebarPath);
    }
    backButton
      .attr("href", sidebarPath)
      .attr("data-action", "clearDetailPanel")
      .attr("data-target", "")
      .html('<i class="fa fa-chevron-left"></i> Search');
  },
  ensureHistoryBackButton: function () {
    var $title = this.$(".pfx-body.dexentry h1").first();
    if (!$title.length) return;
    if ($title.children(".ddex-history-backbutton").length) return;

    $title.addClass("ddex-title-with-history-back");
    $title.prepend(
      '<button type="button" class="button ddex-history-backbutton" data-action="goHistoryBack" aria-label="Go back">' +
        '<i class="fa fa-chevron-left" aria-hidden="true"></i>' +
      "</button>",
    );
  },
  html: function (content) {
    Panels.Panel.prototype.html.call(this, content);
    this.updateBackButton();
    if (typeof this.applyDetailLayout === "function") {
      this.applyDetailLayout();
    }
    this.ensureHistoryBackButton();
  },
  initialize: function () {
    this.html("not found: " + Array.prototype.join.call(arguments, " || "));
  },
});

var PokedexItemPanel = PokedexResultPanel.extend({
  applyDetailLayout: function () {
    if (window.DDEX_DETAIL_LAYOUT) {
      window.DDEX_DETAIL_LAYOUT.applyItemLayout(this);
    }
  },
  initialize: function (id) {
    if (typeof overrides == "undefined") {
      overrides = JSON.parse(localStorage.overrides)
    }
    id = toID(id);
    var item = Dex.items.get(id);

    overrideData = {}
    if (localStorage.overrides) {
      overrideData = JSON.parse(localStorage.overrides).items[id]
    } else {
      overrideData = item
    }

    

    this.shortTitle = item.name;

    var buf = '<div class="pfx-body dexentry">';
    buf +=
      '<a href="/" class="pfx-backbutton" data-target="back"><i class="fa fa-chevron-left"></i> Pok&eacute;dex</a>';
    buf +=
      '<h1><span class="itemicon" style="' +
      Dex.getItemIcon(item) +
      '"></span> <a href="/items/' +
      id +
      '" data-target="push" class="subtle">' +
      item.name +
      "</a></h1>";



    if (overrideData.oldDesc) {
      const oldDesc = overrideData.oldDesc;
      const newDesc = overrideData.desc || overrideData.shortDesc || "";
      buf += `<p class="vanilla-text"><span class="desc-label">Old:</span><span class="desc-body">${Dex.escapeHTML(oldDesc)}</span></p>`;
      buf += `<p class="new-text"><span class="desc-label">New:</span> <span class="desc-body">${highlightChanged(oldDesc, newDesc)}</span></p>`;
    } else {
      buf += "<p>" + Dex.escapeHTML(item.desc || item.shortDesc) + "</p>";
    }
    

    if (overrides.items[id] && overrides.items[id]["location"]) {
       buf += "<h3>Found on ground: </h3><p>" + Dex.escapeHTML(overrides.items[id]["location"]) + "</p>";
    }

    if (overrides.items[id] && overrides.items[id]["customLocations"]) {
       buf += "<h3>Additional location info:</h3><p>" + Dex.escapeHTML(overrides.items[id]["customLocations"]) + "</p>";
    }

    if (overrides.items[id] && overrides.items[id]["ground_locations"]) {
       buf += "<h3>Found on ground: </h3><p>" 
       for (let loc of overrides.items[id]["ground_locations"]) {
        if (BattleLocationdex[loc]) { 
         buf += `${Dex.escapeHTML(BattleLocationdex[loc].name)}<br>`
        } else {
          buf += `${Dex.escapeHTML(loc)}<br>`
        }
       }
       buf +=  "</p>";
    }

    if (overrides.items[id] && overrides.items[id]["npcs"]) {
       buf += "<h3>Given by NPC: </h3>";
       for (let npc of overrides.items[id]["npcs"]) {
         const locName = BattleLocationdex[npc.location] ? BattleLocationdex[npc.location].name : npc.location;
         if (typeof npc.spriteID === "number") {
           buf += `<div class="npc-row" style="display:flex;align-items:center;gap:8px;margin:4px 0;margin-left: 10px">` +
             `<div class="npc-sprite" data-sprite-id="${npc.spriteID}" data-orientation="${npc.orientation}" ` +
             `style="width:32px;height:32px;background-repeat:no-repeat;image-rendering:pixelated;"></div>` +
             `<span> ${Dex.escapeHTML(locName)}</span>` +
             `</div>`;
         } else {
           buf += `<p style="margin:4px 0 4px 10px">${Dex.escapeHTML(locName)}</p>`;
         }
       }
    }

    if (overrides.items[id] && overrides.items[id]["rewards"]) {
       buf += "<h3>Rewarded after defeating: </h3><p>" 

       for (let trainer of overrides.items[id]["rewards"]) {
         buf += Dex.escapeHTML(trainer)
         buf += "<br>" 
       }
       buf += "</p>";
    }

    if (overrides.items[id] && overrides.items[id]["marts"]) {
       buf += "<h3>Purchased from pokemart at:</h3><p>" 

       for (let martLoc of overrides.items[id]["marts"]) {
         buf += Dex.escapeHTML(martLoc)
         buf += "<br>" 
       }
       buf += "</p>";
    }

    if (overrides.items[id] && overrides.items[id]["wilds"]) {
       buf += "<h3>Held by wild pokemon</h3><p>" 

       for (let pok of overrides.items[id]["wilds"]) {
         buf += `<a href="/pokemon/${cleanString(pok)}">${Dex.escapeHTML(pok)}<a>`
         buf += "<br>" 
       }
       buf += "</p>";
    }
    
    buf += "</div>";

    this.html(buf);
    renderNpcSprites(this.$el && this.$el[0]);
  },
});

var PokedexAbilityPanel = PokedexResultPanel.extend({
  applyDetailLayout: function () {
    if (window.DDEX_DETAIL_LAYOUT) {
      window.DDEX_DETAIL_LAYOUT.applyAbilityLayout(this);
    }
  },
  initialize: function (id) {
    id = toID(id);
    var ability = Dex.abilities.get(id);

    overrideData = {}
    if (localStorage.overrides) {
      overrideData = JSON.parse(localStorage.overrides).abilities[id]
    } else {
      overrideData = ability
    }


    this.id = id;
    this.shortTitle = ability.name;

    var buf = '<div class="pfx-body dexentry">';
    buf +=
      '<a href="/" class="pfx-backbutton" data-target="back"><i class="fa fa-chevron-left"></i> Pok&eacute;dex</a>';
    buf +=
      '<h1><a href="/abilities/' +
      id +
      '" data-target="push" class="subtle">' +
      ability.name +
      "</a></h1>";


    console.log(overrideData)
    if (overrideData.oldDesc) {
      const oldDesc = overrideData.oldDesc;
      const newDesc = overrideData.desc || overrideData.shortDesc || "";
      buf += `<p class="vanilla-text"><span class="desc-label">Old:</span><span class="desc-body">${Dex.escapeHTML(oldDesc)}</span></p>`;
      buf += `<p class="new-text"><span class="desc-label">New:</span> <span class="desc-body">${highlightChanged(oldDesc, newDesc)}</span></p>`;
    } else {
      buf += "<p>" + Dex.escapeHTML(ability.desc) + "</p>";
    }
 
    



    // pokemon
    buf += "<h3>Pok&eacute;mon with this ability</h3>";
    buf += '<ul class="utilichart nokbd ddex-ability-pokemon-list">';
    buf += "</ul>";

    buf += "</div>";

    this.html(buf);

    setTimeout(this.renderPokemonList.bind(this));
  },
  renderPokemonList: function (list) {
    var ability = Dex.abilities.get(this.id);
    var buf = "";
    for (var pokemonid in BattlePokedex) {
      var template = BattlePokedex[pokemonid];
      if (!template.abilities) continue;
      // if (template.isNonstandard && !ability.isNonstandard) continue;
      if (
        template.abilities["0"] === ability.name ||
        template.abilities["1"] === ability.name ||
        template.abilities["H"] === ability.name
      ) {
        buf += BattleSearch.renderPokemonRow(template);
      }
    }
    this.$(".utilichart").html(buf);
  },
});

var PokedexTypePanel = PokedexResultPanel.extend({
  applyDetailLayout: function () {
    if (window.DDEX_DETAIL_LAYOUT) {
      window.DDEX_DETAIL_LAYOUT.applyTypeLayout(this);
    }
  },
  initialize: function (id) {
    id = toID(id);
    this.type = id[0].toUpperCase() + id.substr(1);
    var type = Dex.types.get(this.type);
    this.shortTitle = this.type;

    var buf = '<div class="pfx-body dexentry">';
    buf +=
      '<a href="/" class="pfx-backbutton" data-target="back"><i class="fa fa-chevron-left"></i> Pok&eacute;dex</a>';
    buf +=
      '<h1><a href="/types/' +
      id +
      '" data-target="push" class="subtle">' +
      this.type +
      "</a></h1>";
    buf += "<dl>";
    var atLeastOne = false;

    buf += "<dt>Weaknesses:</dt> <dd>";
    for (var attackType in type.damageTaken) {
      if (type.damageTaken[attackType] == 1) {
        buf +=
          '<a href="/types/' +
          toID(attackType) +
          '" data-target="push">' +
          Dex.getTypeIcon(attackType) +
          "</a> ";
        atLeastOne = true;
      }
    }
    if (!atLeastOne) {
      buf += "<em>No weaknesses</em>";
    }
    buf += "</dd>";

    buf += "<dt>Resistances:</dt> <dd>";
    atLeastOne = false;
    for (var attackType in type.damageTaken) {
      if (type.damageTaken[attackType] == 2) {
        buf +=
          '<a href="/types/' +
          toID(attackType) +
          '" data-target="push">' +
          Dex.getTypeIcon(attackType) +
          "</a> ";
        atLeastOne = true;
      }
    }
    if (!atLeastOne) {
      buf += "<em>No resistances</em>";
    }
    buf += "</dd>";

    buf += "<dt>Immunities:</dt> <dd>";
    atLeastOne = false;
    for (var attackType in type.damageTaken) {
      if (type.damageTaken[attackType] == 3) {
        if (attackType === attackType.toLowerCase()) {
          switch (attackType) {
            case "hail":
              buf +=
                '<div><small><a href="/moves/hail" data-target="push">Hail</a> damage</small></div>';
              break;
            case "sandstorm":
              buf +=
                '<div><small><a href="/moves/sandstorm" data-target="push">Sandstorm</a> damage</small></div>';
              break;
            case "powder":
              buf +=
                '<div><small><a href="/tags/powder" data-target="push">Powder moves</a></small></div>';
              break;
            case "frz":
              buf += "<div><small>FRZ status</small></div>";
              break;
            case "brn":
              buf += "<div><small>BRN status</small></div>";
              break;
            case "psn":
              buf += "<div><small>PSN status</small></div>";
              break;
            case "par":
              buf += "<div><small>PAR status</small></div>";
              break;
          }
          if (!atLeastOne) atLeastOne = null;
          continue;
        }
        buf +=
          '<a href="/types/' +
          toID(attackType) +
          '" data-target="push">' +
          Dex.getTypeIcon(attackType) +
          "</a> ";
        atLeastOne = true;
      }
    }
    if (!atLeastOne) {
      if (atLeastOne === null) {
        buf += "<div><em>No type immunities</em></div>";
      } else {
        buf += "<em>No immunities</em>";
      }
    }
    buf += "</dd>";

    buf += "</dl>";

    // move list
    buf +=
      '<ul class="tabbar"><li><button class="button nav-first cur" value="move">Moves</button></li><li><button class="button nav-last" value="pokemon">Pokemon</button></li></ul>';
    buf += '<ul class="utilichart nokbd">';
    buf += "</ul>";

    buf += "</div>";

    this.html(buf);

    setTimeout(this.renderMoveList.bind(this));
  },
  events: {
    "click .tabbar button": "selectTab",
  },
  selectTab: function (e) {
    this.$(".tabbar button").removeClass("cur");
    $(e.currentTarget).addClass("cur");
    switch (e.currentTarget.value) {
      case "move":
        this.renderMoveList();
        break;
      case "pokemon":
        this.renderPokemonList();
        break;
    }
  },
  renderMoveList: function () {
    var type = this.type;
    var buf =
      '<li class="resultheader"><h3>Physical ' + type + " moves</h3></li>";
    for (var moveid in BattleMovedex) {
      var move = BattleMovedex[moveid];
      if (move.type === type && move.category === "Physical") {
        buf += BattleSearch.renderMoveRow(move);
      }
    }
    this.$(".utilichart")
      .html(buf)
      .css("min-height", 27 * 3 + 33 * BattleSearchCountIndex[type + " move"]);

    setTimeout(this.renderMoveList2.bind(this));
  },
  renderMoveList2: function () {
    var type = this.type;
    var bufs = [
      '<li class="resultheader"><h3>Physical ' + type + " moves</h3></li>",
      '<li class="resultheader"><h3>Special ' + type + " moves</h3></li>",
      '<li class="resultheader"><h3>Status ' + type + " moves</h3></li>",
    ];
    var bufChart = { Physical: 0, Special: 1, Status: 2 };
    for (var moveid in BattleMovedex) {
      var move = BattleMovedex[moveid];
      if (move.type === type) {
        bufs[bufChart[move.category]] += BattleSearch.renderMoveRow(move);
      }
    }
    this.$(".utilichart")
      .html(bufs.join(""))
      .css("min-height", 27 * 3 + 33 * BattleSearchCountIndex[type + " move"]);
  },
  renderPokemonList: function () {
    var type = this.type;
    var pureBuf =
      '<li class="resultheader"><h3>Pure ' + type + " Pok&eacute;mon</h3></li>";
    for (var templateid in BattlePokedex) {
      var template = BattlePokedex[templateid];
      if (template.types[0] === type && !template.types[1]) {
        pureBuf += BattleSearch.renderPokemonRow(template);
      }
    }
    this.$(".utilichart")
      .html(pureBuf)
      .css(
        "min-height",
        27 * 3 + 33 * BattleSearchCountIndex[type + " pokemon"],
      );

    setTimeout(this.renderPokemonList2.bind(this));
  },
  renderPokemonList2: function () {
    var type = this.type;
    var primaryBuf =
      '<li class="resultheader"><h3>Primary ' +
      type +
      " Pok&eacute;mon</h3></li>";
    var secondaryBuf =
      '<li class="resultheader"><h3>Secondary ' +
      type +
      " Pok&eacute;mon</h3></li>";
    for (var templateid in BattlePokedex) {
      var template = BattlePokedex[templateid];
      if (template.types[0] === type) {
        if (template.types[1]) {
          primaryBuf += BattleSearch.renderPokemonRow(template);
        }
      } else if (template.types[1] === type) {
        secondaryBuf += BattleSearch.renderPokemonRow(template);
      }
    }
    this.$(".utilichart").append(primaryBuf + secondaryBuf);
  },
});

var PokedexTagPanel = PokedexResultPanel.extend({
  applyDetailLayout: function () {
    if (window.DDEX_DETAIL_LAYOUT) {
      window.DDEX_DETAIL_LAYOUT.applyTagLayout(this);
    }
  },
  table: {
    contact: {
      name: "Contact",
      tag: "contact",
      desc: "Affected by a variety of moves, abilities, and items.</p><p>Moves affected by contact moves include: Spiky Shield, King's Shield. Abilities affected by contact moves include: Iron Barbs, Rough Skin, Gooey, Flame Body, Static, Tough Claws. Items affected by contact moves include: Rocky Helmet, Sticky Barb.",
    },
    sound: {
      name: "Sound",
      tag: "sound",
      desc: 'Bypasses <a href="/moves/substitute" data-target="push">Substitute</a>. Doesn\'t affect <a href="/abilities/soundproof" data-target="push">Soundproof</a> Pok&eacute;mon.',
    },
    powder: {
      name: "Powder",
      tag: "powder",
      desc: 'Doesn\'t affect <a href="/types/grass" data-target="push">Grass-type</a> Pok&eacute;mon, <a href="/abilities/overcoat" data-target="push">Overcoat</a> Pok&eacute;mon, or <a href="/items/safetygoggles" data-target="push">Safety Goggles</a> holders.',
    },
    fist: {
      name: "Fist",
      tag: "punch",
      desc: 'Boosted 1.2x by <a href="/abilities/ironfist" data-target="push">Iron Fist</a>.',
    },
    pulse: {
      name: "Pulse",
      tag: "pulse",
      desc: 'Boosted 1.5x by <a href="/abilities/megalauncher" data-target="push">Mega Launcher</a>.',
    },
    bite: {
      name: "Bite",
      tag: "bite",
      desc: 'Boosted 1.5x by <a href="/abilities/strongjaw" data-target="push">Strong Jaw</a>.',
    },
    ballistic: {
      name: "Ballistic",
      tag: "bullet",
      desc: 'Doesn\'t affect <a href="/abilities/bulletproof" data-target="push">Bulletproof</a> Pok&eacute;mon.',
    },
    slicing: {
      name: "Slicing",
      tag: "slicing",
      desc: 'Boosted 1.5x by <a href="/abilities/sharpness" data-target="push">Sharpness</a>.',
    },
    wind: {
      name: "Wind",
      tag: "wind",
      desc: 'Pok&eacute;mon with <a href="/abilities/windpower" data-target="push">Wind Power</a> gain the charge effect after being hit. Pok&eacute;mon with <a href="/abilities/windrider" data-target="push">Wind Rider</a> have their Attack raised by 1 stage and are immune.',
    },
    bypassprotect: {
      name: "Bypass Protect",
      tag: "",
      desc: 'Bypasses <a class="subtle" href="/moves/protect" data-target="push">Protect</a>, <a class="subtle" href="/moves/detect" data-target="push">Detect</a>, <a class="subtle" href="/moves/kingsshield" data-target="push">King\'s Shield</a>, and <a class="subtle" href="/moves/spikyshield" data-target="push">Spiky Shield</a>.',
    },
    nonreflectable: {
      name: "Nonreflectable",
      tag: "",
      desc: 'Can\'t be bounced by <a class="subtle" href="/moves/magiccoat" data-target="push">Magic Coat</a> or <a class="subtle" href="/abilities/magicbounce" data-target="push">Magic Bounce</a>.',
    },
    nonmirror: {
      name: "Nonmirror",
      tag: "",
      desc: 'Can\'t be copied by <a class="subtle" href="/moves/mirrormove" data-target="push">Mirror Move</a>.',
    },
    nonsnatchable: {
      name: "Nonsnatchable",
      tag: "",
      desc: 'Can\'t be copied by <a class="subtle" href="/moves/snatch" data-target="push">Snatch</a>.',
    },
    bypasssub: {
      name: "Bypass Substitute",
      tag: "bypasssub",
      desc: 'Bypasses but does not break a <a class="subtle" href="/moves/substitute" data-target="push">Substitute</a>.',
    },
    zmove: {
      name: "Z-Move",
      tag: "",
      desc: 'Is a <a class="subtle" href="/articles/zmoves" data-target="push">Z-Move</a>.',
    },
    maxmove: {
      name: "Max Move",
      tag: "",
      desc: 'Is a <a class="subtle" href="/articles/maxmoves" data-target="push">Max Move</a>.',
    },
    gmaxmove: {
      name: "G-Max Move",
      tag: "",
      desc: 'Is a <a class="subtle" href="/articles/gmaxmoves" data-target="push">G-Max Move</a>.',
    },
  },
  initialize: function (id) {
    var tag = this.table[id];
    var name = tag ? tag.name : id;
    this.id = id;
    this.shortTitle = name;

    var buf = '<div class="pfx-body dexentry">';

    buf +=
      '<a href="/" class="pfx-backbutton" data-target="back"><i class="fa fa-chevron-left"></i> Pok&eacute;dex</a>';
    buf +=
      '<h1><a href="/tags/' +
      id +
      '" data-target="push" class="subtle">' +
      name +
      "</a></h1>";

    if (tag) buf += "<p>" + tag.desc + "</p>";

    // distribution
    buf += "<h3>" + name + " moves</h3>";
    buf += '<ul class="utilichart metricchart nokbd">';
    buf += "</ul>";

    buf += "</div>";

    this.html(buf);

    setTimeout(this.renderDistribution.bind(this));
  },
  getDistribution: function () {
    if (this.results) return this.results;
    var tag = this.id in this.table ? this.table[this.id].tag : this.id;
    var results = [];
    if (tag) {
      for (var moveid in BattleMovedex) {
        if (BattleMovedex[moveid].flags && tag in BattleMovedex[moveid].flags)
          results.push(moveid);
      }
    } else if (this.id === "bypassprotect") {
      for (var moveid in BattleMovedex) {
        if (
          BattleMovedex[moveid].target !== "self" &&
          BattleMovedex[moveid].flags &&
          !("protect" in BattleMovedex[moveid].flags)
        ) {
          results.push(moveid);
        }
      }
    } else if (this.id === "nonreflectable") {
      for (var moveid in BattleMovedex) {
        if (
          BattleMovedex[moveid].target !== "self" &&
          BattleMovedex[moveid].category === "Status" &&
          BattleMovedex[moveid].flags &&
          !("reflectable" in BattleMovedex[moveid].flags)
        ) {
          results.push(moveid);
        }
      }
    } else if (this.id === "zmove") {
      for (var moveid in BattleMovedex) {
        if (BattleMovedex[moveid].isZ) {
          results.push(moveid);
        }
      }
    } else if (this.id === "nonmirror") {
      for (var moveid in BattleMovedex) {
        if (
          BattleMovedex[moveid].target !== "self" &&
          BattleMovedex[moveid].flags &&
          !("mirror" in BattleMovedex[moveid].flags)
        ) {
          results.push(moveid);
        }
      }
    } else if (this.id === "nonsnatchable") {
      for (var moveid in BattleMovedex) {
        if (
          (BattleMovedex[moveid].target === "allyTeam" ||
            BattleMovedex[moveid].target === "self" ||
            BattleMovedex[moveid].target === "adjacentAllyOrSelf") &&
          BattleMovedex[moveid].flags &&
          !("snatch" in BattleMovedex[moveid].flags)
        ) {
          results.push(moveid);
        }
      }
    }
    return (this.results = results);
  },
  renderDistribution: function () {
    var results = this.getDistribution();
    this.$chart = this.$(".utilichart");

    if (results.length > 1600 / 33) {
      this.streamLoading = true;
      this.$el.on("scroll", this.handleScroll.bind(this));

      var panelTop = this.$el.children().offset().top;
      var panelHeight = this.$el.outerHeight();
      var chartTop = this.$chart.offset().top;
      var scrollLoc = (this.scrollLoc = this.$el.scrollTop());

      var start = Math.floor((scrollLoc - (chartTop - panelTop)) / 33 - 35);
      var end = Math.floor(start + 35 + panelHeight / 33 + 35);
      if (start < 0) start = 0;
      if (end > results.length - 1) end = results.length - 1;
      (this.start = start), (this.end = end);

      // distribution
      var buf = "";
      for (var i = 0, len = results.length; i < len; i++) {
        buf +=
          '<li class="result">' +
          this.renderRow(i, i < start || i > end) +
          "</li>";
      }
      this.$chart.html(buf);
    } else {
      var buf = "";
      for (var i = 0, len = results.length; i < len; i++) {
        buf += '<li class="result">' + this.renderRow(i) + "</li>";
      }
      this.$chart.html(buf);
    }
  },
  renderRow: function (i, offscreen) {
    var results = this.results;
    var move = BattleMovedex[results[i]];
    if (offscreen) {
      return move.name;
    } else {
      return BattleSearch.renderMoveRowInner(move);
    }
  },
  handleScroll: function () {
    var scrollLoc = this.$el.scrollTop();
    if (Math.abs(scrollLoc - this.scrollLoc) > 20 * 33) {
      this.renderUpdateDistribution();
    }
  },
  debouncedPurgeTimer: null,
  renderUpdateDistribution: function (fullUpdate) {
    if (this.debouncedPurgeTimer) {
      clearTimeout(this.debouncedPurgeTimer);
      this.debouncedPurgeTimer = null;
    }

    var panelTop = this.$el.children().offset().top;
    var panelHeight = this.$el.outerHeight();
    var chartTop = this.$chart.offset().top;
    var scrollLoc = (this.scrollLoc = this.$el.scrollTop());

    var results = this.results;

    var rowFit = Math.floor(panelHeight / 33);

    var start = Math.floor((scrollLoc - (chartTop - panelTop)) / 33 - 35);
    var end = start + 35 + rowFit + 35;
    if (start < 0) start = 0;
    if (end > results.length - 1) end = results.length - 1;

    var $rows = this.$chart.children();

    if (
      fullUpdate ||
      start < this.start - rowFit - 30 ||
      end > this.end + rowFit + 30
    ) {
      var buf = "";
      for (var i = 0, len = results.length; i < len; i++) {
        buf +=
          '<li class="result">' +
          this.renderRow(i, i < start || i > end) +
          "</li>";
      }
      this.$chart.html(buf);
      (this.start = start), (this.end = end);
      return;
    }

    if (start < this.start) {
      for (var i = start; i < this.start; i++) {
        $rows[i].innerHTML = this.renderRow(i);
      }
      this.start = start;
    }

    if (end > this.end) {
      for (var i = this.end + 1; i <= end; i++) {
        $rows[i].innerHTML = this.renderRow(i);
      }
      this.end = end;
    }

    if (this.end - this.start > rowFit + 90) {
      var self = this;
      this.debouncedPurgeTimer = setTimeout(function () {
        self.renderUpdateDistribution(true);
      }, 1000);
    }
  },
});

var PokedexEggGroupPanel = PokedexResultPanel.extend({
  applyDetailLayout: function () {
    if (window.DDEX_DETAIL_LAYOUT) {
      window.DDEX_DETAIL_LAYOUT.applyEggGroupLayout(this);
    }
  },
  table: {
    amorphous: {
      name: "Amorphous",
      desc: "",
    },
    bug: {
      name: "Bug",
      desc: "",
    },
    ditto: {
      name: "Ditto",
      desc: "Can breed with anything.",
    },
    dragon: {
      name: "Dragon",
      desc: "",
    },
    fairy: {
      name: "Fairy",
      desc: "",
    },
    field: {
      name: "Field",
      desc: "",
    },
    flying: {
      name: "Flying",
      desc: "",
    },
    grass: {
      name: "Grass",
      desc: "",
    },
    humanlike: {
      name: "Human-Like",
      desc: "",
    },
    mineral: {
      name: "Mineral",
      desc: "",
    },
    monster: {
      name: "Monster",
      desc: "",
    },
    plant: {
      name: "Plant",
      desc: "",
    },
    undiscovered: {
      name: "Undiscovered",
      desc: "Can't breed.",
    },
    water1: {
      name: "Water 1",
      desc: "",
    },
    water2: {
      name: "Water 2",
      desc: "",
    },
    water3: {
      name: "Water 3",
      desc: "",
    },
  },
  initialize: function (id) {
    var ids = id.split("+");
    for (var i = 0; i < ids.length; i++) ids[i] = toID(ids[i]);
    this.id = ids[0];
    var names = this.table[ids[0]].name;
    this.shortTitle = names;
    if (ids[1]) {
      this.id2 = ids[1];
      names += " + " + this.table[ids[1]].name;
      this.shortTitle = "Egg groups";
    }

    var buf = '<div class="pfx-body dexentry">';

    buf +=
      '<a href="/" class="pfx-backbutton" data-target="back"><i class="fa fa-chevron-left"></i> Pok&eacute;dex</a>';
    buf +=
      '<h1><a href="/egggroups/' +
      id +
      '" data-target="push" class="subtle">' +
      names +
      "</a></h1>";

    if (this.id2) {
      buf +=
        '<p>All Pok&eacute;mon in either the <a href="/egggroups/' +
        this.id +
        '" data-target="push">' +
        this.table[ids[0]].name +
        '</a> or <a href="/egggroups/' +
        this.id2 +
        '" data-target="push">' +
        this.table[ids[1]].name +
        "</a> egg group.</p>";
    } else {
      buf += "<p>" + this.table[ids[0]].desc + "</p>";
    }

    // distribution
    buf += "<h3>Basic " + names + " pokemon</h3>";
    buf += '<ul class="utilichart metricchart nokbd">';
    buf += "</ul>";

    buf += "</div>";

    this.html(buf);

    setTimeout(this.renderDistribution.bind(this));
  },
  getDistribution: function () {
    var name = this.table[this.id].name;
    var name2 = "!";
    if (this.id2) name2 = this.table[this.id2].name;
    if (this.results) return this.results;
    var results = [];
    for (var pokemonid in BattlePokedex) {
      var pokemon = BattlePokedex[pokemonid];
      var eggGroups = pokemon.eggGroups;
      // var prevo = toID(pokemon.prevo);
      if (!eggGroups || pokemon.forme) continue;
      // || (prevo && BattlePokedex[prevo].eggGroups[0] !== "Undiscovered") - irrelevant in gen 9
      if (pokemon && pokemon.isNonstandard) continue;
      if (
        eggGroups[0] === name ||
        eggGroups[1] === name ||
        eggGroups[0] === name2 ||
        eggGroups[1] === name2
      ) {
        results.push(pokemonid);
      }
    }
    results.sort();
    return (this.results = results);
  },
  renderDistribution: function () {
    var results = this.getDistribution();
    this.$chart = this.$(".utilichart");

    if (results.length > 1600 / 33) {
      this.streamLoading = true;
      this.$el.on("scroll", this.handleScroll.bind(this));

      var panelTop = this.$el.children().offset().top;
      var panelHeight = this.$el.outerHeight();
      var chartTop = this.$chart.offset().top;
      var scrollLoc = (this.scrollLoc = this.$el.scrollTop());

      var start = Math.floor((scrollLoc - (chartTop - panelTop)) / 33 - 35);
      var end = Math.floor(start + 35 + panelHeight / 33 + 35);
      if (start < 0) start = 0;
      if (end > results.length - 1) end = results.length - 1;
      (this.start = start), (this.end = end);

      // distribution
      var buf = "";
      for (var i = 0, len = results.length; i < len; i++) {
        buf +=
          '<li class="result">' +
          this.renderRow(i, i < start || i > end) +
          "</li>";
      }
      this.$chart.html(buf);
    } else {
      var buf = "";
      for (var i = 0, len = results.length; i < len; i++) {
        buf += '<li class="result">' + this.renderRow(i) + "</li>";
      }
      this.$chart.html(buf);
    }
  },
  renderRow: function (i, offscreen) {
    var results = this.results;
    var template = BattlePokedex[results[i]];
    if (offscreen) {
      return (
        "" +
        template.species +
        " " +
        template.abilities["0"] +
        " " +
        (template.abilities["1"] || "") +
        " " +
        (template.abilities["H"] || "") +
        ""
      );
    } else {
      return BattleSearch.renderTaggedPokemonRowInner(
        template,
        '<span class="picon" style="margin-top:-12px;' +
          Dex.getPokemonIcon("egg") +
          '"></span>',
      );
    }
  },
  handleScroll: function () {
    var scrollLoc = this.$el.scrollTop();
    if (Math.abs(scrollLoc - this.scrollLoc) > 20 * 33) {
      this.renderUpdateDistribution();
    }
  },
  debouncedPurgeTimer: null,
  renderUpdateDistribution: function (fullUpdate) {
    if (this.debouncedPurgeTimer) {
      clearTimeout(this.debouncedPurgeTimer);
      this.debouncedPurgeTimer = null;
    }

    var panelTop = this.$el.children().offset().top;
    var panelHeight = this.$el.outerHeight();
    var chartTop = this.$chart.offset().top;
    var scrollLoc = (this.scrollLoc = this.$el.scrollTop());

    var results = this.results;

    var rowFit = Math.floor(panelHeight / 33);

    var start = Math.floor((scrollLoc - (chartTop - panelTop)) / 33 - 35);
    var end = start + 35 + rowFit + 35;
    if (start < 0) start = 0;
    if (end > results.length - 1) end = results.length - 1;

    var $rows = this.$chart.children();

    if (
      fullUpdate ||
      start < this.start - rowFit - 30 ||
      end > this.end + rowFit + 30
    ) {
      var buf = "";
      for (var i = 0, len = results.length; i < len; i++) {
        buf +=
          '<li class="result">' +
          this.renderRow(i, i < start || i > end) +
          "</li>";
      }
      this.$chart.html(buf);
      (this.start = start), (this.end = end);
      return;
    }

    if (start < this.start) {
      for (var i = start; i < this.start; i++) {
        $rows[i].innerHTML = this.renderRow(i);
      }
      this.start = start;
    }

    if (end > this.end) {
      for (var i = this.end + 1; i <= end; i++) {
        $rows[i].innerHTML = this.renderRow(i);
      }
      this.end = end;
    }

    if (this.end - this.start > rowFit + 90) {
      var self = this;
      this.debouncedPurgeTimer = setTimeout(function () {
        self.renderUpdateDistribution(true);
      }, 1000);
    }
  },
});

var PokedexCategoryPanel = PokedexResultPanel.extend({
  applyDetailLayout: function () {
    if (window.DDEX_DETAIL_LAYOUT) {
      window.DDEX_DETAIL_LAYOUT.applyTypeLayout(this);
    }
  },
  initialize: function (id) {
    id = toID(id);
    var category = {
      id: id,
      name: id[0].toUpperCase() + id.substr(1),
    };
    this.shortTitle = category.name;

    var buf = '<div class="pfx-body dexentry">';
    buf +=
      '<a href="/" class="pfx-backbutton" data-target="back"><i class="fa fa-chevron-left"></i> Pok&eacute;dex</a>';
    buf +=
      '<h1><a href="/categories/' +
      id +
      '" data-target="push" class="subtle">' +
      category.name +
      "</a></h1>";
    switch (id) {
      case "physical":
        buf +=
          "<p>Physical moves are damaging moves generally calculated with the user's Attack stat and the target's Defense stat.</p>";
        break;
      case "special":
        buf +=
          "<p>Special moves are damaging moves generally calculated with the user's Special Attack stat and the target's Special Defense stat.</p>";
        break;
      case "status":
        buf += "<p>Status moves are moves that don't deal damage directly.</p>";
        break;
    }
    buf += "</div>";

    this.html(buf);
    renderNpcSprites(this.$el && this.$el[0]);
  },
});

var PokedexTierPanel = PokedexResultPanel.extend({
  applyDetailLayout: function () {
    if (window.DDEX_DETAIL_LAYOUT) {
      window.DDEX_DETAIL_LAYOUT.applyTierLayout(this);
    }
  },
  initialize: function (id) {
    var tierTable = {
      ag: "AG",
      uber: "Uber",
      ou: "OU",
      uu: "UU",
      ru: "RU",
      nu: "NU",
      pu: "PU",
      nfe: "NFE",
      lcuber: "LC Uber",
      lc: "LC",
      cap: "CAP",
      capnfe: "CAP NFE",
      caplc: "CAP LC",
      uubl: "UUBL",
      rubl: "RUBL",
      nubl: "NUBL",
      publ: "PUBL",
      unreleased: "Unreleased",
      illegal: "Illegal",
    };
    var name = tierTable[id] || id;
    this.id = id;
    this.shortTitle = name;

    var buf = '<div class="pfx-body dexentry">';
    buf +=
      '<a href="/" class="pfx-backbutton" data-target="back"><i class="fa fa-chevron-left"></i> Pok&eacute;dex</a>';
    buf +=
      '<h1><a href="/tiers/' +
      id +
      '" data-target="push" class="subtle">' +
      name +
      "</a></h1>";

    if (id === "nfe") {
      buf +=
        "<p>\"NFE\" (Not Fully Evolved) as a tier refers to NFE Pokémon that aren't legal in LC and don't make the usage cutoff for a tier such as PU.</p>";
    }

    if (id.startsWith("cap"))
      buf +=
        '<div class="warning"><strong>Note:</strong> <a href="http://www.smogon.com/cap/" target="_blank">Smogon CAP</a> is a project to make up Pok&eacute;mon.</div>';

    // buf += '<p></p>';

    // pokemon
    buf += "<h3>Pok&eacute;mon in this tier</h3>";
    buf += '<ul class="utilichart nokbd">';
    buf += "</ul>";

    buf += "</div>";

    this.html(buf);

    setTimeout(this.renderPokemonList.bind(this));
  },
  renderPokemonList: function (list) {
    var tierName = this.shortTitle;
    var tierName2 = "(" + tierName + ")";
    var buf = "";
    for (var pokemonid in BattlePokedex) {
      var template = BattlePokedex[pokemonid];
      if (template.tier === tierName || template.tier === tierName2) {
        buf += BattleSearch.renderPokemonRow(template);
      }
    }
    this.$(".utilichart").html(buf);
  },
});

var PokedexArticlePanel = PokedexResultPanel.extend({
  applyDetailLayout: function () {
    if (window.DDEX_DETAIL_LAYOUT) {
      window.DDEX_DETAIL_LAYOUT.applyArticleLayout(this);
    }
  },
  initialize: function (id) {
    id = toID(id);
    var isUndergroundLootArticle = id === "undergroundloot";
    var isGroundItemsArticle = id === "grounditems";
    var isHiddenItemsArticle = id === "hiddenitems";
    var isNpcItemsArticle = id === "npcitems";
    this.shortTitle = isUndergroundLootArticle
      ? "Underground Loot"
      : isGroundItemsArticle
        ? "Ground Items"
      : isHiddenItemsArticle
        ? "Hidden Items"
        : isNpcItemsArticle
          ? "NPC Items"
        : id;

    var buf = '<div class="pfx-body dexentry">';
    buf +=
      '<a href="/" class="pfx-backbutton" data-target="back"><i class="fa fa-chevron-left"></i> Pok&eacute;dex</a>';
    buf +=
      '<h1><a href="/articles/' +
      id +
      '" data-target="push" class="subtle">' +
      Dex.escapeHTML(this.shortTitle) +
      "</a></h1>";
    buf += '<div class="article-content"><em>Loading...</em></div>';
    buf += "</div>";

    this.html(buf);

    if (isUndergroundLootArticle) {
      this.$(".article-content").html(buildUndergroundLootArticleHtml());
      return;
    }
    if (isGroundItemsArticle) {
      this.$(".article-content").html(buildGroundItemsArticleHtml());
      return;
    }
    if (isHiddenItemsArticle) {
      this.$(".article-content").html(buildHiddenItemsArticleHtml());
      return;
    }
    if (isNpcItemsArticle) {
      this.$(".article-content").html(buildNpcItemsArticleHtml());
      renderNpcSprites(this.$el && this.$el[0]);
      return;
    }

    var self = this;
    $.get("/.articles-cached/" + id + ".html").done(function (html) {
      var html = html.replace(
        /<h1[^>]*>([^<]+)<\/h1>/,
        function (match, innerMatch) {
          self.shortTitle = innerMatch;
          self
            .$("h1")
            .first()
            .html(
              '<a href="/articles/' +
                id +
                '" class="subtle" data-target="push">' +
                innerMatch +
                "</a>",
            );
          return "";
        },
      );
      self.$(".article-content").html(html);
    });
  },
});

function getUndergroundLootDebugData() {
  var miningDebug =
    window.DDEX_ROM_MINING_DEBUG ||
    (window.DDEX_ROM_DEBUG && window.DDEX_ROM_DEBUG.miningTable) ||
    null;
  if (!miningDebug || miningDebug.status !== "ok") return null;
  return miningDebug;
}

function formatUndergroundProbabilityPercent(probability) {
  var value = Number(probability || 0) * 100;
  return value.toFixed(4) + "%";
}

function formatUndergroundProbabilityOdds(probability) {
  var value = Number(probability || 0);
  if (!value) return "N/A";
  return "1 in " + (1 / value).toFixed(2);
}

function renderUndergroundProbabilityCell(weight, probability) {
  return (
    '<div class="ddex-underground-probability">' +
      '<strong>' + Dex.escapeHTML(formatUndergroundProbabilityPercent(probability)) + "</strong>" +
      '<span>weight ' + Dex.escapeHTML(String(weight || 0)) + "</span>" +
      '<span>' + Dex.escapeHTML(formatUndergroundProbabilityOdds(probability)) + "</span>" +
    "</div>"
  );
}

function getUndergroundLootRows() {
  var miningDebug = getUndergroundLootDebugData();
  if (!miningDebug || !miningDebug.aggregates || !miningDebug.aggregates.byBagItemId) return [];
  var itemNames =
    window.DDEX_ROM_TEXTS && Array.isArray(window.DDEX_ROM_TEXTS.itemNames)
      ? window.DDEX_ROM_TEXTS.itemNames
      : [];
  var rows = [];

  for (var bagItemId in miningDebug.aggregates.byBagItemId) {
    var aggregate = miningDebug.aggregates.byBagItemId[bagItemId];
    if (!aggregate) continue;
    var itemId = Number(bagItemId);
    var itemName = itemNames[itemId] || aggregate.bagItemName || ("ITEM_" + bagItemId);
    rows.push({
      itemId: itemId,
      itemName: itemName,
      entryIndexes: Array.isArray(aggregate.entryIndexes) ? aggregate.entryIndexes.slice() : [],
      weights: aggregate.weights || {},
      probabilities: aggregate.probabilities || {},
    });
  }

  rows.sort(function (a, b) {
    var nameCmp = String(a.itemName || "").localeCompare(String(b.itemName || ""));
    if (nameCmp) return nameCmp;
    return a.itemId - b.itemId;
  });
  return rows;
}

function buildUndergroundLootArticleHtml() {
  var miningDebug = getUndergroundLootDebugData();
  if (!miningDebug) {
    return (
      '<div class="ddex-underground-loot">' +
        "<p>Load a Platinum-family ROM with Underground mining data to view this page.</p>" +
      "</div>"
    );
  }

  var rows = getUndergroundLootRows();
  var buf = '<div class="ddex-underground-loot">';
  buf += '<table class="ddex-underground-table">';
  buf += "<thead><tr>";
  buf += "<th>Item</th>";
  buf += "<th>Pre NatDex Odd TID</th>";
  buf += "<th>Pre NatDex Even TID</th>";
  buf += "<th>Post NatDex Odd TID</th>";
  buf += "<th>Post NatDex Even TID</th>";
  buf += "</tr></thead><tbody>";

  for (var i = 0; i < rows.length; i += 1) {
    var row = rows[i];
    var itemHref = "/items/" + toID(row.itemName);
    var mergedFrom = row.entryIndexes.length > 1
      ? '<span class="ddex-underground-item-meta">Merged entries: ' + Dex.escapeHTML(row.entryIndexes.join(", ")) + "</span>"
      : '<span class="ddex-underground-item-meta">Entry: ' + Dex.escapeHTML(String(row.entryIndexes[0])) + "</span>";
    buf += "<tr>";
    buf += '<th scope="row"><a href="' + itemHref + '" data-target="push">' + Dex.escapeHTML(row.itemName) + "</a>" +
      '<span class="ddex-underground-item-meta">Item ID: ' + Dex.escapeHTML(String(row.itemId)) + "</span>" +
      mergedFrom +
      "</th>";
    buf += "<td>" + renderUndergroundProbabilityCell(row.weights.preNatDexOddTID, row.probabilities.preNatDexOddTID) + "</td>";
    buf += "<td>" + renderUndergroundProbabilityCell(row.weights.preNatDexEvenTID, row.probabilities.preNatDexEvenTID) + "</td>";
    buf += "<td>" + renderUndergroundProbabilityCell(row.weights.postNatDexOddTID, row.probabilities.postNatDexOddTID) + "</td>";
    buf += "<td>" + renderUndergroundProbabilityCell(row.weights.postNatDexEvenTID, row.probabilities.postNatDexEvenTID) + "</td>";
    buf += "</tr>";
  }

  buf += "</tbody></table></div>";
  return buf;
}

function getHiddenItemLocationDebugData() {
  var itemLocationDebug =
    window.DDEX_ROM_ITEM_LOCATION_DEBUG ||
    (window.DDEX_ROM_DEBUG && window.DDEX_ROM_DEBUG.itemLocations) ||
    null;
  if (!itemLocationDebug || !itemLocationDebug.byItem) return null;
  return itemLocationDebug;
}

function getItemLocationDisplayNameMap() {
  var itemNames =
    window.DDEX_ROM_TEXTS && Array.isArray(window.DDEX_ROM_TEXTS.itemNames)
      ? window.DDEX_ROM_TEXTS.itemNames
      : [];
  var byKey = {};
  for (var i = 0; i < itemNames.length; i += 1) {
    var itemName = String(itemNames[i] || "").trim();
    if (!itemName) continue;
    byKey[toID(itemName)] = itemName;
  }
  return byKey;
}

function getItemLocationRows(kind) {
  var itemLocationDebug = getHiddenItemLocationDebugData();
  if (!itemLocationDebug) return [];

  var itemNamesByKey = getItemLocationDisplayNameMap();
  var rows = [];
  var matcher;

  if (kind === "ground") {
    matcher = function (record) {
      return record && record.foundMethod === "event_script_number";
    };
  } else if (kind === "hidden") {
    matcher = function (record) {
      return record && record.foundMethod === "hidden_item";
    };
  } else if (kind === "npc") {
    matcher = function (record) {
      return record && record.foundMethod === "script_parse";
    };
  } else {
    return [];
  }

  for (var itemKey in itemLocationDebug.byItem) {
    if (!Object.prototype.hasOwnProperty.call(itemLocationDebug.byItem, itemKey)) continue;
    var records = Array.isArray(itemLocationDebug.byItem[itemKey]) ? itemLocationDebug.byItem[itemKey] : [];
    for (var i = 0; i < records.length; i += 1) {
      var record = records[i];
      if (!matcher(record)) continue;
      var itemName = itemNamesByKey[itemKey] || record.itemName || itemKey;
      rows.push({
        itemKey: itemKey,
        itemName: itemName,
        quantity: Number(record.quantity || 0) || 1,
        locationRaw: record.locationRaw || record.locationName || "Unknown location",
        headerID: Number.isFinite(record.headerID) ? record.headerID : null,
        eventFileID: record.eventFileID != null ? String(record.eventFileID) : "",
        scriptFileID: Number.isFinite(record.scriptFileID) ? record.scriptFileID : null,
        scriptNumber: Number.isFinite(record.scriptNumber) ? record.scriptNumber : null,
        source: record.source || "",
        owSpriteID: Number.isFinite(record.owSpriteID) ? record.owSpriteID : null,
        orientation: Number.isFinite(record.orientation) ? record.orientation : 0,
        hiddenItemFlag: Number.isFinite(record.hiddenItemFlag) ? record.hiddenItemFlag : null,
        hiddenItemRange: Number.isFinite(record.hiddenItemRange) ? record.hiddenItemRange : null,
        hiddenItemScriptIndex: Number.isFinite(record.hiddenItemScriptIndex) ? record.hiddenItemScriptIndex : null,
        xCoord: Number.isFinite(record.xCoord) ? record.xCoord : null,
        yCoord: Number.isFinite(record.yCoord) ? record.yCoord : null,
        zPosition: Number.isFinite(record.zPosition) ? record.zPosition : null,
      });
    }
  }

  rows.sort(function (a, b) {
    var locationCmp = String(a.locationRaw || "").localeCompare(String(b.locationRaw || ""));
    if (locationCmp) return locationCmp;
    var itemCmp = String(a.itemName || "").localeCompare(String(b.itemName || ""));
    if (itemCmp) return itemCmp;
    var aHeader = a.headerID === null ? Number.POSITIVE_INFINITY : a.headerID;
    var bHeader = b.headerID === null ? Number.POSITIVE_INFINITY : b.headerID;
    if (aHeader !== bHeader) return aHeader - bHeader;
    if (a.xCoord !== b.xCoord) return (a.xCoord === null ? Number.POSITIVE_INFINITY : a.xCoord) - (b.xCoord === null ? Number.POSITIVE_INFINITY : b.xCoord);
    return (a.yCoord === null ? Number.POSITIVE_INFINITY : a.yCoord) - (b.yCoord === null ? Number.POSITIVE_INFINITY : b.yCoord);
  });

  return rows;
}

function buildItemLocationCoordsLabel(row) {
  var values = [];
  if (row.xCoord !== null) values.push("x=" + row.xCoord);
  if (row.yCoord !== null) values.push("y=" + row.yCoord);
  if (row.zPosition !== null) values.push("z=" + row.zPosition);
  return values.length ? values.join(", ") : "N/A";
}

function buildItemLocationArticleIntro(sourceGen, missingMessage) {
  if (sourceGen !== 4) {
    return (
      '<div class="ddex-hidden-items">' +
        "<p>Load a Gen 4 ROM to view resolved item locations.</p>" +
      "</div>"
    );
  }

  var itemLocationDebug = getHiddenItemLocationDebugData();
  if (!itemLocationDebug) {
    return (
      '<div class="ddex-hidden-items">' +
        "<p>" + Dex.escapeHTML(missingMessage) + "</p>" +
      "</div>"
    );
  }

  return null;
}

function renderNpcItemSpriteCell(row) {
  if (row.owSpriteID === null) {
    return '<span class="ddex-underground-item-meta">No sprite resolved</span>';
  }
  return (
    '<div class="npc-row ddex-hidden-item-npc-row">' +
      '<div class="npc-sprite" data-sprite-id="' + Dex.escapeHTML(String(row.owSpriteID)) + '" data-orientation="' + Dex.escapeHTML(String(row.orientation || 0)) + '" ' +
      'style="width:32px;height:32px;background-repeat:no-repeat;image-rendering:pixelated;"></div>' +
      '<span>Sprite ' + Dex.escapeHTML(String(row.owSpriteID)) + "</span>" +
    "</div>"
  );
}

function buildGroundItemsArticleHtml() {
  var sourceGen =
    Number(window.DDEX_ROM_SOURCE_GEN || localStorage.getItem("ddexRomSourceGen") || "0") || null;
  var intro = buildItemLocationArticleIntro(
    sourceGen,
    "Ground item debug data isn't available for the currently loaded ROM. Reimport the ROM after rebuilding if needed."
  );
  if (intro) return intro;

  var rows = getItemLocationRows("ground");
  var buf = '<div class="ddex-hidden-items">';
  buf += "<p>" + Dex.escapeHTML(String(rows.length)) + (rows.length === 1 ? " visible ground item location resolved." : " visible ground item locations resolved.") + "</p>";

  if (!rows.length) {
    buf += "<p>No visible ground items were resolved for this ROM.</p>";
    buf += "</div>";
    return buf;
  }

  buf += '<table class="ddex-underground-table ddex-hidden-items-table">';
  buf += "<thead><tr>";
  buf += "<th>Item</th>";
  buf += "<th>Resolved Location</th>";
  buf += "<th>Script</th>";
  buf += "<th>Header</th>";
  buf += "<th>Event</th>";
  buf += "<th>Script File</th>";
  buf += "</tr></thead><tbody>";

  for (var i = 0; i < rows.length; i += 1) {
    var row = rows[i];
    buf += "<tr>";
    buf += '<th scope="row"><a href="/items/' + toID(row.itemName) + '" data-target="push">' + Dex.escapeHTML(row.itemName) + "</a>";
    buf += '<span class="ddex-underground-item-meta">Visible pickup</span>';
    buf += "</th>";
    buf += "<td>" + Dex.escapeHTML(String(row.locationRaw || "Unknown location")) + "</td>";
    buf += "<td>" + Dex.escapeHTML(row.scriptNumber === null ? "N/A" : String(row.scriptNumber)) + "</td>";
    buf += "<td>" + Dex.escapeHTML(row.headerID === null ? "N/A" : String(row.headerID)) + "</td>";
    buf += "<td>" + Dex.escapeHTML(row.eventFileID || "N/A") + "</td>";
    buf += "<td>" + Dex.escapeHTML(row.scriptFileID === null ? "N/A" : String(row.scriptFileID)) + "</td>";
    buf += "</tr>";
  }

  buf += "</tbody></table></div>";
  return buf;
}

function buildHiddenItemsArticleHtml() {
  var sourceGen =
    Number(window.DDEX_ROM_SOURCE_GEN || localStorage.getItem("ddexRomSourceGen") || "0") || null;
  var intro = buildItemLocationArticleIntro(
    sourceGen,
    "Hidden item debug data isn't available for the currently loaded ROM. Reimport the ROM after rebuilding if needed."
  );
  if (intro) return intro;

  var itemLocationDebug = getHiddenItemLocationDebugData();
  var rows = getItemLocationRows("hidden");
  var hiddenCount =
    itemLocationDebug.stats && Number.isFinite(itemLocationDebug.stats.hiddenItemCount)
      ? itemLocationDebug.stats.hiddenItemCount
      : rows.length;
  var buf = '<div class="ddex-hidden-items">';
  buf += "<p>";
  buf += Dex.escapeHTML(String(hiddenCount));
  buf += hiddenCount === 1 ? " hidden item location resolved." : " hidden item locations resolved.";
  buf += "</p>";

  if (!rows.length) {
    buf += "<p>No hidden items were resolved for this ROM.</p>";
    buf += "</div>";
    return buf;
  }

  buf += '<table class="ddex-underground-table ddex-hidden-items-table">';
  buf += "<thead><tr>";
  buf += "<th>Item</th>";
  buf += "<th>Resolved Location</th>";
  buf += "<th>Qty</th>";
  buf += "<th>Coords</th>";
  buf += "<th>Header</th>";
  buf += "<th>Event</th>";
  buf += "<th>Flag</th>";
  buf += "</tr></thead><tbody>";

  for (var i = 0; i < rows.length; i += 1) {
    var row = rows[i];
    buf += "<tr>";
    buf += '<th scope="row"><a href="/items/' + toID(row.itemName) + '" data-target="push">' + Dex.escapeHTML(row.itemName) + "</a>";
    if (row.hiddenItemScriptIndex !== null || row.hiddenItemRange !== null) {
      buf += '<span class="ddex-underground-item-meta">';
      if (row.hiddenItemScriptIndex !== null) {
        buf += "Hidden script " + Dex.escapeHTML(String(row.hiddenItemScriptIndex));
      } else {
        buf += "Hidden item";
      }
      if (row.hiddenItemRange !== null) {
        buf += " | range " + Dex.escapeHTML(String(row.hiddenItemRange));
      }
      buf += "</span>";
    }
    buf += "</th>";
    buf += "<td>" + Dex.escapeHTML(String(row.locationRaw || "Unknown location")) + "</td>";
    buf += "<td>" + Dex.escapeHTML(String(row.quantity || 1)) + "</td>";
    buf += "<td>" + Dex.escapeHTML(buildItemLocationCoordsLabel(row)) + "</td>";
    buf += "<td>" + Dex.escapeHTML(row.headerID === null ? "N/A" : String(row.headerID)) + "</td>";
    buf += "<td>" + Dex.escapeHTML(row.eventFileID || "N/A") + "</td>";
    buf += "<td>" + Dex.escapeHTML(row.hiddenItemFlag === null ? "N/A" : String(row.hiddenItemFlag)) + "</td>";
    buf += "</tr>";
  }

  buf += "</tbody></table></div>";
  return buf;
}

function buildNpcItemsArticleHtml() {
  var sourceGen =
    Number(window.DDEX_ROM_SOURCE_GEN || localStorage.getItem("ddexRomSourceGen") || "0") || null;
  var intro = buildItemLocationArticleIntro(
    sourceGen,
    "NPC item debug data isn't available for the currently loaded ROM. Reimport the ROM after rebuilding if needed."
  );
  if (intro) return intro;

  var rows = getItemLocationRows("npc");
  var buf = '<div class="ddex-hidden-items">';
  buf += "<p>" + Dex.escapeHTML(String(rows.length)) + (rows.length === 1 ? " NPC item location resolved." : " NPC item locations resolved.") + "</p>";

  if (!rows.length) {
    buf += "<p>No NPC item gifts were resolved for this ROM.</p>";
    buf += "</div>";
    return buf;
  }

  buf += '<table class="ddex-underground-table ddex-hidden-items-table">';
  buf += "<thead><tr>";
  buf += "<th>Item</th>";
  buf += "<th>NPC</th>";
  buf += "<th>Resolved Location</th>";
  buf += "<th>Grant Path</th>";
  buf += "<th>Script</th>";
  buf += "<th>Header</th>";
  buf += "</tr></thead><tbody>";

  for (var i = 0; i < rows.length; i += 1) {
    var row = rows[i];
    buf += "<tr>";
    buf += '<th scope="row"><a href="/items/' + toID(row.itemName) + '" data-target="push">' + Dex.escapeHTML(row.itemName) + "</a>";
    if (row.scriptNumber !== null) {
      buf += '<span class="ddex-underground-item-meta">Script ' + Dex.escapeHTML(String(row.scriptNumber)) + "</span>";
    }
    buf += "</th>";
    buf += "<td>" + renderNpcItemSpriteCell(row) + "</td>";
    buf += "<td>" + Dex.escapeHTML(String(row.locationRaw || "Unknown location")) + "</td>";
    buf += "<td>" + Dex.escapeHTML(row.source || "script_parse") + "</td>";
    buf += "<td>" + Dex.escapeHTML(row.scriptFileID === null ? "N/A" : String(row.scriptFileID)) + ":" + Dex.escapeHTML(row.scriptNumber === null ? "N/A" : String(row.scriptNumber)) + "</td>";
    buf += "<td>" + Dex.escapeHTML(row.headerID === null ? "N/A" : String(row.headerID)) + "</td>";
    buf += "</tr>";
  }

  buf += "</tbody></table></div>";
  return buf;
}
