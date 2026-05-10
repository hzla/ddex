var PokedexSearchPanel = Panels.Panel.extend({
  minWidth: 639,
  maxWidth: 10000,
  sidebarWidth: 280,
  search: null,
  events: {
    "keyup input.searchbox": "updateSearch",
    "change input.searchbox": "updateSearch",
    "search input.searchbox": "updateSearch",
    submit: "submit",
    keydown: "keydown",
    keyup: "keyup",
    click: "click",
    "click .result a": "clickResult",
    "click .ddex-location-missed-toggle": "toggleMissedLocation",
    "click .ddex-more-download-calc": "downloadCalcData",
    "click .ddex-more-download-dex": "downloadDexData",
    "click .ddex-more-open-calc": "openCalc",
    "click .ddex-more-sync-calc": "syncCalc",
    "click .filter": "removeFilter",
    "mouseover .result a": "hoverlink",
  },
  activeLink: null,
  remove: function () {
    if (
      this.handleNuzlockeUpdate &&
      window.DDEX_NUZLOCKE_BOX &&
      typeof window.DDEX_NUZLOCKE_BOX.unsubscribe === "function"
    ) {
      window.DDEX_NUZLOCKE_BOX.unsubscribe(this.handleNuzlockeUpdate);
    }
    if (this.handleCalcBridgeStateChange) {
      window.removeEventListener("ddex:calc-bridge-state", this.handleCalcBridgeStateChange);
    }
    Panels.Panel.prototype.remove.apply(this, arguments);
  },
  getAppPathFromLink: function (link) {
    if (!link) return "";
    var href = link.getAttribute ? link.getAttribute("href") : "";
    if (href && href.charAt(0) === "/") {
      if (window.DDEXPaths && typeof window.DDEXPaths.stripBase === "function") {
        href = window.DDEXPaths.stripBase(href);
      }
      return href.replace(/^\/+/, "");
    }
    var pathname = link.pathname || "";
    if (window.DDEXPaths && typeof window.DDEXPaths.stripBase === "function") {
      pathname = window.DDEXPaths.stripBase(pathname);
    }
    return String(pathname || "").replace(/^\/+/, "");
  },
  initialize: function () {
    var fragment = this.fragment;
    var questionIndex = fragment.indexOf("?");
    if (fragment === "moves") fragment = "moves/";
    if (fragment === "pokemon") fragment = "pokemon/";
    if (fragment === "encounters") fragment = "encounters/";
    if (fragment === "more") fragment = "more/";
    if (questionIndex >= 0) fragment = fragment.slice(0, questionIndex);
    this.currentFragment = fragment;
    this.isMorePanel = fragment === "more/";
    var buf = '<div class="pfx-body"><form class="pokedex">';



    buf += `<h1 id="dex-title"><a href="/" data-target="replace">Pok&eacute;dex</a></h1>`;

    buf += '<ul class="tabbar centered" style="margin-bottom: 7px"><li><button class="button nav-first' + (fragment === '' ? ' cur' : '') + '" value="">Search</button></li>';
    buf += '<li><button class="button' + (fragment === 'pokemon/' ? ' cur' : '') + '" value="pokemon/">Mons</button></li>';
    buf += '<li><button class="button' + (fragment === 'encounters/' ? ' cur' : '') + '" value="encounters/">Areas</button></li>';
    buf += '<li><button class="button' + (fragment === 'moves/' ? ' cur' : '') + '" value="moves/">Moves</button></li>';
    buf += '<li><button class="button nav-last' + (fragment === 'more/' ? ' cur' : '') + '" value="more/">More</button></li></ul>';

    if (!this.isMorePanel) {
      buf +=
        '<div class="searchboxwrapper"><input class="textbox searchbox" type="search" name="q" value="' +
        Dex.escapeHTML(this.$(".searchbox").val() || "") +
        '" autocomplete="off" autofocus placeholder="Search mons, moves, abilities, items, encounters or more" /></div>';
    }
    buf += "</form>";
    buf += '<div class="results"></div>';
    buf += '<div class="ddex-search-footer">';
    buf += "<div id='reset-cache'>Reset Data</div>";
    buf += '<div id="rom-upload-panel">';
    buf += '<label class="ddex-rom-upload-trigger" for="rom-upload">Load Gen 3/4 ROM</label>';
    buf += '<input type="file" id="rom-upload" accept=".nds,.gba,.toml,application/octet-stream,text/plain" multiple />';
    buf += '<div id="rom-status" style="display:none;"></div>';
    buf += "</div>";
    buf += "</div></div>";
    this.$el.html(buf);
    if (typeof setDexTitleFromStorage === "function") {
      setDexTitleFromStorage();
    }
    var $searchbox = this.$(".searchbox");
    this.$searchbox = $searchbox;
    this.$searchfilters = null;
    var results = this.$(".results");
    this.$results = results;
    if (this.isMorePanel) {
      this.search = null;
      this.renderMorePanel();
      this.handleCalcBridgeStateChange = this.renderMorePanel.bind(this);
      window.addEventListener("ddex:calc-bridge-state", this.handleCalcBridgeStateChange);
      this.updateResultsState();
      return;
    }
    if (results.length) {
      var search = (this.search = new BattleSearch(results, this.$el));
      this.$el.on("scroll", function () {
        search.updateScroll();
      });
      if (fragment === "pokemon/") {
        search.setType("pokemon");
        $searchbox.attr(
          "placeholder",
          "Search pokemon OR filter by type, move, ability, egg group",
        );
        this.$(".buttonbar").remove();
      } else if (fragment === "moves/") {
        search.setType("move");
        $searchbox.attr(
          "placeholder",
          "Search moves OR filter by type, category, pokemon",
        );
        this.$(".buttonbar").remove();
      } else if (fragment === "encounters/") {
        search.setType("location");
        $searchbox.attr(
          "placeholder",
          "Search encounters OR filter by type, category, pokemon",
        );
        this.$(".buttonbar").remove();
      }
      this.search.externalFilter = true;
    } else {
      this.search = null;
    }
    $searchbox.focus();
    this.find($searchbox.val());
    this.checkExactMatch();

    if (
      window.DDEX_NUZLOCKE_BOX &&
      typeof window.DDEX_NUZLOCKE_BOX.subscribe === "function"
    ) {
      this.handleNuzlockeUpdate = function () {
        if (!this.search || !this.$searchbox) return;
        if (!this.el || !document.body.contains(this.el)) return;
        this.search.engine.results = null;
        this.find(this.$searchbox.val() || "");
      }.bind(this);
      window.DDEX_NUZLOCKE_BOX.subscribe(this.handleNuzlockeUpdate);
    }
  },
  renderMorePanel: function () {
    if (!this.$results || !this.$results.length) return;
    var bridgeState =
      window.DDEXCalcBridge && typeof window.DDEXCalcBridge.getState === "function"
        ? window.DDEXCalcBridge.getState()
        : {
            calcReady: false,
            hasCalcWindow: false,
            hasCalcData: false,
            hasDexData: false,
            romSourceGen: null,
            status: "",
          };
    var hasRomLoaded = !!bridgeState.romSourceGen;
    var syncDisabled = !bridgeState.hasCalcData || !bridgeState.hasCalcWindow;
    var calcStatus = bridgeState.status || (bridgeState.hasCalcWindow ? "Calc tab open." : "Calc tab not open.");
    var romSummary = hasRomLoaded
      ? "Loaded ROM source: Gen " + bridgeState.romSourceGen + "."
      : "Load a Gen 3 or Gen 4 ROM to enable calc export and sync.";
    var miningDebug =
      window.DDEX_ROM_MINING_DEBUG ||
      (window.DDEX_ROM_DEBUG && window.DDEX_ROM_DEBUG.miningTable) ||
      null;
    var loadedRomSourceGen =
      Number(bridgeState.romSourceGen || window.DDEX_ROM_SOURCE_GEN || localStorage.getItem("ddexRomSourceGen") || "0") || null;
    var isGen4Rom = loadedRomSourceGen === 4;
    var isPlatinumRom = String(localStorage.romFamily || "").toLowerCase() === "plat";
    var hasUndergroundLoot = !!(
      miningDebug &&
      miningDebug.status === "ok" &&
      miningDebug.aggregates &&
      miningDebug.aggregates.byBagItemId
    );

    var buf = '<section class="ddex-more-panel">';
    buf += '<div class="ddex-more-card">';
    buf += "<h2>ROM Tools</h2>";
    buf += "<p>" + Dex.escapeHTML(romSummary) + "</p>";
    buf += '<div class="ddex-more-actions">';
    buf +=
      '<button type="button" class="button ddex-more-download-calc"' +
      (bridgeState.hasCalcData ? "" : ' disabled') +
      ">Download Calc Data</button>";
    buf +=
      '<button type="button" class="button ddex-more-download-dex"' +
      (bridgeState.hasDexData ? "" : ' disabled') +
      ">Download Dex Data</button>";
    buf +=
      '<button type="button" class="button ddex-more-open-calc"' +
      (hasRomLoaded ? "" : ' disabled') +
      ">Open Calc</button>";
    buf +=
      '<button type="button" class="button ddex-more-sync-calc"' +
      (syncDisabled ? ' disabled' : "") +
      ">Sync Data to Calc</button>";
    buf += "</div>";
    buf += '<p class="ddex-more-status">' + Dex.escapeHTML(calcStatus) + "</p>";
    buf += "</div>";
    if (isGen4Rom) {
      buf += '<div class="ddex-more-card">';
      buf += "<h2>Item Info</h2>";
      buf += "<p>Browse resolved visible pickups, hidden items, and NPC gifts from the loaded Gen 4 ROM.</p>";
      buf +=
        '<p><a class="button" href="/articles/grounditems" data-target="push">Ground Items</a></p>';
      buf +=
        '<p><a class="button" href="/articles/hiddenitems" data-target="push">Hidden Items</a></p>';
      buf +=
        '<p><a class="button" href="/articles/npcitems" data-target="push">NPC Items</a></p>';
      if (isPlatinumRom) {
        buf += "<p>Mining loot odds are merged by item, so duplicate Underground table entries are summed into one row.</p>";
      }
      if (hasUndergroundLoot) {
        buf +=
          '<p><a class="button" href="/articles/undergroundloot" data-target="push">Underground Loot</a></p>';
      } else if (isPlatinumRom) {
        buf += "<p>Underground loot data isn't available for the currently loaded ROM.</p>";
      }
      buf += "</div>";
    }
    buf += "</section>";
    this.$results.html(buf);
  },
  updateSearch: function (e) {
    if (!this.search) return;
    this.find(e.currentTarget.value);
  },
  removeFilter: function (e) {
    this.search.removeFilter(e);
    this.updateFilters();
    this.$searchbox.focus();
  },
  updateFilters: function () {
    // this.search.externalFilter = true;
    var buf = "";
    if (this.search.qType === "pokemon") {
      buf = '<button class="filter noclear" value=":">Pokémon</button> ';
    } else if (this.search.qType === "encounters") {
      buf = '<button class="filter noclear" value=":">Encounters</button> ';
    } else if (this.search.qType === "move") {
      buf = '<button class="filter noclear" value=":">Moves</button> ';
    } else {
      this.$(".searchbox-filters").remove();
      return;
    }
    if (this.search.filters) {
      for (var i = 0; i < this.search.filters.length; i++) {
        var filter = this.search.filters[i];
        var text = filter[1];
        if (filter[0] === "move") text = Dex.moves.get(text).name;
        if (filter[0] === "pokemon") text = Dex.species.get(text).name;
        if (filter[0] === "location") text = Dex.locations.get(text).name;
        buf +=
          '<button class="filter" value="' +
          Dex.escapeHTML(filter.join(":")) +
          '">' +
          text +
          ' <i class="fa fa-times-circle"></i></button> ';
      }
    }
    if (!this.$searchfilters) {
      this.$searchfilters = $(
        '<div class="searchbox-filters"></div>',
      ).insertAfter(this.$searchbox);
    }
    this.$searchfilters.html(buf);
    var filterWidth = this.$searchfilters.width();
    if (filterWidth > this.$searchbox.outerWidth() / 2) {
      this.$searchbox.css(
        "padding",
        "" + (this.$searchfilters.height() + 4) + "px 2px 2px 2px",
      );
    } else {
      this.$searchbox.css("padding", "2px 2px 2px " + (filterWidth + 6) + "px");
    }
  },
  submit: function (e) {
    e.preventDefault();
    if (!this.$searchbox || !this.$searchbox.length) return;
    this.$(".searchbox")
      .attr("placeholder", "Type in: Pokemon, move, item, ability...")
      .focus();
  },
  keyup: function (e) {
    if (!this.$searchbox || !this.$searchbox.length) return;
    var val = this.$searchbox.val();
    var id = toID(val);
    if (!id) return;
    var lastchar = val.charAt(val.length - 1);
    if (lastchar === "," || lastchar === " ") {
      if (id === "ds" || id === "dexsearch" || id === "pokemon") {
        this.app.go("pokemon/", this, true);
        return;
      }
      if (
        id === "ms" ||
        id === "movesearch" ||
        id === "move" ||
        id === "moves"
      ) {
        this.app.go("moves/", this, true);
        return;
      }
      if (id === "es" || id === "encountersearch" || id === "encounters") {
        this.app.go("encounters/", this, true);
        return;
      }
    }
    if (lastchar === ",") {
      if (this.search.addFilter(this.activeLink)) {
        this.$searchbox.val("");
        this.find("");
        return;
      }
    }
  },
  keydown: function (e) {
    if (!this.$searchbox || !this.$searchbox.length) return;
    switch (e.keyCode) {
      case 13: // enter
        e.preventDefault();
        e.stopPropagation();
        if (this.search.addFilter(this.activeLink)) {
          this.$searchbox.val("");
          this.find("");
          return;
        }
        if (this.activeLink) {
          var path = this.getAppPathFromLink(this.activeLink);
          if (
            path === "moves/" ||
            path === "pokemon/" ||
            path === "encounters/"
          ) {
            this.app.go(path, this, true);
            return;
          }
          this.app.go(path, this, false, $(this.activeLink));
        } else if (!this.$searchbox.val()) {
          this.app.slicePanel(this);
        }
        break;
      case 188: // comma
        if (this.search.addFilter(this.activeLink)) {
          e.preventDefault();
          e.stopPropagation();
          this.$searchbox.val("");
          this.find("");
          return;
        }
        break;
      case 32: // space
        var id = toID(this.$searchbox.val());
        if (id === "ds" || id === "pokemon") {
          e.preventDefault();
          e.stopPropagation();
          this.app.go("pokemon/", this, true);
          return;
        }
        if (id === "ms" || id === "move" || id === "moves") {
          e.preventDefault();
          e.stopPropagation();
          this.app.go("moves/", this, true);
          return;
        }
        if (id === "es" || id === "encounters") {
          e.preventDefault();
          e.stopPropagation();
          this.app.go("encounters/", this, true);
          return;
        }
        break;
      case 38: // up
        e.preventDefault();
        e.stopPropagation();
        var $link = $(this.activeLink).parent().prev();
        while ($link[0] && $link[0].firstChild.tagName !== "A")
          $link = $link.prev();
        if ($link[0] && $link.children()[0]) {
          $(this.activeLink).removeClass("active");
          this.activeLink = $link.children()[0];
          $(this.activeLink).addClass("active");
        }
        break;
      case 40: // down
        e.preventDefault();
        e.stopPropagation();
        var $link = $(this.activeLink).parent().next();
        while ($link[0] && $link[0].firstChild.tagName !== "A")
          $link = $link.next();
        if ($link[0] && $link.children()[0]) {
          $(this.activeLink).removeClass("active");
          this.activeLink = $link.children()[0];
          $(this.activeLink).addClass("active");
        }
        break;
      case 27: // esc
      case 8: // backspace
        if (this.$searchbox.val()) break;

        if (this.search.removeFilter()) {
          this.find("");
          return;
        }
        if (this.search.qType) {
          this.app.go("", this, true);
          return;
        }
        if (this.app.panels.length > 1) {
          e.preventDefault();
          e.stopPropagation();
          this.app.slicePanel(this);
        }
        break;
    }
  },
  click: function (e) {
    if (
      e.target.tagName === "BUTTON" &&
      $(e.target).closest(".tabbar").length
    ) {
      e.preventDefault();
      e.stopPropagation();
      this.app.go(e.target.value, this, true);
      return;
    }
    if (e.target.tagName === "BUTTON" && e.target.name === "lucky") {
      e.preventDefault();
      e.stopPropagation();
      alert(
        [
          "That's pretty cool.",
          "Your mom's feeling lucky.",
          "I see.",
          "If you feel lucky for more than four hours, perhaps you should see a doctor.",
        ][Math.floor(Math.random() * 4)],
      );
      return;
    }
    if (!this.$searchbox || !this.$searchbox.length) return;
    var scrollLoc = this.$el.scrollTop();
    this.$searchbox.focus();
    this.$el.scrollTop(scrollLoc);
  },
  clickResult: function (e) {
    if (this.search.addFilter(e.currentTarget)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.$searchbox.val("");
      this.find("");
      return;
    }
  },
  toggleMissedLocation: function (e) {
    e.preventDefault();
    e.stopPropagation();
    var locationId = e.currentTarget.getAttribute("data-location-id");
    if (
      window.DDEX_NUZLOCKE_BOX &&
      typeof window.DDEX_NUZLOCKE_BOX.toggleLocationMissed === "function"
    ) {
      window.DDEX_NUZLOCKE_BOX.toggleLocationMissed(locationId);
    }
    if (this.$searchbox && this.$searchbox.length) {
      this.$searchbox.focus();
    }
  },
  downloadCalcData: function (e) {
    e.preventDefault();
    e.stopPropagation();
    if (typeof window.downloadRomBackupData === "function") {
      window.downloadRomBackupData();
    }
    this.renderMorePanel();
  },
  downloadDexData: function (e) {
    e.preventDefault();
    e.stopPropagation();
    if (typeof window.downloadRomOverrideFiles === "function") {
      window.downloadRomOverrideFiles();
    }
    this.renderMorePanel();
  },
  openCalc: function (e) {
    e.preventDefault();
    e.stopPropagation();
    if (window.DDEXCalcBridge && typeof window.DDEXCalcBridge.openCalc === "function") {
      window.DDEXCalcBridge.openCalc();
    }
    this.renderMorePanel();
  },
  syncCalc: function (e) {
    e.preventDefault();
    e.stopPropagation();
    if (window.DDEXCalcBridge && typeof window.DDEXCalcBridge.syncToCalc === "function") {
      window.DDEXCalcBridge.syncToCalc();
    }
    this.renderMorePanel();
  },
  hoverlink: function (e) {
    $(this.activeLink).removeClass("active");
    this.activeLink = e.currentTarget;
    $(this.activeLink).addClass("active");
  },
  find: function (val) {
    if (!this.search) return;
    if (!val) val = "";
    this.updateFilters();
    var didFind = this.search.find(val);
    this.updateResultsState();
    if (!didFind) return;
    if (this.search.q || this.search.filters) {
      this.$(".pokedex").addClass("aboveresults");
      this.activeLink = this.search.el.getElementsByTagName("a")[0];
      $(this.activeLink).addClass("active");
    } else {
      this.$(".pokedex").removeClass("aboveresults");
      this.activeLink = null;
    }
  },
  updateResultsState: function () {
    var hasResults = !!this.$(".results li.result").length;
    var hasCategoryTab =
      this.currentFragment === "pokemon/" ||
      this.currentFragment === "moves/" ||
      this.currentFragment === "encounters/";
    if (this.search && this.search.qType) hasCategoryTab = true;
    this.$el.toggleClass("ddex-search-has-results", hasResults);
    this.$el.toggleClass("ddex-search-has-content", hasResults || hasCategoryTab);
  },
  checkExactMatch: function () {
    return;
  },
});
