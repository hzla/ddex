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

var PokedexEncountersPanel = PokedexResultPanel.extend({
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

    // distribution
    buf += '<ul class="utilichart metricchart nokbd encounterchart">';
    buf += "</ul>";
    buf += '<section class="location-map-gallery" hidden></section>';

    buf += "</div>";

    this.html(buf);

    setTimeout(
      function () {
        this.renderDistribution();
        this.renderLocationMaps();
      }.bind(this),
    );
  },
  getDistribution: function () {
    if (this.results) return this.results;

    var location = this.id;
    var results = [];
    var resultMins = [];
    var resultMaxs = [];

    var formatRate = function (i) {
      if (i === undefined || i === null || Number.isNaN(i)) return "    ";
      return i.toString().padStart(2, "z") + "% ";
    };

    var formatRange = function (min, max) {
      return (
        min.toString().padStart(3, "0") +
        "-" +
        max.toString().padStart(3, "0") +
        " "
      );
    };

    console.log(encTypes)

    for (let encTypeIndex in encTypes) {
      let encType = encTypes[encTypeIndex]
      if (BattleLocationdex[location][encType] && BattleLocationdex[location][encType]["encs"] !== undefined) {
        for (
          let i = 0;
          i < BattleLocationdex[location][encType]["encs"].length;
          i++
        ) {
          let enc = BattleLocationdex[location][encType]["encs"][i];
          let min = enc.mn;
          let max = enc.mx || enc.mn;
          if (!enc || !enc.s || enc.s === "-----") continue;
          let mon = cleanString(enc.s);
          if (!mon) continue;
          const rates = BattleLocationdex["rates"] ? BattleLocationdex["rates"][encType] : undefined;
          const rateVal = Array.isArray(rates) ? rates[i] : undefined;
          results.push(
            `${encTypeIndex}` + formatRate(rateVal) + formatRange(min, max) + mon,
          );
          resultMins.push(min || 0);
          resultMaxs.push(max || 0);
        }
      }

    }

    
    var last = "";
    for (var i = 0; i < results.length; i++) {
      if (results[i].charAt(0) !== last) {
        results.splice(i, 0, results[i].charAt(0).toUpperCase());
        resultMins.splice(i, 0, 0);
        resultMaxs.splice(i, 0, 0);
        i++;
      }
      last = results[i].charAt(0);
    }
    this.resultMins = resultMins;
    this.resultMaxs = resultMaxs;
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
    var results = this.results;
    var id = results[i].substr(13);
    var template = id ? BattlePokedex[id] : undefined;
    var isEmptyEncounter = id === "none" || (template && template.name === "None");
    if (!template) {
      let encTypeName = encTypes[parseInt(results[i].charAt(0))]
      if (BattleLocationdex[this.id][encTypeName] && BattleLocationdex[this.id][encTypeName].name) {
        return `<h3>${snakeToTitleCase(encTypeName)}:  ${BattleLocationdex[this.id][encTypeName].name}</h3>`
      } else {
        return `<h3>${snakeToTitleCase(encTypeName)}</h3>`   
      }     

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
      var rateTag = results[i].substr(1, 4).trim().replace("z", "");
      var minLevel = this.resultMins ? this.resultMins[i] : parseInt(results[i].substr(5, 3), 10);
      var maxLevel = this.resultMaxs ? this.resultMaxs[i] : parseInt(results[i].substr(9, 3), 10);
      var desc = rateTag || "";
      var levelValue = "";
      var levelShown = 0;
      if (!Number.isNaN(maxLevel) && maxLevel > 0) {
        levelValue = "Lv " + maxLevel;
        levelShown = maxLevel;
      } else if (!Number.isNaN(minLevel) && minLevel > 0) {
        levelValue = "Lv " + minLevel;
        levelShown = minLevel;
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
      var row = BattleSearch.renderTaggedLocationRowInner(template, desc);
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
