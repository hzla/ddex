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

function isTimeEncounterType(encType) {
  return String(encType || "").toLowerCase().indexOf("time") === 0;
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

function getEncounterRangeValue(value) {
  value = Number(value);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function getEncounterRange(encounter) {
  if (!encounter) {
    return { min: 0, max: 0 };
  }
  return {
    min: getEncounterRangeValue(encounter.mn || encounter.minLvl || 0),
    max: getEncounterRangeValue(
      encounter.mx || encounter.maxLvl || encounter.mn || encounter.minLvl || 0,
    ),
  };
}

function getGrassOverlayLevelRanges(locationRecord, overlaySlotCount) {
  if (!locationRecord || overlaySlotCount <= 0) return [];

  var grassGroup = locationRecord.grass;
  if (!grassGroup || !Array.isArray(grassGroup.encs)) return [];

  var grassRates =
    typeof getEncounterRateSlots === "function"
      ? getEncounterRateSlots(locationRecord, "grass")
      : [];
  var ranges = [];

  for (var i = 0; i < grassGroup.encs.length; i++) {
    if ((Number(grassRates[i]) || 0) !== 10) continue;
    var encounter = grassGroup.encs[i];
    if (!encounter || !encounter.s || encounter.s === "-----") continue;
    ranges.push(getEncounterRange(encounter));
    if (ranges.length >= overlaySlotCount) break;
  }

  return ranges;
}

function getResolvedEncounterRange(encounter, fallbackRange) {
  var range = getEncounterRange(encounter);
  if (range.min > 0 || range.max > 0) return range;
  if (!fallbackRange) return range;
  return {
    min: getEncounterRangeValue(fallbackRange.min),
    max: getEncounterRangeValue(fallbackRange.max),
  };
}

function isEmptyEncounterSpecies(monId) {
  if (!monId || monId === "none") return true;
  var template = BattlePokedex[monId];
  return !!(template && template.name === "None");
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
  applyDetailLayout: function () {
    if (window.DDEX_DETAIL_LAYOUT) {
      window.DDEX_DETAIL_LAYOUT.applyEncounterLayout(this);
    }
  },
  events: {
    "click .result a[data-initial-level]": "storePendingPokemonLevel",
    "click .ddex-encounter-tabbar button": "selectEncounterTab",
    "click .ddex-nuzlocke-missed-toggle": "toggleMissedLocation",
    "click .ddex-encounter-caught-toggle": "toggleEncounterCaught",
  },
  initialize: function (id) {
    id = toID(id);
    var location = BattleLocationdex[id];
    this.id = id;
    this.shortTitle = location.name;
    this.activeTab = "encounters";
    this.mapsLoaded = false;

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
    buf +=
      '<ul class="tabbar ddex-encounter-tabbar"><li><button class="button nav-first cur" value="encounters">Encounters</button></li><li><button class="button nav-last" value="maps">Location Maps</button></li></ul>';

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
        this.renderEncounterTabState();
      }.bind(this),
    );
  },
  selectEncounterTab: function (e) {
    e.preventDefault();
    e.stopPropagation();
    var value = $(e.currentTarget).val() || "encounters";
    if (value !== "encounters" && value !== "maps") return;
    this.activeTab = value;
    this.renderEncounterTabState();
  },
  renderEncounterTabState: function () {
    var activeTab = this.activeTab || "encounters";
    this.$(".ddex-encounter-tabbar button").removeClass("cur");
    this.$('.ddex-encounter-tabbar button[value="' + activeTab + '"]').addClass("cur");

    var showMaps = activeTab === "maps";
    var $primarySections = this.$(".ddex-encounter-sections-primary");
    var $secondarySections = this.$(".ddex-encounter-sections-secondary");
    var $gallery = this.$(".location-map-gallery");

    $primarySections.prop("hidden", showMaps);
    $secondarySections.prop("hidden", showMaps);
    $gallery.prop("hidden", !showMaps);

    if (showMaps && !this.mapsLoaded) {
      this.mapsLoaded = true;
      $gallery.html("<p>Loading location maps...</p>").prop("hidden", false);
      this.renderLocationMaps();
    }
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
  renderNuzlockeSpriteStrip: function (speciesEntries) {
    var buf = '<span class="nuzlocke-sprite-strip" aria-hidden="true">';
    for (var i = 0; i < speciesEntries.length; i++) {
      var speciesEntry = speciesEntries[i] || {};
      var speciesTemplate = Dex.species.get(speciesEntry.speciesId || speciesEntry);
      if (!speciesTemplate || !speciesTemplate.exists) continue;
      buf +=
        '<span class="picon nuzlocke-picon' +
        (speciesEntry.dead ? " nuzlocke-picon-dead" : "") +
        '" style="' +
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

    var summary =
      nuzlockeService && typeof nuzlockeService.getLocationSummary === "function"
        ? nuzlockeService.getLocationSummary(this.id)
        : {
            hasCaughtHere: false,
            speciesIds: [],
            isMissed: false,
            canMarkMissed: false,
            source: state && state.source ? state.source : "none",
          };

    if (!summary.hasCaughtHere && !summary.isMissed && (!state || !state.hasData)) {
      $summary
        .prop("hidden", true)
        .empty()
        .removeClass("live cache nuzlocke-summary-hit nuzlocke-summary-missed");
      return;
    }

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
      buf += this.renderNuzlockeSpriteStrip(summary.speciesEntries || summary.speciesIds);
      if (speciesNames.length) {
        buf +=
          '<span class="nuzlocke-summary-species">' +
          Dex.escapeHTML(speciesNames.join(", ")) +
          "</span>";
      }
    } else if (summary.isMissed) {
      summaryClass += " nuzlocke-summary-missed";
      buf += "<strong>Encounter missed</strong>";
    } else {
      buf += "<strong>No recorded encounter from this location.</strong>";
    }

    if (!summary.hasCaughtHere && sourceLabel) {
      buf +=
        '<span class="nuzlocke-summary-source">(' +
        Dex.escapeHTML(sourceLabel) +
        ")</span>";
    }

    if (summary.canMarkMissed || summary.isMissed) {
      buf +=
        '<button type="button" class="button ddex-nuzlocke-missed-toggle' +
        (summary.isMissed ? " active" : "") +
        '" data-location-id="' +
        Dex.escapeHTML(this.id) +
        '" aria-pressed="' +
        (summary.isMissed ? "true" : "false") +
        '">' +
        (summary.isMissed ? "Undo missed" : "Mark missed") +
        "</button>";
    }

    $summary
      .html(buf)
      .prop("hidden", false)
      .attr("class", summaryClass);
  },
  toggleMissedLocation: function (e) {
    e.preventDefault();
    e.stopPropagation();
    if (
      window.DDEX_NUZLOCKE_BOX &&
      typeof window.DDEX_NUZLOCKE_BOX.toggleLocationMissed === "function"
    ) {
      window.DDEX_NUZLOCKE_BOX.toggleLocationMissed(this.id);
    }
  },
  toggleEncounterCaught: function (e) {
    e.preventDefault();
    e.stopPropagation();
    var button = e.currentTarget;
    if (!button || button.getAttribute("data-disabled") === "true") {
      return;
    }
    if (
      window.DDEX_NUZLOCKE_BOX &&
      typeof window.DDEX_NUZLOCKE_BOX.toggleEncounterCaught === "function"
    ) {
      window.DDEX_NUZLOCKE_BOX.toggleEncounterCaught(
        button.getAttribute("data-location-id") || this.id,
        button.getAttribute("data-species-id") || "",
      );
    }
  },
  getResultRowClassName: function (result) {
    var className = "result";
    if (!result || result.kind !== "encounter") return className;
    className += " ddex-encounter-result-with-toggle";

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
  getEncounterCaughtToggleState: function (result) {
    var defaultState = {
      disabled: false,
      manualCaughtHere: false,
      title: "Mark caught here",
    };
    if (!result || result.kind !== "encounter" || isEmptyEncounterSpecies(result.monId)) {
      return defaultState;
    }

    var nuzlockeService = window.DDEX_NUZLOCKE_BOX;
    if (
      !nuzlockeService ||
      typeof nuzlockeService.getEncounterRowState !== "function"
    ) {
      return defaultState;
    }

    var rowState = nuzlockeService.getEncounterRowState(this.id, result.monId);
    if (rowState.manualCaughtHere) {
      return {
        disabled: false,
        manualCaughtHere: true,
        title: "Remove manual caught mark",
      };
    }
    if (rowState.liveCaughtHere) {
      return {
        disabled: true,
        manualCaughtHere: false,
        title: "Already tracked as caught",
      };
    }
    return defaultState;
  },
  renderEncounterCaughtToggle: function (result) {
    if (!result || result.kind !== "encounter" || isEmptyEncounterSpecies(result.monId)) {
      return "";
    }

    var toggleState = this.getEncounterCaughtToggleState(result);
    var className = "ddex-encounter-caught-toggle";
    if (toggleState.manualCaughtHere) {
      className += " active";
    }
    if (toggleState.disabled) {
      className += " disabled";
    }

    return (
      '<button type="button" class="' +
      className +
      '" data-location-id="' +
      Dex.escapeHTML(this.id) +
      '" data-species-id="' +
      Dex.escapeHTML(result.monId) +
      '" aria-pressed="' +
      (toggleState.manualCaughtHere ? "true" : "false") +
      '" aria-label="' +
      Dex.escapeHTML(toggleState.title) +
      '" title="' +
      Dex.escapeHTML(toggleState.title) +
      '"' +
      (toggleState.disabled ? ' data-disabled="true" aria-disabled="true"' : "") +
      '><img src="' +
      Dex.escapeHTML(withDexBase("/img/ball.png")) +
      '" alt="" aria-hidden="true" /></button>'
    );
  },
  renderResultListItemContent: function (i, offscreen) {
    var row = this.renderRow(i, offscreen);
    if (!row) return row;

    var result = this.results[i];
    if (!result || result.kind !== "encounter") {
      return row;
    }

    return row + this.renderEncounterCaughtToggle(result);
  },
  renderResultListItem: function (i, offscreen) {
    return (
      '<li class="' +
      this.getResultRowClassName(this.results[i]) +
      '">' +
      this.renderResultListItemContent(i, offscreen) +
      "</li>"
    );
  },
  updateResultListItem: function (rowElement, i) {
    rowElement.className = this.getResultRowClassName(this.results[i]);
    rowElement.innerHTML = this.renderResultListItemContent(i);
  },
  getDistribution: function () {
    if (this.results) return this.results;

    var location = this.id;
    var locationRecord = BattleLocationdex[location];
    var results = [];
    var timeOverlaySlotIndexes = Object.create(null);
    var timeOverlayRanges = Object.create(null);

    var formatRate = function (i) {
      if (i === undefined || i === null || Number.isNaN(i)) return "    ";
      return i.toString().padStart(2, "z") + "% ";
    };

    for (const encType of encTypes) {
      const encounterGroup = locationRecord[encType];
      if (!encounterGroup || encounterGroup.encs === undefined) continue;

      if (isTimeEncounterType(encType) && !timeOverlayRanges[encType]) {
        timeOverlayRanges[encType] = getGrassOverlayLevelRanges(
          locationRecord,
          encounterGroup.encs.length,
        );
        timeOverlaySlotIndexes[encType] = 0;
      }

      let hasRows = false;
      const rates = getEncounterRateSlots(locationRecord, encType);
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
        const overlayIndex = timeOverlaySlotIndexes[encType] || 0;
        const fallbackRange = isTimeEncounterType(encType)
          ? timeOverlayRanges[encType][overlayIndex]
          : null;
        const levelRange = getResolvedEncounterRange(enc, fallbackRange);
        if (isTimeEncounterType(encType)) {
          timeOverlaySlotIndexes[encType] = overlayIndex + 1;
        }
        results.push({
          kind: "encounter",
          encType: encType,
          monId: monId,
          rate: formatRate(rates[i]),
          min: levelRange.min,
          max: levelRange.max,
        });
      }
    }

    return (this.results = results);
  },
  getEncounterSections: function () {
    var results = this.getDistribution();
    var sections = [];
    var currentSection = null;

    for (var i = 0; i < results.length; i++) {
      var result = results[i];
      if (!result) continue;
      if (result.kind === "header") {
        currentSection = {
          headerIndex: i,
          encType: result.encType || "",
          rowIndexes: [],
        };
        sections.push(currentSection);
        continue;
      }
      if (!currentSection) continue;
      if (isEmptyEncounterSpecies(result.monId)) continue;
      currentSection.rowIndexes.push(i);
    }

    return sections.filter(function (section) {
      return section && section.rowIndexes && section.rowIndexes.length;
    });
  },
  shouldRenderEncounterSectionInPrimary: function (section) {
    if (!section) return false;
    if ((section.rowIndexes || []).length > 10) return true;
    return String(section.encType || "").toLowerCase().indexOf("time") >= 0;
  },
  ensureEncounterSectionColumns: function () {
    var $primary = this.$(".ddex-detail-primary");
    var $secondary = this.$(".ddex-detail-secondary");
    if (!$primary.length || !$secondary.length) {
      this.applyDetailLayout();
      $primary = this.$(".ddex-detail-primary");
      $secondary = this.$(".ddex-detail-secondary");
    }

    var gallery = this.$(".location-map-gallery")[0];
    if (gallery && $primary.length && gallery.parentNode !== $primary[0]) {
      $primary[0].appendChild(gallery);
    }

    var primarySections = this.$(".ddex-encounter-sections-primary")[0];
    if (!primarySections && $primary.length) {
      primarySections = document.createElement("div");
      primarySections.className =
        "ddex-encounter-sections ddex-encounter-sections-primary";
      $primary[0].appendChild(primarySections);
    }

    var secondarySections = this.$(".ddex-encounter-sections-secondary")[0];
    if (!secondarySections && $secondary.length) {
      secondarySections = document.createElement("div");
      secondarySections.className =
        "ddex-encounter-sections ddex-encounter-sections-secondary";
      $secondary[0].appendChild(secondarySections);
    }

    var legacyChart = this.$(".ddex-detail-secondary > .utilichart")[0];
    if (legacyChart && legacyChart.parentNode) {
      legacyChart.parentNode.removeChild(legacyChart);
    }

    return {
      primary: primarySections,
      secondary: secondarySections,
    };
  },
  renderEncounterSection: function (section) {
    if (!section || !section.rowIndexes || !section.rowIndexes.length) return "";
    var buf = '<section class="ddex-encounter-table-section">';
    buf += this.renderRow(section.headerIndex);
    buf += '<ul class="utilichart metricchart nokbd encounterchart ddex-encounterchart">';
    for (var i = 0; i < section.rowIndexes.length; i++) {
      buf += this.renderResultListItem(section.rowIndexes[i]);
    }
    buf += "</ul></section>";
    return buf;
  },
  renderDistribution: function () {
    this.streamLoading = false;
    if (this.handleScrollBound) {
      this.$el.off("scroll", this.handleScrollBound);
      this.handleScrollBound = null;
    }
    var columns = this.ensureEncounterSectionColumns();
    if (!columns.primary || !columns.secondary) return;

    var sections = this.getEncounterSections();
    var primaryBuf = "";
    var secondaryBuf = "";
    for (var i = 0; i < sections.length; i++) {
      var sectionBuf = this.renderEncounterSection(sections[i]);
      if (!sectionBuf) continue;
      if (this.shouldRenderEncounterSectionInPrimary(sections[i])) {
        primaryBuf += sectionBuf;
      } else {
        secondaryBuf += sectionBuf;
      }
    }

    columns.primary.innerHTML = primaryBuf;
    columns.secondary.innerHTML = secondaryBuf;
    this.renderEncounterTabState();
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
      this.mapsLoaded = false;
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
      this.mapsLoaded = false;
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
    $gallery.html(buf).prop("hidden", this.activeTab !== "maps");
  },
  renderRow: function (i, offscreen) {
    var result = this.results[i];
    if (result.kind === "header") {
      const encounterGroup = BattleLocationdex[this.id][result.encType];
      var headerClassName = getEncounterHeaderClassName(result.encType);
      if (encounterGroup && encounterGroup.name) {
        return `<h3 class="${headerClassName}">${snakeToTitleCase(result.encType)}:  ${encounterGroup.name}</h3>`;
      }
      return `<h3 class="${headerClassName}">${snakeToTitleCase(result.encType)}</h3>`;
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
    this.renderDistribution();
  },
});
