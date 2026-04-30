(function () {
  "use strict";

  var BOX_ENDPOINTS = [
    "http://127.0.0.1:31124/box",
    "http://localhost:31124/box",
  ];
  var BOX_CACHE_KEY = "ddexNuzlockeEncounterCacheV1";
  var MISSED_LOCATION_CACHE_KEY_PREFIX = "ddexNuzlockeMissedLocationsV1";
  var MANUAL_CAUGHT_CACHE_KEY_PREFIX = "ddexNuzlockeManualCaughtV1";
  var BOX_CACHE_VERSION = 1;
  var BOX_FETCH_TIMEOUT = 1500;
  var BOX_BRIDGE_TIMEOUT = 12000;
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

  function logBridge(eventName, details) {
    if (details !== undefined) {
      console.log("[DDEX Nuzlocke][Dex]", eventName, details);
      return;
    }
    console.log("[DDEX Nuzlocke][Dex]", eventName);
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

  function getScopedCacheKey(prefix) {
    var parts = [
      cleanText(localStorage.getItem("game")),
      cleanText(localStorage.getItem("romTitle")),
      cleanText(localStorage.getItem("gameTitle")),
    ];
    var namespace = "";

    for (var i = 0; i < parts.length; i++) {
      if (!parts[i]) continue;
      namespace = normalizeLocationText(parts[i]);
      if (namespace) break;
    }

    return namespace ? prefix + ":" + namespace : prefix;
  }

  function getMissedLocationCacheKey() {
    return getScopedCacheKey(MISSED_LOCATION_CACHE_KEY_PREFIX);
  }

  function getManualCaughtCacheKey() {
    return getScopedCacheKey(MANUAL_CAUGHT_CACHE_KEY_PREFIX);
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

  var familyCache = Object.create(null);

  function getSpeciesTemplate(speciesRef) {
    if (!speciesRef) return null;

    if (window.Dex && Dex.species && typeof Dex.species.get === "function") {
      var dexTemplate = Dex.species.get(speciesRef);
      if (dexTemplate && dexTemplate.exists) return dexTemplate;
    }

    var speciesId = normalizeLocationText(speciesRef);
    if (speciesId && window.BattlePokedex && window.BattlePokedex[speciesId]) {
      return window.BattlePokedex[speciesId];
    }

    return null;
  }

  function getCanonicalSpeciesId(speciesRef) {
    var template = getSpeciesTemplate(speciesRef);
    if (template) {
      return normalizeLocationText(template.id || template.name || speciesRef);
    }
    return normalizeLocationText(speciesRef);
  }

  function getSpeciesDisplayName(speciesRef) {
    var template = getSpeciesTemplate(speciesRef);
    if (template && template.name) return template.name;
    return cleanText(speciesRef);
  }

  function getFamilyInfo(speciesRef) {
    var speciesId = getCanonicalSpeciesId(speciesRef);
    if (!speciesId) {
      return {
        key: "",
        ancestorName: "",
        memberIds: [],
      };
    }
    if (familyCache[speciesId]) return familyCache[speciesId];

    var speciesName =
      canonicalizeSpeciesName(speciesRef) ||
      getSpeciesDisplayName(speciesRef) ||
      speciesId;
    var speciesRecord =
      window.evoData && speciesName ? window.evoData[speciesName] : null;
    var ancestorName =
      speciesRecord && speciesRecord.anc ? speciesRecord.anc : speciesName;
    var ancestorRecord =
      window.evoData && ancestorName ? window.evoData[ancestorName] : null;

    var familyNames = [];
    if (ancestorName) familyNames.push(ancestorName);
    if (ancestorRecord && Array.isArray(ancestorRecord.evos)) {
      familyNames = familyNames.concat(ancestorRecord.evos);
    }
    if (!familyNames.length) familyNames.push(speciesName || speciesId);

    var seen = Object.create(null);
    var memberIds = [];
    for (var i = 0; i < familyNames.length; i++) {
      var memberId = getCanonicalSpeciesId(familyNames[i]);
      if (!memberId || seen[memberId]) continue;
      seen[memberId] = true;
      memberIds.push(memberId);
    }

    if (!memberIds.length) memberIds.push(speciesId);

    var ancestorId =
      getCanonicalSpeciesId(ancestorName || speciesName || speciesRef) || speciesId;
    var info = {
      key: ancestorId,
      ancestorName:
        getSpeciesDisplayName(ancestorName || speciesName || speciesRef) ||
        ancestorName ||
        speciesName ||
        speciesId,
      memberIds: memberIds,
    };
    familyCache[speciesId] = info;
    return info;
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
      var isDead = false;

      for (var j = 0; j < lines.length; j++) {
        var line = cleanText(lines[j]);
        if (!line) continue;
        if (!firstLine) firstLine = line;
        if (/^Dead:\s*Yes\s*$/i.test(line)) {
          isDead = true;
        }
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
        dead: isDead,
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
        dead: !!record.dead,
      });
    }

    return normalizedRecords;
  }

  function normalizeManualCaughtRecords(records) {
    var normalizedRecords = [];
    var seen = Object.create(null);
    if (!Array.isArray(records)) return normalizedRecords;

    for (var i = 0; i < records.length; i++) {
      var record = records[i] || {};
      var speciesName = canonicalizeSpeciesName(record.species);
      var locationId = cleanText(record.locationId || record.location);
      if (!speciesName || !locationId) continue;

      var key = locationId + "|" + normalizeLocationText(speciesName);
      if (seen[key]) continue;
      seen[key] = true;
      normalizedRecords.push({
        species: speciesName,
        locationId: locationId,
      });
    }

    normalizedRecords.sort(function (recordA, recordB) {
      var keyA = recordA.locationId + "|" + recordA.species;
      var keyB = recordB.locationId + "|" + recordB.species;
      if (keyA < keyB) return -1;
      if (keyA > keyB) return 1;
      return 0;
    });

    return normalizedRecords;
  }

  function loadManualCaughtRecords() {
    try {
      var rawValue = localStorage.getItem(getManualCaughtCacheKey());
      if (!rawValue) return [];

      var parsed = JSON.parse(rawValue);
      if (!Array.isArray(parsed)) return [];
      return normalizeManualCaughtRecords(parsed);
    } catch (error) {
      console.warn("Failed to load manual caught encounter data", error);
      return [];
    }
  }

  function saveManualCaughtRecords(records) {
    try {
      var normalizedRecords = normalizeManualCaughtRecords(records);
      if (!normalizedRecords.length) {
        localStorage.removeItem(getManualCaughtCacheKey());
        return;
      }
      localStorage.setItem(
        getManualCaughtCacheKey(),
        JSON.stringify(normalizedRecords),
      );
    } catch (error) {
      console.warn("Failed to save manual caught encounter data", error);
    }
  }

  function addSpeciesToGroupMaps(
    locationGroupToSpecies,
    locationGroupToDeadSpecies,
    locationGroupToSpeciesEntries,
    groupKey,
    speciesId,
    isDead,
  ) {
    if (!groupKey || !speciesId) return;

    if (!locationGroupToSpecies.has(groupKey)) {
      locationGroupToSpecies.set(groupKey, []);
    }
    addUnique(locationGroupToSpecies.get(groupKey), speciesId);

    if (isDead) {
      if (!locationGroupToDeadSpecies.has(groupKey)) {
        locationGroupToDeadSpecies.set(groupKey, []);
      }
      addUnique(locationGroupToDeadSpecies.get(groupKey), speciesId);
    }

    if (!locationGroupToSpeciesEntries.has(groupKey)) {
      locationGroupToSpeciesEntries.set(groupKey, Object.create(null));
    }
    var speciesEntryMap = locationGroupToSpeciesEntries.get(groupKey);
    if (!speciesEntryMap[speciesId]) {
      speciesEntryMap[speciesId] = {
        speciesId: speciesId,
        dead: false,
        alive: false,
      };
    }
    if (isDead) {
      speciesEntryMap[speciesId].dead = true;
    } else {
      speciesEntryMap[speciesId].alive = true;
    }
  }

  function loadMissedLocationGroups() {
    try {
      var rawValue = localStorage.getItem(getMissedLocationCacheKey());
      if (!rawValue) return new Set();

      var parsed = JSON.parse(rawValue);
      if (!Array.isArray(parsed)) return new Set();

      var missedLocationGroups = new Set();
      for (var i = 0; i < parsed.length; i++) {
        var groupKey = cleanText(parsed[i]);
        if (groupKey) missedLocationGroups.add(groupKey);
      }
      return missedLocationGroups;
    } catch (error) {
      console.warn("Failed to load missed nuzlocke locations", error);
      return new Set();
    }
  }

  function normalizeMissedLocationGroups(rawGroups, locationIndex) {
    var normalizedGroups = new Set();
    if (!rawGroups || typeof rawGroups.forEach !== "function") {
      return normalizedGroups;
    }

    rawGroups.forEach(function (rawGroup) {
      var groupKey = cleanText(rawGroup);
      if (!groupKey) return;
      if (locationIndex.groupToLocationIds.has(groupKey)) {
        normalizedGroups.add(groupKey);
        return;
      }
      if (locationIndex.locationIdToGroup.has(groupKey)) {
        normalizedGroups.add(locationIndex.locationIdToGroup.get(groupKey));
      }
    });

    return normalizedGroups;
  }

  function saveMissedLocationGroups(missedLocationGroups) {
    try {
      var serializedGroups = Array.from(missedLocationGroups || []).sort();
      if (!serializedGroups.length) {
        localStorage.removeItem(getMissedLocationCacheKey());
        return;
      }
      localStorage.setItem(
        getMissedLocationCacheKey(),
        JSON.stringify(serializedGroups),
      );
    } catch (error) {
      console.warn("Failed to save missed nuzlocke locations", error);
    }
  }

  function createDerivedState(source, records, meta) {
    var normalizedRecords = normalizeRecords(records);
    var manualCaughtRecords = normalizeManualCaughtRecords(
      meta && Array.isArray(meta.manualCaughtRecords)
        ? meta.manualCaughtRecords
        : loadManualCaughtRecords(),
    );
    var locationIndex = buildLocationIndex();
    var speciesIds = new Set();
    var liveSpeciesIds = new Set();
    var deadSpeciesIds = new Set();
    var manualCaughtSpeciesIds = new Set();
    var familyKeys = new Set();
    var liveFamilyKeys = new Set();
    var deadFamilyKeys = new Set();
    var manualCaughtFamilyKeys = new Set();
    var locationGroupToSpecies = new Map();
    var locationGroupToDeadSpecies = new Map();
    var locationGroupToSpeciesEntries = new Map();
    var liveLocationGroupToSpecies = new Map();
    var manualLocationGroupToSpecies = new Map();
    var locationIdsToSpecies = new Map();
    var locationIdsToLiveSpecies = new Map();
    var locationIdsToDeadSpecies = new Map();
    var locationIdsToSpeciesEntries = new Map();
    var locationIdsToManualSpecies = new Map();
    var missedLocationGroups = normalizeMissedLocationGroups(
      meta && meta.missedLocationGroups instanceof Set
        ? meta.missedLocationGroups
        : loadMissedLocationGroups(),
      locationIndex,
    );

    for (var i = 0; i < normalizedRecords.length; i++) {
      var record = normalizedRecords[i];
      var speciesId = normalizeLocationText(record.species);
      if (!speciesId) continue;
      var familyInfo = getFamilyInfo(speciesId);
      speciesIds.add(speciesId);
      liveSpeciesIds.add(speciesId);
      if (familyInfo && familyInfo.key) {
        familyKeys.add(familyInfo.key);
        liveFamilyKeys.add(familyInfo.key);
      }
      if (record.dead) {
        deadSpeciesIds.add(speciesId);
        if (familyInfo && familyInfo.key) {
          deadFamilyKeys.add(familyInfo.key);
        }
      }

      var groupKey = locationIndex.aliasToGroup.get(
        normalizeLocationText(record.location),
      );
      if (!groupKey) continue;

      addSpeciesToGroupMaps(
        locationGroupToSpecies,
        locationGroupToDeadSpecies,
        locationGroupToSpeciesEntries,
        groupKey,
        speciesId,
        record.dead,
      );

      if (!liveLocationGroupToSpecies.has(groupKey)) {
        liveLocationGroupToSpecies.set(groupKey, []);
      }
      addUnique(liveLocationGroupToSpecies.get(groupKey), speciesId);
    }

    for (var manualIndex = 0; manualIndex < manualCaughtRecords.length; manualIndex++) {
      var manualRecord = manualCaughtRecords[manualIndex];
      var manualSpeciesId = normalizeLocationText(manualRecord.species);
      if (!manualSpeciesId) continue;
      var manualFamilyInfo = getFamilyInfo(manualSpeciesId);

      speciesIds.add(manualSpeciesId);
      manualCaughtSpeciesIds.add(manualSpeciesId);
      if (manualFamilyInfo && manualFamilyInfo.key) {
        familyKeys.add(manualFamilyInfo.key);
        manualCaughtFamilyKeys.add(manualFamilyInfo.key);
      }

      var manualGroupKey =
        locationIndex.locationIdToGroup.get(manualRecord.locationId) ||
        locationIndex.aliasToGroup.get(normalizeLocationText(manualRecord.locationId));
      if (!manualGroupKey) continue;

      addSpeciesToGroupMaps(
        locationGroupToSpecies,
        locationGroupToDeadSpecies,
        locationGroupToSpeciesEntries,
        manualGroupKey,
        manualSpeciesId,
        false,
      );

      if (!manualLocationGroupToSpecies.has(manualGroupKey)) {
        manualLocationGroupToSpecies.set(manualGroupKey, []);
      }
      addUnique(manualLocationGroupToSpecies.get(manualGroupKey), manualSpeciesId);
    }

    locationIndex.locationIdToGroup.forEach(function (groupKey, locationId) {
      var speciesList = locationGroupToSpecies.get(groupKey) || [];
      var liveSpeciesList = liveLocationGroupToSpecies.get(groupKey) || [];
      var deadSpeciesList = locationGroupToDeadSpecies.get(groupKey) || [];
      var manualSpeciesList = manualLocationGroupToSpecies.get(groupKey) || [];
      var speciesEntryMap = locationGroupToSpeciesEntries.get(groupKey) || {};
      var speciesEntries = [];
      for (var speciesId in speciesEntryMap) {
        if (!Object.prototype.hasOwnProperty.call(speciesEntryMap, speciesId)) continue;
        var speciesEntry = speciesEntryMap[speciesId];
        speciesEntries.push({
          speciesId: speciesEntry.speciesId,
          dead: !!speciesEntry.dead && !speciesEntry.alive,
        });
      }
      speciesEntries.sort(function (entryA, entryB) {
        if (entryA.speciesId < entryB.speciesId) return -1;
        if (entryA.speciesId > entryB.speciesId) return 1;
        return 0;
      });
      locationIdsToSpecies.set(locationId, speciesList.slice());
      locationIdsToLiveSpecies.set(locationId, liveSpeciesList.slice());
      locationIdsToDeadSpecies.set(locationId, deadSpeciesList.slice());
      locationIdsToSpeciesEntries.set(locationId, speciesEntries);
      locationIdsToManualSpecies.set(locationId, manualSpeciesList.slice());
    });

    return {
      source: source,
      hasData: source !== "none",
      lastCheckedAt:
        meta && meta.lastCheckedAt !== undefined ? meta.lastCheckedAt : null,
      lastSuccessAt:
        meta && meta.lastSuccessAt !== undefined ? meta.lastSuccessAt : null,
      records: normalizedRecords,
      manualCaughtRecords: manualCaughtRecords,
      speciesIds: speciesIds,
      liveSpeciesIds: liveSpeciesIds,
      deadSpeciesIds: deadSpeciesIds,
      manualCaughtSpeciesIds: manualCaughtSpeciesIds,
      familyKeys: familyKeys,
      liveFamilyKeys: liveFamilyKeys,
      deadFamilyKeys: deadFamilyKeys,
      manualCaughtFamilyKeys: manualCaughtFamilyKeys,
      locationIdsToSpecies: locationIdsToSpecies,
      locationIdsToLiveSpecies: locationIdsToLiveSpecies,
      locationIdsToDeadSpecies: locationIdsToDeadSpecies,
      locationIdsToSpeciesEntries: locationIdsToSpeciesEntries,
      locationIdsToManualSpecies: locationIdsToManualSpecies,
      locationGroupToSpecies: locationGroupToSpecies,
      locationGroupToDeadSpecies: locationGroupToDeadSpecies,
      locationIdToGroup: locationIndex.locationIdToGroup,
      missedLocationGroups: missedLocationGroups,
    };
  }

  function buildStateSignature(source, records, meta) {
    var parts = [source];
    var sortedRecords = normalizeRecords(records).slice();
    var manualCaughtRecords = normalizeManualCaughtRecords(
      meta && Array.isArray(meta.manualCaughtRecords)
        ? meta.manualCaughtRecords
        : currentState && currentState.manualCaughtRecords,
    );
    var missedLocationGroups = [];
    var missedLocationGroupSource =
      meta && meta.missedLocationGroups instanceof Set
        ? meta.missedLocationGroups
        : currentState && currentState.missedLocationGroups;

    sortedRecords.sort(function (recordA, recordB) {
      var keyA = recordA.species + "|" + recordA.location;
      var keyB = recordB.species + "|" + recordB.location;
      if (keyA < keyB) return -1;
      if (keyA > keyB) return 1;
      return 0;
    });

    for (var i = 0; i < sortedRecords.length; i++) {
      parts.push(
        sortedRecords[i].species +
          "|" +
          sortedRecords[i].location +
          "|" +
          (sortedRecords[i].dead ? "dead" : "live"),
      );
    }

    for (var manualIndex = 0; manualIndex < manualCaughtRecords.length; manualIndex++) {
      parts.push(
        "manual|" +
          manualCaughtRecords[manualIndex].locationId +
          "|" +
          manualCaughtRecords[manualIndex].species,
      );
    }

    if (
      missedLocationGroupSource &&
      typeof missedLocationGroupSource.forEach === "function"
    ) {
      missedLocationGroups = Array.from(missedLocationGroupSource).sort();
      for (var missedIndex = 0; missedIndex < missedLocationGroups.length; missedIndex++) {
        parts.push("missed|" + missedLocationGroups[missedIndex]);
      }
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
    var nextSignature = buildStateSignature(currentState.source, currentState.records, {
      manualCaughtRecords: currentState.manualCaughtRecords,
      missedLocationGroups: currentState.missedLocationGroups,
    });
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
      currentSignature = buildStateSignature(currentState.source, currentState.records, {
        manualCaughtRecords: currentState.manualCaughtRecords,
        missedLocationGroups: currentState.missedLocationGroups,
      });
      return;
    }

    currentState = createDerivedState("cache", cached.records, {
      lastCheckedAt: null,
      lastSuccessAt: cached.savedAt,
    });
    currentSignature = buildStateSignature(currentState.source, currentState.records, {
      manualCaughtRecords: currentState.manualCaughtRecords,
      missedLocationGroups: currentState.missedLocationGroups,
    });
  }

  function fetchBoxTextFromEndpoint(endpoint) {
    if (typeof window.fetch !== "function") {
      return Promise.reject(new Error("fetch is unavailable"));
    }
    logBridge("direct fetch start", { endpoint: endpoint });

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
        logBridge("direct fetch success", {
          endpoint: endpoint,
          status: response.status,
        });
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
        logBridge("direct fetch failed", {
          endpoint: endpoint,
          error: error && error.message ? error.message : String(error),
        });
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

        logBridge("bridge response received", {
          requestId: requestId,
          origin: event.origin,
          ok: !!data.ok,
        });

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
        logBridge("bridge response timeout", {
          requestId: requestId,
          targetOrigin: targetOrigin,
        });
        reject(new Error("Timed out waiting for parent bridge /box response"));
      }, BOX_BRIDGE_TIMEOUT);

      window.addEventListener("message", handleMessage);
      logBridge("bridge request sent", {
        requestId: requestId,
        targetOrigin: targetOrigin,
        referrer: document.referrer || "",
      });
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
    var liveSpeciesIds = locationKey
      ? currentState.locationIdsToLiveSpecies.get(locationKey) || []
      : [];
    var deadSpeciesIds = locationKey
      ? currentState.locationIdsToDeadSpecies.get(locationKey) || []
      : [];
    var speciesEntries = locationKey
      ? currentState.locationIdsToSpeciesEntries.get(locationKey) || []
      : [];
    var manualSpeciesIds = locationKey
      ? currentState.locationIdsToManualSpecies.get(locationKey) || []
      : [];
    var locationGroup = locationKey
      ? currentState.locationIdToGroup.get(locationKey) || ""
      : "";
    var isMissed =
      !!locationGroup &&
      !speciesIds.length &&
      currentState.missedLocationGroups.has(locationGroup);

    return {
      hasCaughtHere: speciesIds.length > 0,
      speciesIds: speciesIds.slice(),
      liveSpeciesIds: liveSpeciesIds.slice(),
      caughtSpeciesIds: speciesIds.slice(),
      deadSpeciesIds: deadSpeciesIds.slice(),
      manualSpeciesIds: manualSpeciesIds.slice(),
      speciesEntries: speciesEntries.map(function (entry) {
        return {
          speciesId: entry.speciesId,
          dead: !!entry.dead,
        };
      }),
      isMissed: isMissed,
      canMarkMissed:
        !!locationKey &&
        !speciesIds.length &&
        !!(window.BattleLocationdex && window.BattleLocationdex[locationKey]),
      source: currentState.source,
    };
  }

  function getEncounterRowState(locationId, speciesId) {
    var normalizedSpeciesId = normalizeLocationText(speciesId);
    if (!normalizedSpeciesId) {
      return {
        caughtHere: false,
        liveCaughtHere: false,
        manualCaughtHere: false,
        ownedElsewhere: false,
        familyCaughtHere: false,
        familyOwnedElsewhere: false,
        blocked: false,
        blockedReason: "",
      };
    }

    var summary = getLocationSummary(locationId);
    var familyInfo = getFamilyInfo(normalizedSpeciesId);
    var familyKey = familyInfo && familyInfo.key ? familyInfo.key : "";
    var caughtHere = summary.speciesIds.indexOf(normalizedSpeciesId) >= 0;
    var liveCaughtHere = summary.liveSpeciesIds.indexOf(normalizedSpeciesId) >= 0;
    var manualCaughtHere = summary.manualSpeciesIds.indexOf(normalizedSpeciesId) >= 0;
    var deadHere = summary.deadSpeciesIds.indexOf(normalizedSpeciesId) >= 0;
    var familyCaughtHere = false;

    if (familyKey && Array.isArray(summary.speciesIds)) {
      for (var i = 0; i < summary.speciesIds.length; i++) {
        if (summary.speciesIds[i] === normalizedSpeciesId) continue;
        var siblingFamily = getFamilyInfo(summary.speciesIds[i]);
        if (siblingFamily && siblingFamily.key === familyKey) {
          familyCaughtHere = true;
          break;
        }
      }
    }

    var ownedElsewhere =
      !caughtHere && currentState.speciesIds.has(normalizedSpeciesId);
    var familyOwnedElsewhere =
      !!familyKey &&
      !caughtHere &&
      !familyCaughtHere &&
      currentState.familyKeys.has(familyKey);
    var blockedReason = "";
    if (caughtHere) {
      blockedReason = "caught-here";
    } else if (familyCaughtHere) {
      blockedReason = "family-caught-here";
    } else if (ownedElsewhere) {
      blockedReason = "owned-elsewhere";
    } else if (familyOwnedElsewhere) {
      blockedReason = "family-owned-elsewhere";
    }

    return {
      caughtHere: caughtHere,
      liveCaughtHere: liveCaughtHere,
      manualCaughtHere: manualCaughtHere,
      ownedElsewhere: ownedElsewhere,
      familyCaughtHere: familyCaughtHere,
      familyOwnedElsewhere: familyOwnedElsewhere,
      familyBlocked: familyCaughtHere || familyOwnedElsewhere,
      blocked: !!blockedReason,
      blockedReason: blockedReason,
      familyKey: familyKey,
      deadHere: deadHere,
      ownedDeadElsewhere:
        !caughtHere &&
        currentState.deadSpeciesIds.has(normalizedSpeciesId) &&
        currentState.speciesIds.has(normalizedSpeciesId),
    };
  }

  function setLocationMissed(locationId, isMissed) {
    var normalizedLocationId = cleanText(locationId);
    if (
      !normalizedLocationId ||
      !window.BattleLocationdex ||
      !window.BattleLocationdex[normalizedLocationId]
    ) {
      return getLocationSummary(normalizedLocationId);
    }

    var summary = getLocationSummary(normalizedLocationId);
    if (!summary.canMarkMissed && !summary.isMissed) {
      return summary;
    }

    var locationGroup = currentState.locationIdToGroup.get(normalizedLocationId);
    if (!locationGroup) return summary;

    var nextMissedLocationGroups = new Set(currentState.missedLocationGroups);
    if (isMissed) {
      nextMissedLocationGroups.add(locationGroup);
    } else {
      nextMissedLocationGroups.delete(locationGroup);
    }

    saveMissedLocationGroups(nextMissedLocationGroups);
    return setState(currentState.source, currentState.records, {
      lastCheckedAt: currentState.lastCheckedAt,
      lastSuccessAt: currentState.lastSuccessAt,
      missedLocationGroups: nextMissedLocationGroups,
    });
  }

  function toggleLocationMissed(locationId) {
    var summary = getLocationSummary(locationId);
    if (!summary.canMarkMissed && !summary.isMissed) return summary;
    return setLocationMissed(locationId, !summary.isMissed);
  }

  function setEncounterCaught(locationId, speciesId, isCaught) {
    var normalizedLocationId = cleanText(locationId);
    var canonicalSpecies = canonicalizeSpeciesName(speciesId);
    var normalizedSpeciesId = normalizeLocationText(canonicalSpecies);
    if (
      !normalizedLocationId ||
      !normalizedSpeciesId ||
      !window.BattleLocationdex ||
      !window.BattleLocationdex[normalizedLocationId]
    ) {
      return currentState;
    }

    var nextManualCaughtRecords = currentState.manualCaughtRecords.slice();
    var existingIndex = -1;
    for (var i = 0; i < nextManualCaughtRecords.length; i++) {
      var record = nextManualCaughtRecords[i];
      if (
        cleanText(record.locationId) === normalizedLocationId &&
        normalizeLocationText(record.species) === normalizedSpeciesId
      ) {
        existingIndex = i;
        break;
      }
    }

    if (isCaught) {
      if (existingIndex >= 0) return currentState;
      nextManualCaughtRecords.push({
        species: canonicalSpecies,
        locationId: normalizedLocationId,
      });
    } else {
      if (existingIndex < 0) return currentState;
      nextManualCaughtRecords.splice(existingIndex, 1);
    }

    nextManualCaughtRecords = normalizeManualCaughtRecords(nextManualCaughtRecords);
    saveManualCaughtRecords(nextManualCaughtRecords);
    return setState(currentState.source, currentState.records, {
      lastCheckedAt: currentState.lastCheckedAt,
      lastSuccessAt: currentState.lastSuccessAt,
      missedLocationGroups: currentState.missedLocationGroups,
      manualCaughtRecords: nextManualCaughtRecords,
    });
  }

  function toggleEncounterCaught(locationId, speciesId) {
    var rowState = getEncounterRowState(locationId, speciesId);
    return setEncounterCaught(locationId, speciesId, !rowState.manualCaughtHere);
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
    setLocationMissed: setLocationMissed,
    toggleLocationMissed: toggleLocationMissed,
    setEncounterCaught: setEncounterCaught,
    toggleEncounterCaught: toggleEncounterCaught,
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
