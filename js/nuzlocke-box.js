(function () {
  "use strict";

  var BOX_ENDPOINTS = [
    "http://127.0.0.1:31124/box",
    "http://localhost:31124/box",
  ];
  var BOX_CACHE_KEY = "ddexNuzlockeEncounterCacheV1";
  var BOX_CACHE_VERSION = 1;
  var BOX_FETCH_TIMEOUT = 1500;
  var BOX_BRIDGE_TIMEOUT = 1500;
  var BOX_MESSAGE_REQUEST_TYPE = "ddex:nuzlocke-box:request";
  var BOX_MESSAGE_RESPONSE_TYPE = "ddex:nuzlocke-box:response";

  var listeners = new Set();
  var inFlightPromise = null;
  var currentState = createDerivedState("none", [], {
    lastCheckedAt: null,
    lastSuccessAt: null,
  });
  var currentSignature = buildStateSignature(currentState.source, currentState.records);

  function safeNow() {
    return Date.now ? Date.now() : new Date().getTime();
  }

  function cleanText(value) {
    return String(value || "").trim();
  }

  function normalizeLocationText(value) {
    if (typeof cleanString === "function") {
      return cleanString(value);
    }
    return cleanText(value).replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  }

  function stripSectionNameSuffix(value) {
    return cleanText(value).replace(/\s+section\s+\d+\s*$/i, "");
  }

  function stripSectionIdSuffix(value) {
    return cleanText(value).replace(/section\d+\s*$/i, "");
  }

  function canonicalizeSpeciesName(name) {
    var text = cleanText(name);
    if (!text) return "";
    if (typeof resolveCanonicalSpeciesName === "function") {
      var resolvedName = resolveCanonicalSpeciesName(text);
      if (resolvedName) return resolvedName;
    }
    if (window.Dex && Dex.species && typeof Dex.species.get === "function") {
      var template = Dex.species.get(text);
      if (template && template.exists) return template.name;
    }
    return "";
  }

  function parseSpeciesLine(line) {
    var text = cleanText(line);
    if (!text) return "";

    var itemIndex = text.indexOf(" @ ");
    if (itemIndex >= 0) {
      text = cleanText(text.slice(0, itemIndex));
    }

    text = cleanText(text.replace(/\s+\((?:M|F)\)\s*$/i, ""));

    var parentheticalMatch = text.match(/\(([^()]+)\)\s*$/);
    if (parentheticalMatch) {
      var innerText = cleanText(parentheticalMatch[1]);
      if (innerText && !/^(?:M|F)$/i.test(innerText)) {
        text = innerText;
      }
    }

    return canonicalizeSpeciesName(text);
  }

  function parseBoxPayload(text) {
    var normalizedText = String(text || "").replace(/\r/g, "");
    if (!normalizedText.trim()) return [];

    var blocks = normalizedText.split(/\n\s*\n+/);
    var records = [];
    var sawNonEmptyBlock = false;

    for (var i = 0; i < blocks.length; i++) {
      var block = cleanText(blocks[i]);
      if (!block) continue;
      sawNonEmptyBlock = true;

      var lines = block.split("\n");
      var firstLine = "";
      var metLocation = "";

      for (var j = 0; j < lines.length; j++) {
        var line = cleanText(lines[j]);
        if (!line) continue;
        if (!firstLine) firstLine = line;
        if (!metLocation) {
          var metMatch = line.match(/^Met:\s*(.*)$/i);
          if (metMatch) metLocation = cleanText(metMatch[1]);
        }
      }

      var speciesName = parseSpeciesLine(firstLine);
      if (!speciesName || !metLocation) continue;

      records.push({
        species: speciesName,
        location: metLocation,
      });
    }

    if (!records.length && sawNonEmptyBlock) return null;
    return records;
  }

  function addUnique(list, value) {
    if (list.indexOf(value) >= 0) return;
    list.push(value);
  }

  function registerAlias(aliasToGroup, rawValue, groupKey) {
    var normalizedValue = normalizeLocationText(rawValue);
    if (!normalizedValue || aliasToGroup.has(normalizedValue)) return;
    aliasToGroup.set(normalizedValue, groupKey);
  }

  function getLocationGroupKey(locationId, location) {
    var locationNameId = Number.parseInt(
      location && location.locationNameId,
      10,
    );
    if (Number.isFinite(locationNameId)) {
      return "id:" + locationNameId;
    }

    var baseName = normalizeLocationText(stripSectionNameSuffix(location && location.name));
    if (baseName) return "name:" + baseName;

    var baseId = normalizeLocationText(stripSectionIdSuffix(locationId));
    if (baseId) return "name:" + baseId;

    return "name:" + normalizeLocationText(locationId);
  }

  function buildLocationIndex() {
    var aliasToGroup = new Map();
    var groupToLocationIds = new Map();
    var locationIdToGroup = new Map();
    var locationIds = window.BattleLocationdex || {};

    for (var locationId in locationIds) {
      if (locationId === "rates") continue;
      if (!Object.prototype.hasOwnProperty.call(locationIds, locationId)) continue;

      var location = locationIds[locationId];
      if (!location || !location.name) continue;

      var groupKey = getLocationGroupKey(locationId, location);
      locationIdToGroup.set(locationId, groupKey);

      if (!groupToLocationIds.has(groupKey)) {
        groupToLocationIds.set(groupKey, []);
      }
      groupToLocationIds.get(groupKey).push(locationId);

      registerAlias(aliasToGroup, locationId, groupKey);
      registerAlias(aliasToGroup, location.name, groupKey);
      registerAlias(aliasToGroup, stripSectionNameSuffix(location.name), groupKey);
      registerAlias(aliasToGroup, stripSectionIdSuffix(locationId), groupKey);
    }

    return {
      aliasToGroup: aliasToGroup,
      groupToLocationIds: groupToLocationIds,
      locationIdToGroup: locationIdToGroup,
    };
  }

  function normalizeRecords(records) {
    var normalizedRecords = [];
    if (!Array.isArray(records)) return normalizedRecords;

    for (var i = 0; i < records.length; i++) {
      var record = records[i] || {};
      var speciesName = canonicalizeSpeciesName(record.species);
      var locationName = cleanText(record.location);
      if (!speciesName || !locationName) continue;
      normalizedRecords.push({
        species: speciesName,
        location: locationName,
      });
    }

    return normalizedRecords;
  }

  function createDerivedState(source, records, meta) {
    var normalizedRecords = normalizeRecords(records);
    var locationIndex = buildLocationIndex();
    var speciesIds = new Set();
    var locationGroupToSpecies = new Map();
    var locationIdsToSpecies = new Map();

    for (var i = 0; i < normalizedRecords.length; i++) {
      var record = normalizedRecords[i];
      var speciesId = normalizeLocationText(record.species);
      if (!speciesId) continue;
      speciesIds.add(speciesId);

      var groupKey = locationIndex.aliasToGroup.get(
        normalizeLocationText(record.location),
      );
      if (!groupKey) continue;

      if (!locationGroupToSpecies.has(groupKey)) {
        locationGroupToSpecies.set(groupKey, []);
      }
      addUnique(locationGroupToSpecies.get(groupKey), speciesId);
    }

    locationIndex.locationIdToGroup.forEach(function (groupKey, locationId) {
      var speciesList = locationGroupToSpecies.get(groupKey) || [];
      locationIdsToSpecies.set(locationId, speciesList.slice());
    });

    return {
      source: source,
      hasData: source !== "none",
      lastCheckedAt:
        meta && meta.lastCheckedAt !== undefined ? meta.lastCheckedAt : null,
      lastSuccessAt:
        meta && meta.lastSuccessAt !== undefined ? meta.lastSuccessAt : null,
      records: normalizedRecords,
      speciesIds: speciesIds,
      locationIdsToSpecies: locationIdsToSpecies,
      locationGroupToSpecies: locationGroupToSpecies,
      locationIdToGroup: locationIndex.locationIdToGroup,
    };
  }

  function buildStateSignature(source, records) {
    var parts = [source];
    var sortedRecords = normalizeRecords(records).slice();

    sortedRecords.sort(function (recordA, recordB) {
      var keyA = recordA.species + "|" + recordA.location;
      var keyB = recordB.species + "|" + recordB.location;
      if (keyA < keyB) return -1;
      if (keyA > keyB) return 1;
      return 0;
    });

    for (var i = 0; i < sortedRecords.length; i++) {
      parts.push(sortedRecords[i].species + "|" + sortedRecords[i].location);
    }

    return parts.join("||");
  }

  function notifyListeners() {
    listeners.forEach(function (listener) {
      try {
        listener(currentState);
      } catch (error) {
        console.error("Failed to handle nuzlocke box update", error);
      }
    });
  }

  function logEncounterState(state) {
    if (!state) return;
    console.log(
      "[DDEX Nuzlocke] encounter data:",
      state.hasData ? "available" : "missing",
      "| source:",
      state.source,
      "| records:",
      state.records.length,
    );
  }

  function setState(source, records, meta) {
    currentState = createDerivedState(source, records, meta);
    var nextSignature = buildStateSignature(currentState.source, currentState.records);
    if (nextSignature === currentSignature) {
      logEncounterState(currentState);
      return currentState;
    }
    currentSignature = nextSignature;
    logEncounterState(currentState);
    notifyListeners();
    return currentState;
  }

  function safeLoadCache() {
    try {
      var rawValue = localStorage.getItem(BOX_CACHE_KEY);
      if (!rawValue) return null;

      var parsed = JSON.parse(rawValue);
      if (!parsed || parsed.version !== BOX_CACHE_VERSION) return null;
      if (!Array.isArray(parsed.records)) return null;

      return {
        savedAt: Number.isFinite(parsed.savedAt) ? parsed.savedAt : null,
        records: normalizeRecords(parsed.records),
      };
    } catch (error) {
      console.warn("Failed to load cached nuzlocke encounter data", error);
      return null;
    }
  }

  function safeSaveCache(records) {
    try {
      localStorage.setItem(
        BOX_CACHE_KEY,
        JSON.stringify({
          version: BOX_CACHE_VERSION,
          savedAt: safeNow(),
          records: normalizeRecords(records),
        }),
      );
    } catch (error) {
      console.warn("Failed to cache nuzlocke encounter data", error);
    }
  }

  function hydrateFromCache() {
    var cached = safeLoadCache();
    if (!cached) {
      currentState = createDerivedState("none", [], {
        lastCheckedAt: null,
        lastSuccessAt: null,
      });
      currentSignature = buildStateSignature(currentState.source, currentState.records);
      return;
    }

    currentState = createDerivedState("cache", cached.records, {
      lastCheckedAt: null,
      lastSuccessAt: cached.savedAt,
    });
    currentSignature = buildStateSignature(currentState.source, currentState.records);
  }

  function fetchBoxTextFromEndpoint(endpoint) {
    if (typeof window.fetch !== "function") {
      return Promise.reject(new Error("fetch is unavailable"));
    }

    var controller =
      typeof window.AbortController === "function" ? new AbortController() : null;
    var timeoutId = null;

    if (controller) {
      timeoutId = setTimeout(function () {
        controller.abort();
      }, BOX_FETCH_TIMEOUT);
    }

    return window
      .fetch(endpoint, {
        method: "GET",
        cache: "no-store",
        signal: controller ? controller.signal : undefined,
      })
      .then(function (response) {
        if (!response || response.status !== 200) {
          throw new Error("Unexpected response status: " + (response && response.status));
        }
        return response.text();
      })
      .finally(function () {
        if (timeoutId !== null) clearTimeout(timeoutId);
      });
  }

  function fetchBoxTextDirect() {
    var endpointIndex = 0;
    var lastError = null;

    function tryNextEndpoint() {
      if (endpointIndex >= BOX_ENDPOINTS.length) {
        return Promise.reject(lastError || new Error("No box endpoints configured"));
      }

      var endpoint = BOX_ENDPOINTS[endpointIndex++];
      return fetchBoxTextFromEndpoint(endpoint).catch(function (error) {
        lastError = new Error(
          endpoint + " failed: " + (error && error.message ? error.message : String(error)),
        );
        return tryNextEndpoint();
      });
    }

    return tryNextEndpoint();
  }

  function getParentOrigin() {
    try {
      if (!document.referrer) return "";
      return new URL(document.referrer).origin;
    } catch (error) {
      return "";
    }
  }

  function fetchBoxTextFromParentBridge() {
    if (!window.parent || window.parent === window) {
      return Promise.reject(new Error("No parent window is available"));
    }
    if (typeof window.parent.postMessage !== "function") {
      return Promise.reject(new Error("Parent postMessage is unavailable"));
    }

    return new Promise(function (resolve, reject) {
      var requestId =
        "ddex-box-" +
        safeNow() +
        "-" +
        Math.random().toString(16).slice(2);
      var targetOrigin = getParentOrigin() || "*";
      var timeoutId = null;

      function cleanup() {
        window.removeEventListener("message", handleMessage);
        if (timeoutId !== null) clearTimeout(timeoutId);
      }

      function handleMessage(event) {
        var data = event.data || {};
        if (event.source !== window.parent) return;
        if (data.type !== BOX_MESSAGE_RESPONSE_TYPE) return;
        if (data.requestId !== requestId) return;

        cleanup();

        if (data.ok && typeof data.payloadText === "string") {
          resolve(data.payloadText);
          return;
        }

        reject(
          new Error(
            cleanText(data.error) || "Parent bridge returned an invalid /box payload",
          ),
        );
      }

      timeoutId = setTimeout(function () {
        cleanup();
        reject(new Error("Timed out waiting for parent bridge /box response"));
      }, BOX_BRIDGE_TIMEOUT);

      window.addEventListener("message", handleMessage);
      window.parent.postMessage(
        {
          type: BOX_MESSAGE_REQUEST_TYPE,
          requestId: requestId,
        },
        targetOrigin,
      );
    });
  }

  function fetchBoxText() {
    return fetchBoxTextDirect().catch(function (directError) {
      return fetchBoxTextFromParentBridge().catch(function (bridgeError) {
        throw new Error(
          "Direct /box fetch failed (" +
            (directError && directError.message
              ? directError.message
              : String(directError)) +
            "); parent bridge failed (" +
            (bridgeError && bridgeError.message
              ? bridgeError.message
              : String(bridgeError)) +
            ")",
        );
      });
    });
  }

  function refreshForNavigation(context) {
    if (inFlightPromise) return inFlightPromise;

    var lastCheckedAt = safeNow();
    var previousSuccessAt = currentState.lastSuccessAt;

    inFlightPromise = fetchBoxText()
      .then(function (payloadText) {
        var parsedRecords = parseBoxPayload(payloadText);
        if (parsedRecords === null) {
          throw new Error("Malformed /box payload");
        }
        safeSaveCache(parsedRecords);
        return setState("live", parsedRecords, {
          lastCheckedAt: lastCheckedAt,
          lastSuccessAt: safeNow(),
        });
      })
      .catch(function (error) {
        console.warn("Unable to refresh nuzlocke encounter data", {
          error: error,
          context: context || null,
        });

        var cached = safeLoadCache();
        if (cached) {
          return setState("cache", cached.records, {
            lastCheckedAt: lastCheckedAt,
            lastSuccessAt: cached.savedAt,
          });
        }

        return setState("none", [], {
          lastCheckedAt: lastCheckedAt,
          lastSuccessAt: previousSuccessAt,
        });
      })
      .finally(function () {
        inFlightPromise = null;
      });

    return inFlightPromise;
  }

  function getLocationSummary(locationId) {
    var locationKey = cleanText(locationId);
    var speciesIds = locationKey
      ? currentState.locationIdsToSpecies.get(locationKey) || []
      : [];

    return {
      hasCaughtHere: speciesIds.length > 0,
      speciesIds: speciesIds.slice(),
      caughtSpeciesIds: speciesIds.slice(),
      source: currentState.source,
    };
  }

  function getEncounterRowState(locationId, speciesId) {
    var normalizedSpeciesId = normalizeLocationText(speciesId);
    if (!normalizedSpeciesId) {
      return {
        caughtHere: false,
        ownedElsewhere: false,
      };
    }

    var summary = getLocationSummary(locationId);
    var caughtHere = summary.speciesIds.indexOf(normalizedSpeciesId) >= 0;

    return {
      caughtHere: caughtHere,
      ownedElsewhere: !caughtHere && currentState.speciesIds.has(normalizedSpeciesId),
    };
  }

  var api = {
    refreshForNavigation: refreshForNavigation,
    getState: function () {
      return currentState;
    },
    subscribe: function (listener) {
      if (typeof listener !== "function") return;
      listeners.add(listener);
    },
    unsubscribe: function (listener) {
      listeners.delete(listener);
    },
    getLocationSummary: getLocationSummary,
    getEncounterRowState: getEncounterRowState,
  };

  hydrateFromCache();
  window.DDEX_NUZLOCKE_BOX = api;

  if (window.Backbone && Backbone.history && typeof Backbone.history.on === "function") {
    Backbone.history.on("route", function () {
      api.refreshForNavigation({
        fragment: Backbone.history && Backbone.history.fragment,
      });
    });
  }

  api.refreshForNavigation({
    fragment: window.location && window.location.hash,
    initial: true,
  });
})();
