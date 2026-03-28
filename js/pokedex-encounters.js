window.DDEX_LOCATION_MAP_SETS = window.DDEX_LOCATION_MAP_SETS || {};
window.DDEX_LOCATION_MAP_LOADS = window.DDEX_LOCATION_MAP_LOADS || {};

function getCurrentMapSetCandidates() {
  var seen = {};
  var candidates = [];

  function add(value) {
    value = String(value || "").trim();
    if (!value || seen[value]) return;
    seen[value] = true;
    candidates.push(value);
  }

  var params = new URLSearchParams(window.location.search || "");
  add(params.get("game"));
  add(localStorage.game);

  var documentTitle = String(document.title || "")
    .replace(/\s+Dex\s*$/i, "")
    .trim();
  if (documentTitle && documentTitle !== "Dynamic") add(documentTitle);

  add(localStorage.gameTitle);
  add(localStorage.romTitle);

  if (window.DDEX_ROM_OVERRIDES && window.DDEX_ROM_OVERRIDES.title) {
    add(window.DDEX_ROM_OVERRIDES.title);
  }

  return candidates;
}

function withDexBase(path) {
  if (window.DDEXPaths && typeof window.DDEXPaths.withBase === "function") {
    return window.DDEXPaths.withBase(path);
  }
  return path;
}

function normalizeLocationMapSet(title, rawSet) {
  if (!rawSet || typeof rawSet !== "object") return null;
  var counts = rawSet.counts || rawSet.mapCounts || rawSet;
  if (!counts || typeof counts !== "object") return null;

  return {
    title: rawSet.title || title,
    imageBasePath:
      rawSet.imageBasePath || `/img/${cleanString(title)}maps`,
    counts: counts,
  };
}

function getRegisteredLocationMapSet(title) {
  if (!title) return null;

  var exactSet = normalizeLocationMapSet(title, window.DDEX_LOCATION_MAP_SETS[title]);
  if (exactSet) return exactSet;

  var titleId = cleanString(title);
  for (var key in window.DDEX_LOCATION_MAP_SETS) {
    if (cleanString(key) !== titleId) continue;
    return normalizeLocationMapSet(title, window.DDEX_LOCATION_MAP_SETS[key]);
  }

  return null;
}

function resolveLocationMapKey(mapSet, locationId, locationName) {
  if (!mapSet || !mapSet.counts) return "";

  var candidates = [];
  var seen = {};
  function add(value) {
    value = cleanString(value);
    if (!value || seen[value]) return;
    seen[value] = true;
    candidates.push(value);
  }

  add(locationId);
  add(locationName);
  add(String(locationId || "").replace(/\d+$/, ""));
  add(String(locationName || "").replace(/\d+$/, ""));

  for (var i = 0; i < candidates.length; i++) {
    if (mapSet.counts[candidates[i]]) return candidates[i];
  }

  return "";
}

async function ensureLocationMapSet() {
  var titles = getCurrentMapSetCandidates();
  for (var i = 0; i < titles.length; i++) {
    var existingSet = getRegisteredLocationMapSet(titles[i]);
    if (existingSet) {
      window.DDEX_LOCATION_MAP_SETS[titles[i]] = existingSet;
      return existingSet;
    }
  }

  var loader =
    window.DDEX_OVERRIDES_API &&
    window.DDEX_OVERRIDES_API.checkAndLoadScript;
  if (typeof loader !== "function") return null;

  function loadLocationMapSetById(titleId) {
    return loader(`/data/${titleId}_location_map_counts.js`, {
      onLoad: function () {
        if (window.mapCounts) {
          window.DDEX_LOCATION_MAP_SETS[titleId] = normalizeLocationMapSet(
            titleId,
            {
              title: titleId,
              counts: window.mapCounts,
            },
          );
        }
      },
    }).then(function (loaded) {
      if (!loaded) return null;
      for (var k = 0; k < titles.length; k++) {
        var loadedSet = getRegisteredLocationMapSet(titles[k]);
        if (loadedSet) return loadedSet;
      }
      return getRegisteredLocationMapSet(titleId);
    });
  }

  for (var j = 0; j < titles.length; j++) {
    var title = titles[j];
    var titleId = cleanString(title);
    if (!titleId) continue;

    if (!window.DDEX_LOCATION_MAP_LOADS[titleId]) {
      window.DDEX_LOCATION_MAP_LOADS[titleId] = loadLocationMapSetById(titleId);
    }

    var loadedSet = await window.DDEX_LOCATION_MAP_LOADS[titleId];
    if (loadedSet) return loadedSet;
  }

  return null;
}

var trappingAbilities = ["shadowtag", "arenatrap", "magnetpull"];
var DDEX_PENDING_POKEMON_LEVEL_KEY = "ddexPendingPokemonLevel";
var teleportingMoves = ["teleport"];
var roaringMoves = ["whirlwind", "roar"];
var selfKoMoves = ["selfdestruct", "explosion", "memento"];
var recoilMoves = ["doubleedge", "hyperbeam", "takedown", "thrash", "skyattack", "outrage", "overheat", "volttackle", "blastburn", "eruption", "hydrocannon", "superpower", "waterspout", "bravebird", "flareblitz", "headsmash", "woodhammer", "dracometeor", "roaroftime", "closecombat", "gigaimpact", "wildcharge", "solidplant"];
var trappingMoves = ["wrap", "submission", "firespin", "meanlook", "twister", "whirlpool", "swallow", "sandtomb", "block"];

var encounterWarningAbilities = Object.create(null);
var encounterWarningMoves = Object.create(null);

for (var trappingAbilityIndex = 0; trappingAbilityIndex < trappingAbilities.length; trappingAbilityIndex++) {
  encounterWarningAbilities[trappingAbilities[trappingAbilityIndex]] = true;
}

var encounterMoveWarnings = [
  teleportingMoves,
  roaringMoves,
  selfKoMoves,
  recoilMoves,
  trappingMoves,
];
for (var warningListIndex = 0; warningListIndex < encounterMoveWarnings.length; warningListIndex++) {
  var warningList = encounterMoveWarnings[warningListIndex];
  for (var warningMoveIndex = 0; warningMoveIndex < warningList.length; warningMoveIndex++) {
    encounterWarningMoves[warningList[warningMoveIndex]] = true;
  }
}

function getEncounterPreviewLevel(minLevel, maxLevel) {
  if (Number.isFinite(minLevel) && minLevel > 0) return minLevel;
  if (Number.isFinite(maxLevel) && maxLevel > 0) return maxLevel;
  return 0;
}

function getEncounterPreviewMoves(pokemon, level) {
  if (!pokemon || !level || level < 1) return [];
  if (
    typeof getMergedLearnsetForPokemon !== "function" ||
    typeof getMostRecentGenForPokemon !== "function" ||
    typeof getLevelUpLevelFromSource !== "function"
  ) {
    return [];
  }

  var learnset = getMergedLearnsetForPokemon(pokemon);
  var currentGen = getMostRecentGenForPokemon(pokemon);
  var learnedMoves = [];
  var learnOrder = 0;

  for (var moveid in learnset) {
    var sources = learnset[moveid];
    if (typeof sources === "string") sources = [sources];
    var learnedLevel = null;

    for (var sourceIndex = 0; sourceIndex < sources.length; sourceIndex++) {
      var sourceLevel = getLevelUpLevelFromSource(sources[sourceIndex], currentGen);
      if (sourceLevel === null || Number.isNaN(sourceLevel) || sourceLevel > level) {
        continue;
      }
      if (learnedLevel === null || sourceLevel < learnedLevel) {
        learnedLevel = sourceLevel;
      }
    }

    if (learnedLevel === null) continue;
    if (!BattleMovedex[moveid]) continue;

    learnedMoves.push({
      id: moveid,
      name: BattleMovedex[moveid].name,
      level: learnedLevel,
      order: learnOrder++,
    });
  }

  learnedMoves.sort(function (moveA, moveB) {
    if (moveA.level !== moveB.level) return moveA.level - moveB.level;
    if (moveA.order !== moveB.order) return moveA.order - moveB.order;
    return 0;
  });

  if (learnedMoves.length <= 4) return learnedMoves;
  return learnedMoves.slice(learnedMoves.length - 4);
}

var PokedexEncountersPanel = PokedexResultPanel.extend({
  events: {
    "click .result a[data-initial-level]": "storePendingPokemonLevel",
  },
  initialize: function (id) {
    id = toID(id);
    var location = BattleLocationdex[id];
    this.id = id;
    this.shortTitle = location.name;

    var buf = '<div class="pfx-body dexentry">';

    buf +=
      '<a href="/" class="pfx-backbutton" data-target="back"><i class="fa fa-chevron-left"></i> Pok&eacute;dex</a>';
    buf +=
      '<h1><a href="/encounters/' +
      id +
      '" data-target="push" class="subtle">' +
      location.name +
      "</a></h1>";
    buf += '<section class="nuzlocke-summary" hidden></section>';

    // distribution
    buf += '<ul class="utilichart metricchart nokbd encounterchart">';
    buf += "</ul>";
    buf += '<section class="location-map-gallery" hidden></section>';

    buf += "</div>";

    this.html(buf);
    this.renderNuzlockeSummary();

    if (
      window.DDEX_NUZLOCKE_BOX &&
      typeof window.DDEX_NUZLOCKE_BOX.subscribe === "function"
    ) {
      this.handleNuzlockeUpdate = function () {
        this.renderNuzlockeSummary();
        if (!this.$chart || !this.$chart.length) return;
        if (this.streamLoading) {
          this.renderUpdateDistribution(true);
        } else {
          this.renderDistribution();
        }
      }.bind(this);
      window.DDEX_NUZLOCKE_BOX.subscribe(this.handleNuzlockeUpdate);
    }

    setTimeout(
      function () {
        this.renderDistribution();
        this.renderLocationMaps();
      }.bind(this),
    );
  },
  storePendingPokemonLevel: function (e) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var target = e.currentTarget;
    var level = Number(target && target.getAttribute("data-initial-level"));
    var href = target && target.getAttribute("href");
    var match = href && href.match(/\/pokemon\/([^/?#]+)/);
    var speciesId = match ? toID(match[1]) : "";
    if (!speciesId || !Number.isFinite(level) || level <= 0) return;
    try {
      sessionStorage.setItem(
        DDEX_PENDING_POKEMON_LEVEL_KEY,
        JSON.stringify({
          speciesId: speciesId,
          level: Math.floor(level),
          sourceLocation: this.id,
          createdAt: Date.now(),
        }),
      );
    } catch (err) {
      console.warn("Failed to store pending pokemon level", err);
    }
  },
  remove: function () {
    if (
      this.handleNuzlockeUpdate &&
      window.DDEX_NUZLOCKE_BOX &&
      typeof window.DDEX_NUZLOCKE_BOX.unsubscribe === "function"
    ) {
      window.DDEX_NUZLOCKE_BOX.unsubscribe(this.handleNuzlockeUpdate);
    }
    if (this.handleScrollBound) {
      this.$el.off("scroll", this.handleScrollBound);
    }
    PokedexResultPanel.prototype.remove.apply(this, arguments);
  },
  getNuzlockeSourceLabel: function (source) {
    if (source === "live") return "live";
    if (source === "cache") return "cached";
    return "";
  },
  renderNuzlockeSpriteStrip: function (speciesIds) {
    var buf = '<span class="nuzlocke-sprite-strip" aria-hidden="true">';
    for (var i = 0; i < speciesIds.length; i++) {
      var speciesTemplate = Dex.species.get(speciesIds[i]);
      if (!speciesTemplate || !speciesTemplate.exists) continue;
      buf +=
        '<span class="picon nuzlocke-picon" style="' +
        Dex.getPokemonIcon(speciesTemplate.name) +
        '"></span>';
    }
    buf += "</span>";
    return buf;
  },
  renderNuzlockeSummary: function () {
    var $summary = this.$(".nuzlocke-summary");
    if (!$summary.length) return;

    var nuzlockeService = window.DDEX_NUZLOCKE_BOX;
    var state =
      nuzlockeService && typeof nuzlockeService.getState === "function"
        ? nuzlockeService.getState()
        : null;

    if (!state || !state.hasData) {
      $summary.prop("hidden", true).empty().removeClass("live cache nuzlocke-summary-hit");
      return;
    }

    var summary =
      typeof nuzlockeService.getLocationSummary === "function"
        ? nuzlockeService.getLocationSummary(this.id)
        : { hasCaughtHere: false, speciesIds: [], source: state.source };
    var summaryClass = "nuzlocke-summary " + summary.source;
    var sourceLabel = this.getNuzlockeSourceLabel(summary.source);
    var buf = "";

    if (summary.hasCaughtHere) {
      summaryClass += " nuzlocke-summary-hit";
      var speciesNames = [];
      for (var i = 0; i < summary.speciesIds.length; i++) {
        var speciesTemplate = Dex.species.get(summary.speciesIds[i]);
        if (!speciesTemplate || !speciesTemplate.exists) continue;
        speciesNames.push(speciesTemplate.name);
      }
      buf += "<strong>Caught:</strong> ";
      buf += this.renderNuzlockeSpriteStrip(summary.speciesIds);
      if (speciesNames.length) {
        buf +=
          '<span class="nuzlocke-summary-species">' +
          Dex.escapeHTML(speciesNames.join(", ")) +
          "</span>";
      }
    } else {
      buf += "<strong>No recorded encounter from this location.</strong>";
      if (sourceLabel) {
        buf +=
          '<span class="nuzlocke-summary-source">(' +
          Dex.escapeHTML(sourceLabel) +
          ")</span>";
      }
    }

    $summary
      .html(buf)
      .prop("hidden", false)
      .attr("class", summaryClass);
  },
  getResultRowClassName: function (result) {
    var className = "result";
    if (!result || result.kind !== "encounter") return className;

    var nuzlockeService = window.DDEX_NUZLOCKE_BOX;
    if (
      !nuzlockeService ||
      typeof nuzlockeService.getEncounterRowState !== "function"
    ) {
      return className;
    }

    var rowState = nuzlockeService.getEncounterRowState(this.id, result.monId);
    if (rowState.caughtHere) {
      className += " nuzlocke-caught-here";
    } else if (rowState.ownedElsewhere) {
      className += " nuzlocke-owned-elsewhere";
    }

    return className;
  },
  renderResultListItem: function (i, offscreen) {
    return (
      '<li class="' +
      this.getResultRowClassName(this.results[i]) +
      '">' +
      this.renderRow(i, offscreen) +
      "</li>"
    );
  },
  updateResultListItem: function (rowElement, i) {
    rowElement.className = this.getResultRowClassName(this.results[i]);
    rowElement.innerHTML = this.renderRow(i);
  },
  getDistribution: function () {
    if (this.results) return this.results;

    var location = this.id;
    var results = [];

    var formatRate = function (i) {
      if (i === undefined || i === null || Number.isNaN(i)) return "    ";
      return i.toString().padStart(2, "z") + "% ";
    };

    for (const encType of encTypes) {
      const encounterGroup = BattleLocationdex[location][encType];
      if (!encounterGroup || encounterGroup.encs === undefined) continue;

      let hasRows = false;
      const rates = getEncounterRateSlots(BattleLocationdex[location], encType);
      for (let i = 0; i < encounterGroup.encs.length; i++) {
        const enc = encounterGroup.encs[i];
        if (!enc || !enc.s || enc.s === "-----") continue;
        const monId = cleanString(enc.s);
        if (!monId) continue;
        if (!hasRows) {
          results.push({
            kind: "header",
            encType: encType,
          });
          hasRows = true;
        }
        results.push({
          kind: "encounter",
          encType: encType,
          monId: monId,
          rate: formatRate(rates[i]),
          min: enc.mn || 0,
          max: enc.mx || enc.mn || 0,
        });
      }
    }

    return (this.results = results);
  },
  renderDistribution: function () {
    var results = this.getDistribution();
    this.$chart = this.$(".utilichart");

    if (results.length > 1600 / 33) {
      if (!this.streamLoading) {
        this.streamLoading = true;
        this.handleScrollBound = this.handleScroll.bind(this);
        this.$el.on("scroll", this.handleScrollBound);
      }

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
        buf += this.renderResultListItem(i, i < start || i > end);
      }
      this.$chart.html(buf);
    } else {
      this.streamLoading = false;
      var buf = "";
      for (var i = 0, len = results.length; i < len; i++) {
        buf += this.renderResultListItem(i);
      }
      this.$chart.html(buf);
    }
  },
  renderLocationMaps: async function () {
    var $gallery = this.$(".location-map-gallery");
    if (!$gallery.length) return;

    var mapSet = await ensureLocationMapSet();
    var location = BattleLocationdex[this.id];
    var locationName = location && location.name ? location.name : this.id;
    if (!mapSet) {
      console.warn("No location map set found for current game", {
        candidates: getCurrentMapSetCandidates(),
        location: this.id,
      });
      $gallery.prop("hidden", true).empty();
      return;
    }
    var mapKey = resolveLocationMapKey(mapSet, this.id, locationName);
    var mapCount =
      mapSet && mapSet.counts && mapKey
        ? parseInt(mapSet.counts[mapKey], 10)
        : 0;

    if (!mapCount) {
      console.warn("No location maps found for encounter location", {
        locationId: this.id,
        locationName: locationName,
        mapTitle: mapSet.title,
      });
      $gallery.prop("hidden", true).empty();
      return;
    }

    var buf = '<h2>Location Maps</h2><div class="location-map-list">';

    for (var i = 0; i < mapCount; i++) {
      var src = withDexBase(`${mapSet.imageBasePath}/${mapKey}${i}.png`);
      var alt =
        Dex.escapeHTML(locationName) +
        " map " +
        Dex.escapeHTML(String(i + 1));
      buf +=
        '<figure class="location-map">' +
        `<img src="${src}" alt="${alt}" loading="lazy" />` +
        "</figure>";
    }

    buf += "</div>";
    $gallery.html(buf).prop("hidden", false);
  },
  renderRow: function (i, offscreen) {
    var result = this.results[i];
    if (result.kind === "header") {
      const encounterGroup = BattleLocationdex[this.id][result.encType];
      if (encounterGroup && encounterGroup.name) {
        return `<h3>${snakeToTitleCase(result.encType)}:  ${encounterGroup.name}</h3>`;
      }
      return `<h3>${snakeToTitleCase(result.encType)}</h3>`;
    }

    var id = result.monId;
    var template = id ? BattlePokedex[id] : undefined;
    var isEmptyEncounter = id === "none" || (template && template.name === "None");
    if (!template) {
      return "";
    } else if (offscreen) {
      return (
        "" +
        template.name +
        " " +
        template.abilities["0"] +
        " " +
        (template.abilities["1"] || "") +
        " " +
        (template.abilities["H"] || "") +
        ""
      );
    } else {
      var rateTag = result.rate.trim().replaceAll("z", "");
      var minLevel = result.min;
      var maxLevel = result.max;
      var encounterLevel = getEncounterPreviewLevel(minLevel, maxLevel);
      var desc = rateTag || "";
      var levelValue = "";
      if (encounterLevel > 0) {
        levelValue = "Lv " + encounterLevel;
      }
      var levelClass = "col levelcol";
      if (isEmptyEncounter) {
        return (
          '<span class="col tagcol shorttagcol">' +
          desc +
          '</span> <span class="' +
          levelClass +
          '">' +
          levelValue +
          "</span>"
        );
      }
      var previewTemplate = Dex.species.get(id);
      if (!previewTemplate || !previewTemplate.exists) {
        previewTemplate = template;
      }
      var row = BattleSearch.renderTaggedLocationRowInner(template, desc, null, {
        level: encounterLevel,
        moves: getEncounterPreviewMoves(previewTemplate, encounterLevel),
        warningAbilities: encounterWarningAbilities,
        warningMoves: encounterWarningMoves,
      });
      if (row.indexOf('class="col tagcol') !== -1) {
        row = row.replace(
          /(<span class="col tagcol[^>]*>[^<]*<\/span>)/,
          `$1 <span class="${levelClass}">${levelValue}</span> `,
        );
      }
      return row;
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
        buf += this.renderResultListItem(i, i < start || i > end);
      }
      this.$chart.html(buf);
      (this.start = start), (this.end = end);
      return;
    }

    if (start < this.start) {
      for (var i = start; i < this.start; i++) {
        this.updateResultListItem($rows[i], i);
      }
      this.start = start;
    }

    if (end > this.end) {
      for (var i = this.end + 1; i <= end; i++) {
        this.updateResultListItem($rows[i], i);
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
