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

    buf += "</div>";

    this.html(buf);

    setTimeout(this.renderDistribution.bind(this));
  },
  getDistribution: function () {
    if (this.results) return this.results;

    var location = this.id;
    var results = [];
    var levelMins = {};

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
          const levelShown =
            max && max > 0 ? max : min && min > 0 ? min : 0;
          if (levelShown > 0) {
            const prevMin = levelMins[encTypeIndex];
            levelMins[encTypeIndex] =
              prevMin === undefined ? levelShown : Math.min(prevMin, levelShown);
          }
          results.push(
            `${encTypeIndex}` + formatRate(rateVal) + formatRange(min, max) + mon,
          );
        }
      }

    }

    
    var last = "";
    for (var i = 0; i < results.length; i++) {
      if (results[i].charAt(0) !== last) {
        results.splice(i, 0, results[i].charAt(0).toUpperCase());
        i++;
      }
      last = results[i].charAt(0);
    }
    this.levelMins = levelMins;
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
    var id = results[i].substr(13);
    var template = id ? BattlePokedex[id] : undefined;
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
      var minLevel = parseInt(results[i].substr(5, 3), 10);
      var maxLevel = parseInt(results[i].substr(9, 3), 10);
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
      var encTypeIndex = results[i].charAt(0);
      var minForType = this.levelMins
        ? this.levelMins[encTypeIndex]
        : undefined;
      if (
        levelShown > 0 &&
        minForType !== undefined &&
        levelShown > minForType
      ) {
        levelClass += " levelcol-high";
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
