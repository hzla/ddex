(function () {
  "use strict";

  var config = window.__DDEX_CONFIG__ || { target: "vercel", basePath: "" };
  var manifest = window.__DDEX_ASSET_MANIFEST__ || {};
  var scriptPromises = {};
  var stylePromises = {};
  var rawScriptPromises = {};
  var rawModulePromises = {};
  var appReadyPromise = null;
  var romToolsPromise = null;
  var basePath = normalizeBasePath(config.basePath || "");
  var romAssetVersion = config.romAssetVersion || "";
  var embeddedMode = detectEmbeddedMode(window.location.search);

  function normalizeBasePath(value) {
    value = String(value || "").trim();
    if (!value || value === "/") return "";
    if (value.charAt(0) !== "/") value = "/" + value;
    return value.replace(/\/+$/, "");
  }

  function withBase(path) {
    if (!path || typeof path !== "string") return path;
    if (/^(?:[a-z]+:)?\/\//i.test(path) || path.charAt(0) !== "/") return path;
    if (!basePath) return path;
    if (path === basePath || path.indexOf(basePath + "/") === 0) return path;
    if (path === "/") return basePath + "/";
    return basePath + path;
  }

  function withRawAssetVersion(src) {
    if (!romAssetVersion || typeof src !== "string") return src;
    if (!src.startsWith("/rom/")) return src;
    var separator = src.indexOf("?") >= 0 ? "&" : "?";
    return src + separator + "v=" + encodeURIComponent(romAssetVersion);
  }

  function stripBase(pathname) {
    pathname = pathname || "/";
    if (!basePath) return pathname;
    if (pathname === basePath) return "/";
    if (pathname.indexOf(basePath + "/") === 0) {
      return pathname.slice(basePath.length) || "/";
    }
    return pathname;
  }

  function routerRoot() {
    return withBase("/");
  }

  function isTruthyParamValue(value) {
    if (value == null) return false;
    value = String(value).trim().toLowerCase();
    return value !== "" && value !== "0" && value !== "false" && value !== "off" && value !== "no";
  }

  function detectEmbeddedMode(search) {
    var params = new URLSearchParams(search || "");
    if (params.has("embedded")) {
      return isTruthyParamValue(params.get("embedded"));
    }
    try {
      return window.self !== window.top;
    } catch (error) {
      return true;
    }
  }

  function applyEmbeddedModeClasses() {
    if (!embeddedMode) return;
    document.documentElement.classList.add("ddex-embedded");
    if (document.body) {
      document.body.classList.add("ddex-embedded");
    }
  }

  function rewriteAttribute(el, attr) {
    if (!el || !el.getAttribute) return;
    var value = el.getAttribute(attr);
    if (!value) return;
    var nextValue = withBase(value);
    if (nextValue !== value) {
      el.setAttribute(attr, nextValue);
    }
  }

  function rewriteSubtree(rootNode) {
    if (!rootNode || !rootNode.querySelectorAll) return;
    var nodes = [];
    if (rootNode.matches) nodes.push(rootNode);
    var descendants = rootNode.querySelectorAll("a[href], img[src], audio[src]");
    for (var i = 0; i < descendants.length; i++) {
      nodes.push(descendants[i]);
    }
    for (var j = 0; j < nodes.length; j++) {
      rewriteAttribute(nodes[j], "href");
      rewriteAttribute(nodes[j], "src");
    }
  }

  window.DDEXPaths = {
    basePath: basePath,
    rewriteSubtree: rewriteSubtree,
    routerRoot: routerRoot,
    stripBase: stripBase,
    withBase: withBase,
  };

  function getRouteInfo() {
    var rawPathname = window.location.pathname || "/";
    var pathname = stripBase(rawPathname) || "/";
    var trimmed = pathname.replace(/^\/+|\/+$/g, "");
    var segments = trimmed ? trimmed.split("/") : [];
    var params = new URLSearchParams(window.location.search);
    var topLevelRoutes = {
      pokemon: 1,
      moves: 1,
      items: 1,
      abilities: 1,
      types: 1,
      egggroups: 1,
      encounters: 1,
    };
    var listRoutes = {
      pokemon: 1,
      moves: 1,
      encounters: 1,
    };
    var isRoot = pathname === "/";
    var isDetailRoute = segments.length > 1 && !!topLevelRoutes[segments[0]];
    var isSearchRoute = segments.length === 1 && !!listRoutes[segments[0]];
    var isQueryRoute = segments.length === 1 && !!segments[0] && !topLevelRoutes[segments[0]];
    return {
      pathname: pathname,
      rawPathname: rawPathname,
      params: params,
      game: params.get("game"),
      isRoot: isRoot,
      isDetailRoute: isDetailRoute,
      isSearchRoute: isSearchRoute,
      isQueryRoute: isQueryRoute,
      needsImmediateBoot: true,
    };
  }

  function getPanelBody() {
    var body =
      document.querySelector(".ddex-content-slot .pfx-body") ||
      document.querySelector(".pfx-panel .pfx-body");
    if (!body) {
      document.body.innerHTML =
        '<div class="ddex-shell">' +
        '<div class="ddex-slot ddex-sidebar-slot"></div>' +
        '<div class="ddex-slot ddex-content-slot"><div class="pfx-panel ddex-content-panel"><div class="pfx-body"><p>Loading...</p></div></div></div>' +
        "</div>";
      body = document.querySelector(".ddex-content-slot .pfx-body");
    }
    return body;
  }

  function renderRootShell() {
    var body = getPanelBody();
    body.innerHTML =
      '<form class="pokedex ddex-shell">' +
      '<h1 id="dex-title"><a href="' + withBase("/") + '" data-target="replace">Pok&eacute;dex</a></h1>' +
      '<ul class="tabbar centered" style="margin-bottom: 7px">' +
      '<li><button class="button nav-first cur" type="button" data-fragment="">Search</button></li>' +
      '<li><button class="button" type="button" data-fragment="pokemon/">Mons</button></li>' +
      '<li><button class="button" type="button" data-fragment="encounters/">Areas</button></li>' +
      '<li><button class="button nav-last" type="button" data-fragment="moves/">Moves</button></li>' +
      "</ul>" +
      '<div class="searchboxwrapper">' +
      '<input class="textbox searchbox" type="search" autocomplete="off" placeholder="Search mons, moves, abilities, items, encounters or more" />' +
      "</div>" +
      '<p style="margin: 10px 0 0; color: #666;">Focus the search box or open a tab to load the dex.</p>' +
      "</form>";
    rewriteSubtree(body);

    var input = body.querySelector(".searchbox");
    var buttons = body.querySelectorAll("[data-fragment]");

    input.addEventListener("focus", function () {
      queueRootInteraction({ focus: true, query: input.value || "" });
    });
    input.addEventListener("input", function () {
      queueRootInteraction({ focus: true, query: input.value || "" });
    });
    input.addEventListener("keydown", function () {
      queueRootInteraction({ focus: true, query: input.value || "" });
    });
    buttons.forEach(function (button) {
      button.addEventListener("click", function () {
        queueRootInteraction({
          fragment: button.getAttribute("data-fragment") || "",
          focus: true,
          query: input.value || "",
        });
      });
    });
  }

  function queueRootInteraction(nextState) {
    var current = window.__DDEX_BOOTSTRAP__.pendingState || {};
    window.__DDEX_BOOTSTRAP__.pendingState = {
      focus: nextState.focus || current.focus || false,
      fragment:
        typeof nextState.fragment === "string" ? nextState.fragment : current.fragment,
      query: typeof nextState.query === "string" ? nextState.query : current.query,
    };
    ensureAppReady().then(replayPendingState).catch(reportBootFailure);
  }

  function reportBootFailure(error) {
    var body = getPanelBody();
    body.innerHTML =
      '<p><strong>Failed to load Dynamic Dex.</strong></p><p>' +
      escapeHtml(error && error.message ? error.message : String(error)) +
      "</p>";
    console.error(error);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function loadScriptTag(src, options) {
    src = withBase(src);
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[src="' + src + '"]');
      if (existing) {
        if (existing.dataset.ddexLoaded === "1") {
          resolve(true);
          return;
        }
        existing.addEventListener("load", function () {
          resolve(true);
        }, { once: true });
        existing.addEventListener("error", function (error) {
          reject(error);
        }, { once: true });
        return;
      }

      var script = document.createElement("script");
      script.src = src;
      if (options && options.type) {
        script.type = options.type;
      }
      script.onload = function () {
        script.dataset.ddexLoaded = "1";
        resolve(true);
      };
      script.onerror = function () {
        reject(new Error("Failed to load " + src));
      };
      document.body.appendChild(script);
    });
  }

  function loadStyleTag(href) {
    href = withBase(href);
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('link[rel="stylesheet"][href="' + href + '"]');
      if (existing) {
        resolve(true);
        return;
      }

      var link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.onload = function () {
        resolve(true);
      };
      link.onerror = function () {
        reject(new Error("Failed to load " + href));
      };
      document.head.appendChild(link);
    });
  }

  function loadAsset(name) {
    if (scriptPromises[name]) return scriptPromises[name];
    var src = manifest[name];
    if (!src) {
      return Promise.reject(new Error("Unknown asset chunk: " + name));
    }
    scriptPromises[name] = loadScriptTag(src);
    return scriptPromises[name];
  }

  function loadStyleAsset(name, fallbackHref) {
    var key = name + "::style";
    if (stylePromises[key]) return stylePromises[key];
    var href = manifest[name] || fallbackHref;
    if (!href) {
      return Promise.reject(new Error("Unknown style chunk: " + name));
    }
    stylePromises[key] = loadStyleTag(href);
    return stylePromises[key];
  }

  function loadRawScript(src) {
    var versionedSrc = withRawAssetVersion(src);
    if (rawScriptPromises[versionedSrc]) return rawScriptPromises[versionedSrc];
    rawScriptPromises[versionedSrc] = loadScriptTag(versionedSrc);
    return rawScriptPromises[versionedSrc];
  }

  function loadRawModule(src) {
    var versionedSrc = withRawAssetVersion(src);
    if (rawModulePromises[versionedSrc]) return rawModulePromises[versionedSrc];
    rawModulePromises[versionedSrc] = loadScriptTag(versionedSrc, { type: "module" });
    return rawModulePromises[versionedSrc];
  }

  async function hydrateCachedOverrides(routeInfo) {
    var api = window.DDEX_OVERRIDES_API;
    if (!api) {
      throw new Error("Override runtime did not initialize.");
    }
    return api.hydrateCachedOverrides(routeInfo);
  }

  async function resolveRequestedOverrides(routeInfo) {
    var api = window.DDEX_OVERRIDES_API;
    if (!api || !routeInfo.game) return false;
    return api.loadRequestedGameOverrides(routeInfo.game);
  }

  function startApp() {
    if (typeof window.startPokedexApp !== "function") {
      throw new Error("Router runtime is not ready.");
    }
    return window.startPokedexApp();
  }

  function getActiveSearchPanel() {
    var app = window.pokedex;
    if (!app) return null;
    if (app.sidebarPanel && typeof app.sidebarPanel.find === "function") {
      return app.sidebarPanel;
    }
    if (!app.panels || typeof app.i !== "number") return null;
    var panel = app.panels[app.i];
    if (!panel || typeof panel.find !== "function") return null;
    return panel;
  }

  function replayPendingState() {
    var pending = window.__DDEX_BOOTSTRAP__.pendingState;
    if (!pending || !window.pokedex) return;
    var panel = getActiveSearchPanel();

    if (pending.fragment) {
      window.pokedex.go(pending.fragment, panel || null, true, null, true);
    }

    setTimeout(function () {
      var activePanel = getActiveSearchPanel();
      if (!activePanel) return;

      if (typeof pending.query === "string") {
        activePanel.$searchbox.val(pending.query);
        activePanel.find(pending.query);
        if (pending.query && typeof activePanel.checkExactMatch === "function") {
          activePanel.checkExactMatch();
        }
      }

      if (pending.focus && activePanel.$searchbox) {
        activePanel.$searchbox.focus();
      }

      window.__DDEX_BOOTSTRAP__.pendingState = null;
    }, 0);
  }

  async function ensureAppReady() {
    if (appReadyPromise) return appReadyPromise;

    appReadyPromise = (async function () {
      var routeInfo = getRouteInfo();
      await loadAsset("base-data");
      await loadAsset("detail-data");
      await loadAsset("override-runtime");
      await hydrateCachedOverrides(routeInfo);
      await resolveRequestedOverrides(routeInfo);
      startApp();
      return true;
    })();

    return appReadyPromise;
  }

  function ensureRomTools() {
    if (romToolsPromise) return romToolsPromise;
    romToolsPromise = loadAsset("rom-tools").then(function () {
      if (window.DDEX_ROM_TOOLS && typeof window.DDEX_ROM_TOOLS.ensureLoaded === "function") {
        return window.DDEX_ROM_TOOLS.ensureLoaded();
      }
      return true;
    });
    return romToolsPromise;
  }

  function ensureEmbeddedStyles() {
    if (!embeddedMode) return Promise.resolve(false);
    applyEmbeddedModeClasses();
    return loadStyleAsset("embedded", "/theme/embedded.css");
  }

  window.__DDEX_BOOTSTRAP__ = {
    embeddedMode: embeddedMode,
    pendingState: null,
    getRouteInfo: getRouteInfo,
    loadAsset: loadAsset,
    loadStyleAsset: loadStyleAsset,
    loadRawScript: loadRawScript,
    loadRawModule: loadRawModule,
    ensureAppReady: ensureAppReady,
    ensureRomTools: ensureRomTools,
    replayPendingState: replayPendingState,
  };

  if (window.BattleSearch) {
    window.BattleSearch.urlRoot = routerRoot();
  }

  ensureEmbeddedStyles().catch(function (error) {
    console.warn(error);
  });

  if (getRouteInfo().needsImmediateBoot) {
    ensureAppReady().catch(reportBootFailure);
  } else {
    renderRootShell();
  }
})();
