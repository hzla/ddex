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

function normalizeEncounterSectionLabel(encType, encounterGroup) {
  if (encounterGroup && encounterGroup.name) {
    return String(encounterGroup.name).trim();
  }
  if (!encType) return "";
  if (typeof snakeToTitleCase === "function") {
    return String(snakeToTitleCase(String(encType))).trim();
  }
  return String(encType).trim();
}

function isMiscEncounterSection(encType, encounterGroup) {
  var normalizedType = String(encType || "").trim().toLowerCase();
  var normalizedLabel = normalizeEncounterSectionLabel(encType, encounterGroup)
    .toLowerCase();

  return (
    normalizedType === "swarm" ||
    normalizedType === "radar" ||
    normalizedType.indexOf("dual") === 0 ||
    normalizedLabel === "swarm" ||
    normalizedLabel === "radar" ||
    normalizedLabel.indexOf("dual") === 0
  );
}

function isCurrentEncounterGame(title) {
  var expected = cleanString(title);
  if (!expected) return false;

  var candidates = getCurrentMapSetCandidates();
  for (var i = 0; i < candidates.length; i++) {
    if (cleanString(candidates[i]) === expected) {
      return true;
    }
  }

  return false;
}

function isPlatinumKaizoEncounterGame() {
  return isCurrentEncounterGame("Platinum Kaizo");
}

var DDEX_ENCOUNTER_TIME_MODES = ["morning", "day", "night"];

function normalizeEncounterTimeMode(value) {
  var normalized = String(value || "").toLowerCase();
  if (DDEX_ENCOUNTER_TIME_MODES.indexOf(normalized) >= 0) return normalized;
  return "morning";
}

function getEncounterTimeModeLabel(mode) {
  mode = normalizeEncounterTimeMode(mode);
  if (mode === "day") return "Day";
  if (mode === "night") return "Night";
  return "Morning";
}

function getEncounterOverlayTypeForTimeMode(mode) {
  mode = normalizeEncounterTimeMode(mode);
  if (mode === "day") return "time_day";
  if (mode === "night") return "time_night";
  return "";
}

function getDefaultEncounterRowState() {
  return {
    caughtHere: false,
    liveCaughtHere: false,
    manualCaughtHere: false,
    ownedElsewhere: false,
    familyCaughtHere: false,
    familyOwnedElsewhere: false,
    familyBlocked: false,
    blocked: false,
    blockedReason: "",
  };
}

function getEncounterRowStateForLocation(locationId, speciesId) {
  var nuzlockeService = window.DDEX_NUZLOCKE_BOX;
  if (
    !nuzlockeService ||
    typeof nuzlockeService.getEncounterRowState !== "function"
  ) {
    return getDefaultEncounterRowState();
  }
  return nuzlockeService.getEncounterRowState(locationId, speciesId);
}

function formatEncounterRatePercent(value) {
  value = Number(value);
  if (!Number.isFinite(value) || value <= 0) return "0%";
  if (Math.abs(value - Math.round(value)) < 0.005) {
    return String(Math.round(value)) + "%";
  }
  return value.toFixed(2).replace(/\.?0+$/, "") + "%";
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

function getGrassOverlayReplacementIndexes(locationRecord, overlaySlotCount) {
  var grassRates =
    typeof getEncounterRateSlots === "function"
      ? getEncounterRateSlots(locationRecord, "grass")
      : [];
  var indexes = [];

  for (var i = 0; i < grassRates.length; i++) {
    if ((Number(grassRates[i]) || 0) !== 10) continue;
    indexes.push(i);
    if (indexes.length >= overlaySlotCount) return indexes;
  }

  return indexes;
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
    "click .ddex-encounter-time-button": "selectEncounterTimeMode",
    "click .ddex-nuzlocke-missed-toggle": "toggleMissedLocation",
    "click .ddex-encounter-caught-toggle": "toggleEncounterCaught",
    "change .ddex-misc-encounter-toggle-input": "toggleMiscEncounterTables",
  },
  initialize: function (id) {
    id = toID(id);
    var location = BattleLocationdex[id];
    this.id = id;
    this.shortTitle = location.name;
    this.activeTab = "encounters";
    this.mapsLoaded = false;
    this.timeMode = "morning";
    this.showMiscEncounterTables = false;
    this.hideMiscEncounterTablesPermanently = isPlatinumKaizoEncounterGame();

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
    buf += '<section class="ddex-encounter-controls" hidden></section>';

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
  selectEncounterTimeMode: function (e) {
    e.preventDefault();
    e.stopPropagation();
    var nextMode = normalizeEncounterTimeMode(
      e.currentTarget && e.currentTarget.getAttribute("data-time-mode"),
    );
    if (nextMode === this.timeMode) return;
    this.timeMode = nextMode;
    this.renderDistribution();
  },
  renderEncounterTabState: function () {
    var activeTab = this.activeTab || "encounters";
    this.$(".ddex-encounter-tabbar button").removeClass("cur");
    this.$('.ddex-encounter-tabbar button[value="' + activeTab + '"]').addClass("cur");

    var showMaps = activeTab === "maps";
    var $controls = this.$(".ddex-encounter-controls");
    var $primarySections = this.$(".ddex-encounter-sections-primary");
    var $secondarySections = this.$(".ddex-encounter-sections-secondary");
    var $gallery = this.$(".location-map-gallery");

    $controls.prop(
      "hidden",
      showMaps || $controls.attr("data-has-controls") !== "true",
    );
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
  toggleMiscEncounterTables: function (e) {
    var input = e.currentTarget;
    this.showMiscEncounterTables = !!(input && input.checked);
    this.renderDistribution();
  },
  getResultRowState: function (result) {
    if (!result || result.kind !== "encounter") {
      return getDefaultEncounterRowState();
    }
    if (result.rowState) return result.rowState;
    return getEncounterRowStateForLocation(this.id, result.monId);
  },
  getResultRowClassName: function (result) {
    var className = "result";
    if (!result || result.kind !== "encounter") return className;
    className += " ddex-encounter-result-with-toggle";

    var rowState = this.getResultRowState(result);
    if (rowState.caughtHere) {
      className += " nuzlocke-caught-here";
    } else if (rowState.blocked || rowState.ownedElsewhere) {
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
    var rowState = this.getResultRowState(result);
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
    if (rowState.familyBlocked) {
      return {
        disabled: true,
        manualCaughtHere: false,
        title: "Blocked by a caught family member",
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
  buildEncounterDisplayRow: function (encType, monId, baseRateValue, levelRange, extra) {
    var row = {
      kind: "encounter",
      encType: encType,
      monId: monId,
      baseRateValue: Number(baseRateValue) || 0,
      rateValue: 0,
      rate: "0% ",
      min: levelRange && Number.isFinite(levelRange.min) ? levelRange.min : 0,
      max: levelRange && Number.isFinite(levelRange.max) ? levelRange.max : 0,
      rowState: getEncounterRowStateForLocation(this.id, monId),
    };

    if (extra && typeof extra === "object") {
      for (var key in extra) {
        if (!Object.prototype.hasOwnProperty.call(extra, key)) continue;
        row[key] = extra[key];
      }
    }

    return row;
  },
  applyEncounterRateRedistribution: function (rows, totalRateValue) {
    totalRateValue =
      Number.isFinite(totalRateValue) && totalRateValue > 0 ? totalRateValue : 100;

    var availableWeight = 0;
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (!row || !row.rowState || row.rowState.blocked) continue;
      if (row.baseRateValue > 0) availableWeight += row.baseRateValue;
    }

    return rows.map(function (row) {
      var nextRow = Object.assign({}, row);
      var rateValue = 0;
      if (
        availableWeight > 0 &&
        nextRow.baseRateValue > 0 &&
        nextRow.rowState &&
        !nextRow.rowState.blocked
      ) {
        rateValue = (nextRow.baseRateValue / availableWeight) * totalRateValue;
      }
      nextRow.rateValue = rateValue;
      nextRow.rate = formatEncounterRatePercent(rateValue) + " ";
      return nextRow;
    });
  },
  buildZeroRateEncounterRows: function (rows) {
    return (rows || []).map(function (row) {
      var nextRow = Object.assign({}, row);
      nextRow.rateValue = 0;
      nextRow.rate = "0% ";
      return nextRow;
    });
  },
  buildStandardEncounterRows: function (locationRecord, encType) {
    if (
      !locationRecord ||
      !locationRecord[encType] ||
      !Array.isArray(locationRecord[encType].encs)
    ) {
      return [];
    }

    var encounterGroup = locationRecord[encType];
    var rates =
      typeof getEncounterRateSlots === "function"
        ? getEncounterRateSlots(locationRecord, encType)
        : [];
    var rows = [];

    for (var i = 0; i < encounterGroup.encs.length; i++) {
      var encounter = encounterGroup.encs[i];
      if (!encounter || !encounter.s || encounter.s === "-----") continue;
      var monId = cleanString(encounter.s);
      if (!monId) continue;
      rows.push(
        this.buildEncounterDisplayRow(
          encType,
          monId,
          Number(rates[i]) || 0,
          getResolvedEncounterRange(encounter, null),
          {
            slotIndex: i,
            sourceEncType: encType,
          },
        ),
      );
    }

    return this.applyEncounterRateRedistribution(rows, 100);
  },
  buildBaseGrassEncounterRows: function (locationRecord) {
    if (
      !locationRecord ||
      !locationRecord.grass ||
      !Array.isArray(locationRecord.grass.encs)
    ) {
      return [];
    }

    var grassRates =
      typeof getEncounterRateSlots === "function"
        ? getEncounterRateSlots(locationRecord, "grass")
        : [];
    var rows = [];

    for (var i = 0; i < locationRecord.grass.encs.length; i++) {
      var encounter = locationRecord.grass.encs[i];
      if (!encounter || !encounter.s || encounter.s === "-----") continue;
      var monId = cleanString(encounter.s);
      if (!monId) continue;
      rows.push(
        this.buildEncounterDisplayRow(
          "grass",
          monId,
          Number(grassRates[i]) || 0,
          getResolvedEncounterRange(encounter, null),
          {
            slotIndex: i,
            sourceEncType: "grass",
          },
        ),
      );
    }

    return rows;
  },
  buildTimeOverlayEncounterRows: function (locationRecord, overlayEncType) {
    if (
      !locationRecord ||
      !overlayEncType ||
      !locationRecord[overlayEncType] ||
      !Array.isArray(locationRecord[overlayEncType].encs)
    ) {
      return [];
    }

    var encounterGroup = locationRecord[overlayEncType];
    var replacementIndexes = getGrassOverlayReplacementIndexes(
      locationRecord,
      encounterGroup.encs.length,
    );
    var fallbackRanges = getGrassOverlayLevelRanges(
      locationRecord,
      encounterGroup.encs.length,
    );
    var grassRates =
      typeof getEncounterRateSlots === "function"
        ? getEncounterRateSlots(locationRecord, "grass")
        : [];
    var rows = [];
    var overlaySlotIndex = 0;

    for (var i = 0; i < encounterGroup.encs.length; i++) {
      var encounter = encounterGroup.encs[i];
      if (!encounter || !encounter.s || encounter.s === "-----") continue;
      var monId = cleanString(encounter.s);
      if (!monId) continue;
      var replacementIndex = replacementIndexes[overlaySlotIndex];
      var fallbackRange = fallbackRanges[overlaySlotIndex];
      var slotIndex = Number.isFinite(replacementIndex) ? replacementIndex : i;
      rows.push(
        this.buildEncounterDisplayRow(
          overlayEncType,
          monId,
          Number(grassRates[slotIndex]) || 0,
          getResolvedEncounterRange(encounter, fallbackRange),
          {
            slotIndex: slotIndex,
            overlayOrder: overlaySlotIndex,
            sourceEncType: overlayEncType,
          },
        ),
      );
      overlaySlotIndex++;
    }

    return rows;
  },
  buildEffectiveGrassEncounterRows: function (
    locationRecord,
    timeMode,
    baseGrassRows,
    overlayRowsByType,
  ) {
    timeMode = normalizeEncounterTimeMode(timeMode);
    baseGrassRows = Array.isArray(baseGrassRows) ? baseGrassRows : [];
    overlayRowsByType = overlayRowsByType || {};

    var overlayEncType = getEncounterOverlayTypeForTimeMode(timeMode);
    var overlayRows = overlayEncType ? overlayRowsByType[overlayEncType] || [] : [];
    var mergedRows = [];

    if (overlayRows.length) {
      var rowBySlotIndex = Object.create(null);
      var orderedSlotIndexes = [];

      for (var i = 0; i < baseGrassRows.length; i++) {
        var baseRow = Object.assign({}, baseGrassRows[i]);
        rowBySlotIndex[baseRow.slotIndex] = baseRow;
        orderedSlotIndexes.push(baseRow.slotIndex);
      }

      for (var overlayIndex = 0; overlayIndex < overlayRows.length; overlayIndex++) {
        var overlayRow = Object.assign({}, overlayRows[overlayIndex]);
        rowBySlotIndex[overlayRow.slotIndex] = overlayRow;
      }

      for (var orderedIndex = 0; orderedIndex < orderedSlotIndexes.length; orderedIndex++) {
        var mergedRow = rowBySlotIndex[orderedSlotIndexes[orderedIndex]];
        if (mergedRow) mergedRows.push(mergedRow);
      }
    } else {
      mergedRows = baseGrassRows.map(function (row) {
        return Object.assign({}, row);
      });
    }

    return this.applyEncounterRateRedistribution(mergedRows, 100);
  },
  getDistribution: function () {
    var location = this.id;
    var locationRecord = BattleLocationdex[location];
    var results = [];
    var baseGrassRows = this.buildBaseGrassEncounterRows(locationRecord);
    var overlayRowsByType = {
      time_day: this.buildTimeOverlayEncounterRows(locationRecord, "time_day"),
      time_night: this.buildTimeOverlayEncounterRows(locationRecord, "time_night"),
    };
    var effectiveGrassRows = this.buildEffectiveGrassEncounterRows(
      locationRecord,
      this.timeMode,
      baseGrassRows,
      overlayRowsByType,
    );
    var activeOverlayType = getEncounterOverlayTypeForTimeMode(this.timeMode);

    for (const encType of encTypes) {
      const encounterGroup = locationRecord[encType];
      if (!encounterGroup || encounterGroup.encs === undefined) continue;

      var sectionRows = [];
      if (encType === "grass") {
        sectionRows = effectiveGrassRows.slice();
      } else if (isTimeEncounterType(encType)) {
        var overlayRows = overlayRowsByType[encType] || [];
        if (encType === activeOverlayType && overlayRows.length) {
          sectionRows = effectiveGrassRows
            .filter(function (row) {
              return row.sourceEncType === encType;
            })
            .sort(function (rowA, rowB) {
              return (rowA.overlayOrder || 0) - (rowB.overlayOrder || 0);
            });
        }
        if (!sectionRows.length) {
          sectionRows = this.buildZeroRateEncounterRows(overlayRows);
        }
      } else {
        sectionRows = this.buildStandardEncounterRows(locationRecord, encType);
      }

      if (!sectionRows.length) continue;

      results.push({
        kind: "header",
        encType: encType,
        showTimeControls: encType === "grass" && baseGrassRows.length > 0,
      });

      for (var i = 0; i < sectionRows.length; i++) {
        results.push(sectionRows[i]);
      }
    }

    this.results = results;
    return results;
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
  isMiscEncounterSection: function (section) {
    if (!section) return false;
    var encounterGroups = BattleLocationdex[this.id] || {};
    return isMiscEncounterSection(
      section.encType,
      encounterGroups[section.encType],
    );
  },
  shouldHideEncounterSection: function (section) {
    if (!this.isMiscEncounterSection(section)) return false;
    if (this.hideMiscEncounterTablesPermanently) return true;
    return !this.showMiscEncounterTables;
  },
  renderEncounterControls: function (sections) {
    var $controls = this.$(".ddex-encounter-controls");
    if (!$controls.length) return;

    var hasMiscSections = false;
    for (var i = 0; i < sections.length; i++) {
      if (this.isMiscEncounterSection(sections[i])) {
        hasMiscSections = true;
        break;
      }
    }

    if (!hasMiscSections || this.hideMiscEncounterTablesPermanently) {
      $controls.attr("data-has-controls", "false").prop("hidden", true).empty();
      return;
    }

    $controls
      .attr("data-has-controls", "true")
      .html(
        '<label class="ddex-misc-encounter-toggle">' +
          '<input type="checkbox" class="ddex-misc-encounter-toggle-input"' +
          (this.showMiscEncounterTables ? " checked" : "") +
          " />" +
          "<span>Show Misc Encounter Tables</span>" +
        "</label>",
      )
      .prop("hidden", this.activeTab === "maps");
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
    this.renderEncounterControls(sections);
    var primaryBuf = "";
    var secondaryBuf = "";
    for (var i = 0; i < sections.length; i++) {
      if (this.shouldHideEncounterSection(sections[i])) continue;
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
      var headerLabel = snakeToTitleCase(result.encType);
      if (encounterGroup && encounterGroup.name) {
        headerLabel += ": " + encounterGroup.name;
      }

      if (!result.showTimeControls) {
        return `<h3 class="${headerClassName}">${headerLabel}</h3>`;
      }

      var controls = '<span class="ddex-encounter-time-controls" role="group" aria-label="Grass encounter time">';
      for (var timeIndex = 0; timeIndex < DDEX_ENCOUNTER_TIME_MODES.length; timeIndex++) {
        var timeMode = DDEX_ENCOUNTER_TIME_MODES[timeIndex];
        controls +=
          '<button type="button" class="button ddex-encounter-time-button' +
          (this.timeMode === timeMode ? " active" : "") +
          '" data-time-mode="' +
          Dex.escapeHTML(timeMode) +
          '" aria-pressed="' +
          (this.timeMode === timeMode ? "true" : "false") +
          '">' +
          Dex.escapeHTML(getEncounterTimeModeLabel(timeMode)) +
          "</button>";
      }
      controls += "</span>";

      return (
        '<h3 class="' +
        headerClassName +
        '"><span class="ddex-encounter-header-row"><span class="ddex-encounter-header-text">' +
        headerLabel +
        "</span>" +
        controls +
        "</span></h3>"
      );
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
