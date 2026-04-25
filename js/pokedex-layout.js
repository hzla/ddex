;(function () {
  "use strict";

  function normalizeFragment(fragment) {
    if (fragment == null) return "";
    fragment = String(fragment);
    if (window.DDEXPaths && typeof window.DDEXPaths.stripBase === "function") {
      fragment = window.DDEXPaths.stripBase(fragment);
    }
    return fragment.replace(/^\/+/, "");
  }

  function fragmentWithoutQuery(fragment) {
    fragment = normalizeFragment(fragment);
    var questionIndex = fragment.indexOf("?");
    if (questionIndex >= 0) {
      fragment = fragment.slice(0, questionIndex);
    }
    return fragment;
  }

  function startsWithRoute(fragment, prefix) {
    return fragment === prefix || fragment.indexOf(prefix) === 0;
  }

  function extractBridgeArgs(fragment) {
    var normalized = fragmentWithoutQuery(fragment);
    if (!normalized) return [];

    var slashIndex = normalized.indexOf("/");
    if (slashIndex < 0) return [normalized];

    var value = normalized.slice(slashIndex + 1);
    if (!value) return [];

    try {
      return [decodeURIComponent(value)];
    } catch (error) {
      return [value];
    }
  }

  function getAppUrlPath(fragment) {
    var normalized = normalizeFragment(fragment);
    var base = window.DDEXPaths && typeof window.DDEXPaths.withBase === "function"
      ? window.DDEXPaths.withBase("/")
      : "/";
    return base + normalized;
  }

  function getAppPathFromHref(href) {
    if (!href) return "";
    try {
      var url = new URL(href, window.location.href);
      var pathname = url.pathname || "/";
      if (window.DDEXPaths && typeof window.DDEXPaths.stripBase === "function") {
        pathname = window.DDEXPaths.stripBase(pathname);
      }
      pathname = pathname.replace(/^\/+/, "");
      return pathname + (url.search || "");
    } catch (error) {
      return normalizeFragment(href);
    }
  }

  function ensureShell() {
    var shell = document.querySelector(".ddex-shell");
    if (shell) return shell;

    shell = document.createElement("div");
    shell.className = "ddex-shell";
    shell.innerHTML =
      '<div class="ddex-slot ddex-sidebar-slot"></div>' +
      '<div class="ddex-slot ddex-content-slot"></div>';
    document.body.innerHTML = "";
    document.body.appendChild(shell);
    return shell;
  }

  function buildEmptyDetailMarkup() {
    return (
      '<div class="pfx-body dexentry ddex-empty-detail">' +
      '<div class="ddex-empty-detail-inner">' +
      "<h1>Dynamic Dex</h1>" +
      "<p>Search or select a result to view details here.</p>" +
      "</div>" +
      "</div>"
    );
  }

  function collectChildrenBetween(body, startNode, endNode) {
    var children = [];
    var current = startNode;
    while (current && current !== endNode) {
      var next = current.nextSibling;
      children.push(current);
      current = next;
    }
    return children;
  }

  function moveNodes(target, nodes) {
    for (var i = 0; i < nodes.length; i++) {
      target.appendChild(nodes[i]);
    }
  }

  function applyDetailShell(body, options) {
    if (!body || body.querySelector(".ddex-detail-shell")) return;
    options = options || {};

    var shell = document.createElement("div");
    shell.className = "ddex-detail-shell";
    var primary = document.createElement("section");
    primary.className = "ddex-detail-primary";
    var secondary = document.createElement("section");
    secondary.className = "ddex-detail-secondary";
    shell.appendChild(primary);
    shell.appendChild(secondary);

    var splitAt = null;
    if (options.splitSelector) {
      splitAt = body.querySelector(options.splitSelector);
    }

    var bodyChildren = Array.prototype.slice.call(body.childNodes);
    var beforeSplit = [];
    var afterSplit = [];
    for (var i = 0; i < bodyChildren.length; i++) {
      var child = bodyChildren[i];
      if (child === shell) continue;
      if (splitAt && child === splitAt) {
        afterSplit = collectChildrenBetween(body, child, null);
        break;
      }
      beforeSplit.push(child);
    }

    for (var j = 0; j < beforeSplit.length; j++) {
      primary.appendChild(beforeSplit[j]);
    }
    if (!splitAt) {
      var secondarySelectors = options.secondarySelectors || [];
      for (var selectorIndex = 0; selectorIndex < secondarySelectors.length; selectorIndex++) {
        var matches = primary.querySelectorAll(secondarySelectors[selectorIndex]);
        for (var matchIndex = 0; matchIndex < matches.length; matchIndex++) {
          secondary.appendChild(matches[matchIndex]);
        }
      }
    } else {
      moveNodes(secondary, afterSplit);
    }

    if (!secondary.childNodes.length) {
      secondary.classList.add("ddex-detail-secondary-empty");
    }

    body.appendChild(shell);
  }

  function applyItemLayout(panel) {
    var body = panel && panel.$ && panel.$(".pfx-body")[0];
    if (!body) return;
    applyDetailShell(body, { splitSelector: "h3" });
  }

  function applyAbilityLayout(panel) {
    var body = panel && panel.$ && panel.$(".pfx-body")[0];
    if (!body) return;
    applyDetailShell(body, { splitSelector: "h3" });
  }

  function applyTypeLayout(panel) {
    var body = panel && panel.$ && panel.$(".pfx-body")[0];
    if (!body) return;
    applyDetailShell(body, { splitSelector: "h3" });
  }

  function applyTagLayout(panel) {
    var body = panel && panel.$ && panel.$(".pfx-body")[0];
    if (!body) return;
    applyDetailShell(body, { splitSelector: "h3" });
  }

  function applyEggGroupLayout(panel) {
    var body = panel && panel.$ && panel.$(".pfx-body")[0];
    if (!body) return;
    applyDetailShell(body, { splitSelector: "h3" });
  }

  function applyTierLayout(panel) {
    var body = panel && panel.$ && panel.$(".pfx-body")[0];
    if (!body) return;
    applyDetailShell(body, { splitSelector: "h3" });
  }

  function applyArticleLayout(panel) {
    var body = panel && panel.$ && panel.$(".pfx-body")[0];
    if (!body) return;
    applyDetailShell(body, { splitSelector: ".article-content" });
  }

  function applyMoveLayout(panel) {
    var body = panel && panel.$ && panel.$(".pfx-body")[0];
    if (!body) return;
    applyDetailShell(body, { splitSelector: ".ddex-move-distribution" });
  }

  function applyEncounterLayout(panel) {
    var body = panel && panel.$ && panel.$(".pfx-body")[0];
    if (!body) return;
    applyDetailShell(body, { splitSelector: ".utilichart" });
    var shell = body.querySelector(".ddex-detail-shell");
    if (shell) shell.classList.add("ddex-encounter-layout");
  }

  function applyPokemonLayout(panel) {
    var body = panel && panel.$ && panel.$(".pfx-body")[0];
    if (!body) return;
    applyDetailShell(body, { splitSelector: ".tabbar" });
  }

  var detailLayoutHelpers = {
    applyAbilityLayout: applyAbilityLayout,
    applyArticleLayout: applyArticleLayout,
    applyEggGroupLayout: applyEggGroupLayout,
    applyEncounterLayout: applyEncounterLayout,
    applyItemLayout: applyItemLayout,
    applyMoveLayout: applyMoveLayout,
    applyPokemonLayout: applyPokemonLayout,
    applyTagLayout: applyTagLayout,
    applyTierLayout: applyTierLayout,
    applyTypeLayout: applyTypeLayout,
    applyDetailShell: applyDetailShell,
  };

  var PokedexEmptyDetailPanel = (window.PokedexEmptyDetailPanel = Panels.Panel.extend({
    initialize: function () {
      this.html(buildEmptyDetailMarkup());
    },
  }));

  var PokedexFixedLayoutApp = (window.PokedexFixedLayoutApp = Panels.App.extend({
    fixedLayout: true,
    constructor: function () {
      Panels.App.prototype.constructor.apply(this, arguments);
    },
    normalizeFragment: normalizeFragment,
    fragmentWithoutQuery: fragmentWithoutQuery,
    isContentFragment: function (fragment) {
      fragment = fragmentWithoutQuery(fragment);
      return (
        /^pokemon\/[^/]/.test(fragment) ||
        /^moves\/[^/]/.test(fragment) ||
        /^items\/[^/]/.test(fragment) ||
        /^abilities\/[^/]/.test(fragment) ||
        /^types\/[^/]/.test(fragment) ||
        /^egggroups\/[^/]/.test(fragment) ||
        /^encounters\/[^/]/.test(fragment) ||
        /^tags\/[^/]/.test(fragment) ||
        /^categories\/[^/]/.test(fragment) ||
        /^tiers\/[^/]/.test(fragment) ||
        /^articles\/[^/]/.test(fragment)
      );
    },
    isSidebarFragment: function (fragment) {
      fragment = fragmentWithoutQuery(fragment);
      return (
        !this.isContentFragment(fragment) &&
        (fragment === "" ||
          fragment === "pokemon/" ||
          fragment === "moves/" ||
          fragment === "encounters/" ||
          (!fragment.startsWith("items/") &&
            !fragment.startsWith("abilities/") &&
            !fragment.startsWith("types/") &&
            !fragment.startsWith("egggroups/") &&
            !fragment.startsWith("tags/") &&
            !fragment.startsWith("categories/") &&
            !fragment.startsWith("tiers/") &&
            !fragment.startsWith("articles/")))
      );
    },
    inferSidebarFragment: function (fragment) {
      fragment = fragmentWithoutQuery(fragment);
      if (startsWithRoute(fragment, "pokemon/")) return "pokemon/";
      if (startsWithRoute(fragment, "moves/")) return "moves/";
      if (startsWithRoute(fragment, "encounters/")) return "encounters/";
      return "";
    },
    getBridgePanelType: function (fragment) {
      fragment = fragmentWithoutQuery(fragment);
      if (startsWithRoute(fragment, "pokemon/")) return window.PokedexPokemonPanel;
      if (startsWithRoute(fragment, "moves/")) return window.PokedexMovePanel;
      if (startsWithRoute(fragment, "items/")) return window.PokedexItemPanel;
      if (startsWithRoute(fragment, "abilities/")) return window.PokedexAbilityPanel;
      if (startsWithRoute(fragment, "types/")) return window.PokedexTypePanel;
      if (startsWithRoute(fragment, "egggroups/")) return window.PokedexEggGroupPanel;
      if (startsWithRoute(fragment, "encounters/")) return window.PokedexEncountersPanel;
      if (startsWithRoute(fragment, "tags/")) return window.PokedexTagPanel;
      if (startsWithRoute(fragment, "categories/")) return window.PokedexCategoryPanel;
      if (startsWithRoute(fragment, "tiers/")) return window.PokedexTierPanel;
      if (startsWithRoute(fragment, "articles/")) return window.PokedexArticlePanel;
      return null;
    },
    initializeShell: function () {
      if (this.shell) return;
      document.documentElement.classList.add("ddex-fixed-layout");
      document.body.classList.add("ddex-fixed-layout");
      this.shell = ensureShell();
      if (window.__DDEX_BOOTSTRAP__ && window.__DDEX_BOOTSTRAP__.embeddedLayout === "calc-modal") {
        this.shell.classList.add("ddex-calc-modal-layout");
      }
      if (!this.shell.querySelector(".ddex-sidebar-slot")) {
        this.shell.innerHTML =
          '<div class="ddex-slot ddex-sidebar-slot"></div>' +
          '<div class="ddex-slot ddex-content-slot"></div>';
      }
      this.sidebarSlot = this.shell.querySelector(".ddex-sidebar-slot");
      this.contentSlot = this.shell.querySelector(".ddex-content-slot");
      $("body").css({ overflow: "hidden" });
    },
    syncDetailState: function () {
      if (!this.shell) return;
      this.shell.classList.toggle("ddex-has-detail", !!this.currentContentFragment);
    },
    createPanelElement: function (slotClass) {
      var el = document.createElement("div");
      el.className = "pfx-panel " + slotClass;
      return el;
    },
    renderSlotPanel: function (slotName, panelType, options) {
      options = options || {};
      var slot = slotName === "sidebar" ? this.sidebarSlot : this.contentSlot;
      var existingPanel = slotName === "sidebar" ? this.sidebarPanel : this.contentPanel;
      if (existingPanel) {
        existingPanel.remove();
      }
      if (slotName === "content") {
        this.clearEmptyDetailPanel();
      }

      var el = this.createPanelElement(
        slotName === "sidebar" ? "ddex-sidebar-panel" : "ddex-content-panel",
      );
      slot.innerHTML = "";
      slot.appendChild(el);

      options.el = el;
      options.app = this;
      var panel = new panelType(options);

      if (slotName === "sidebar") {
        this.sidebarPanel = panel;
      } else {
        this.contentPanel = panel;
      }
      return panel;
    },
    renderEmptyDetailPanel: function () {
      if (this.contentPanel) {
        this.contentPanel.remove();
        this.contentPanel = null;
      }
      if (this.emptyDetailPanel) {
        this.emptyDetailPanel.remove();
      }
      var el = this.createPanelElement("ddex-content-panel");
      this.contentSlot.innerHTML = "";
      this.contentSlot.appendChild(el);
      this.emptyDetailPanel = new PokedexEmptyDetailPanel({
        el: el,
        app: this,
        fragment: "",
        loaded: true,
      });
      this.syncDetailState();
    },
    clearEmptyDetailPanel: function () {
      if (!this.emptyDetailPanel) return;
      this.emptyDetailPanel.remove();
      this.emptyDetailPanel = null;
    },
    updatePanelsArray: function () {
      this.panels = [this.sidebarPanel];
      if (this.contentPanel) {
        this.panels.push(this.contentPanel);
      }
      this.i = 0;
      this.j = 0;
    },
    initializePanels: function (name, fragment, args) {
      this.initializeShell();
      var normalized = this.normalizeFragment(fragment);
      this.currentSidebarFragment = this.isContentFragment(normalized)
        ? this.inferSidebarFragment(normalized)
        : normalized;
      this.renderSlotPanel("sidebar", PokedexSearchPanel, {
        fragment: this.currentSidebarFragment,
        args: [],
        loaded: true,
      });

      if (this.isContentFragment(normalized)) {
        this.currentContentFragment = normalized;
        var panelType = this.getPanelType(name);
        this.renderSlotPanel("content", panelType, {
          fragment: normalized,
          args: args,
          loaded: true,
        });
      } else {
        this.currentContentFragment = "";
        this.renderEmptyDetailPanel();
      }
      this.updatePanelsArray();
      this.syncDetailState();
      this.updateURL(true);
    },
    go: function (fragment, loc, replace, source, instant) {
      fragment = this.normalizeFragment(fragment);
      if (fragment && fragment.substr(0, this.root.length) === this.root) {
        fragment = fragment.substr(this.root.length);
      }
      this.goLoc = loc;
      this.goLocReplace = replace;
      this.goLocSource = source;
      this.goInstant = instant;
      Backbone.history.loadUrl(fragment);
    },
    navigatePanel: function (name, fragment, args) {
      if (!this.sidebarSlot) {
        this.initializePanels(name, fragment, args);
        return;
      }

      var isInternal = "goLoc" in this;
      var loc = this.goLoc;
      var source = this.goLocSource;
      delete this.goLoc;
      delete this.goLocReplace;
      delete this.goLocSource;
      delete this.goInstant;

      var normalized = this.normalizeFragment(fragment);
      if (this.isContentFragment(normalized)) {
        this.openContentFragment(this.getPanelType(name), normalized, args, source, loc);
      } else {
        this.openSidebarFragment(normalized, args, isInternal && !!this.currentContentFragment);
      }
      this.updatePanelsArray();
      this.updateURL(!isInternal);
    },
    openSidebarFragment: function (fragment, args, preserveContent) {
      this.currentSidebarFragment = this.normalizeFragment(fragment);
      this.renderSlotPanel("sidebar", PokedexSearchPanel, {
        fragment: this.currentSidebarFragment,
        args: [],
        loaded: true,
      });
      if (!preserveContent) {
        this.currentContentFragment = "";
        this.renderEmptyDetailPanel();
      }
    },
    openContentFragment: function (panelType, fragment, args, source, loc) {
      fragment = this.normalizeFragment(fragment);
      if (!this.currentSidebarFragment) {
        this.currentSidebarFragment = this.inferSidebarFragment(fragment);
        this.renderSlotPanel("sidebar", PokedexSearchPanel, {
          fragment: this.currentSidebarFragment,
          args: [],
          loaded: true,
        });
      }
      var sourcePanel = this.sidebarPanel;
      if (loc === this.contentPanel) {
        sourcePanel = this.contentPanel;
      } else if (loc === this.sidebarPanel) {
        sourcePanel = this.sidebarPanel;
      } else if (this.contentPanel) {
        sourcePanel = this.contentPanel;
      }

      this.currentContentFragment = fragment;
      this.renderSlotPanel("content", panelType, {
        fragment: fragment,
        args: args,
        sourcePanel: sourcePanel,
        source: source || null,
        loaded: true,
      });
      this.syncDetailState();
    },
    navigateFromBridge: function (fragment) {
      var normalized = this.normalizeFragment(fragment);
      var args = extractBridgeArgs(normalized);
      if (!this.sidebarSlot) {
        this.initializePanels(this.getBridgePanelType(normalized) || PokedexSearchPanel, normalized, args);
        return true;
      }

      if (this.isContentFragment(normalized)) {
        var panelType = this.getBridgePanelType(normalized);
        if (!panelType) return false;

        this.currentSidebarFragment = this.inferSidebarFragment(normalized);
        this.renderSlotPanel("sidebar", PokedexSearchPanel, {
          fragment: this.currentSidebarFragment,
          args: [],
          loaded: true,
        });

        this.currentContentFragment = normalized;
        this.renderSlotPanel("content", panelType, {
          fragment: normalized,
          args: args,
          sourcePanel: this.sidebarPanel,
          source: null,
          loaded: true,
        });
        this.syncDetailState();
      } else {
        this.openSidebarFragment(normalized, [], false);
        this.syncDetailState();
      }

      this.updatePanelsArray();
      this.updateURL(false);
      return true;
    },
    clearDetailPanel: function () {
      this.currentContentFragment = "";
      this.renderEmptyDetailPanel();
      this.updatePanelsArray();
      this.updateURL(false);
    },
    slicePanel: function (panel) {
      if (panel === this.sidebarPanel && this.currentContentFragment) {
        this.clearDetailPanel();
      }
    },
    resize: function () {
      return;
    },
    calculateLayout: function () {
      return false;
    },
    commitLayout: function () {
      return;
    },
    updateURL: function (noPush) {
      var targetFragment = this.currentContentFragment || this.currentSidebarFragment || "";
      if (targetFragment === this.fragment) return;
      this.fragment = targetFragment;
      if (noPush) return;
      Backbone.history.fragment = "??forceupdate";
      Backbone.history.navigate(targetFragment);
    },
  }));

  window.DDEX_DETAIL_LAYOUT = detailLayoutHelpers;
  window.DDEX_FIXED_LAYOUT = {
    PokedexEmptyDetailPanel: PokedexEmptyDetailPanel,
    PokedexFixedLayoutApp: PokedexFixedLayoutApp,
    getAppPathFromHref: getAppPathFromHref,
  };
})();
