(function () {
  "use strict";

  function getRouterRoot() {
    if (window.DDEXPaths && typeof window.DDEXPaths.routerRoot === "function") {
      return window.DDEXPaths.routerRoot();
    }
    if (window.BattleSearch && BattleSearch.urlRoot) {
      return BattleSearch.urlRoot;
    }
    return "/";
  }

  function escapeHTML(value) {
    if (window.Dex && typeof Dex.escapeHTML === "function") {
      return Dex.escapeHTML(value);
    }
    return String(value || "");
  }

  function normalizeId(value) {
    if (typeof cleanString === "function") return cleanString(value);
    return String(value || "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  }

  function getLocationOrderCandidates() {
    var seen = {};
    var candidates = [];

    function add(value) {
      value = String(value || "").trim();
      if (!value || seen[value]) return;
      seen[value] = true;
      candidates.push(value);
    }

    try {
      var params = new URLSearchParams(window.location.search || "");
      add(params.get("game"));
    } catch (err) {}

    add(localStorage.game);
    add(localStorage.gameTitle);
    add(localStorage.romTitle);

    var documentTitle = String(document.title || "")
      .replace(/\s+Dex\s*$/i, "")
      .trim();
    if (documentTitle && documentTitle !== "Dynamic") add(documentTitle);

    if (window.DDEX_ROM_OVERRIDES && window.DDEX_ROM_OVERRIDES.title) {
      add(window.DDEX_ROM_OVERRIDES.title);
    }

    return candidates;
  }

  function getActiveLocationOrder() {
    if (!window.DDEX_LOCATION_ORDERS) return null;
    var candidates = getLocationOrderCandidates();
    for (var i = 0; i < candidates.length; i++) {
      var order = window.DDEX_LOCATION_ORDERS[candidates[i]];
      if (order && order.byLocationNameId) return order;
    }
    return null;
  }

  function getSpeciesTemplate(speciesRef) {
    if (!speciesRef) return null;

    if (window.Dex && Dex.species && typeof Dex.species.get === "function") {
      var dexTemplate = Dex.species.get(speciesRef);
      if (dexTemplate && dexTemplate.exists) return dexTemplate;
    }

    var speciesId = normalizeId(speciesRef);
    if (speciesId && window.BattlePokedex && BattlePokedex[speciesId]) {
      return BattlePokedex[speciesId];
    }

    return null;
  }

  function getCanonicalSpeciesId(speciesRef) {
    var template = getSpeciesTemplate(speciesRef);
    if (template) {
      return normalizeId(template.id || template.name || speciesRef);
    }
    return normalizeId(speciesRef);
  }

  function getSpeciesDisplayName(speciesRef) {
    var template = getSpeciesTemplate(speciesRef);
    if (template && template.name) return template.name;
    return String(speciesRef || "");
  }

  function getEvolutionData() {
    if (typeof evoData !== "undefined" && evoData) return evoData;
    if (typeof window !== "undefined" && window.evoData) return window.evoData;
    return null;
  }

  function formatPercent(value) {
    if (!Number.isFinite(value) || value <= 0) return "0%";
    if (value < 0.05) return "<0.1%";
    if (value >= 100) return "100%";
    return value.toFixed(1).replace(/\.?0+$/, "") + "%";
  }

  function formatWeight(value) {
    if (!Number.isFinite(value) || value <= 0) return "0%";
    if (value < 0.05) return "<0.1%";
    return Number(value).toFixed(1).replace(/\.?0+$/, "") + "%";
  }

  function isUnknownLocationName(locationName) {
    return String(locationName || "").toLowerCase().indexOf("unknown_") === 0;
  }

  function isIgnoredRoutingEncType(encType) {
    var normalized = String(encType || "").toLowerCase();
    return (
      normalized === "swarm" ||
      normalized === "radar" ||
      normalized.indexOf("dual") === 0
    );
  }

  function isTimeOverlayEncType(encType) {
    return encType === "time_day" || encType === "time_night";
  }

  var familyCache = {};
  var familyLocationCache = {
    dexRef: null,
    byFamilyKey: {},
  };

  function resetFamilyLocationCacheIfNeeded() {
    if (familyLocationCache.dexRef === window.BattleLocationdex) return;
    familyLocationCache.dexRef = window.BattleLocationdex;
    familyLocationCache.byFamilyKey = {};
  }

  function getFamilyInfo(speciesRef) {
    var speciesId = getCanonicalSpeciesId(speciesRef);
    if (!speciesId) {
      return {
        key: "",
        ancestorName: "",
        memberIds: [],
        memberNames: [],
      };
    }
    if (familyCache[speciesId]) return familyCache[speciesId];

    var speciesName = getSpeciesDisplayName(speciesRef);
    var evolutionData = getEvolutionData();
    var speciesRecord = evolutionData && speciesName ? evolutionData[speciesName] : null;
    var ancestorName = speciesRecord && speciesRecord.anc ? speciesRecord.anc : speciesName;
    var ancestorRecord =
      evolutionData && ancestorName ? evolutionData[ancestorName] : null;

    var familyNames = [];
    if (ancestorName) familyNames.push(ancestorName);
    if (ancestorRecord && Array.isArray(ancestorRecord.evos)) {
      familyNames = familyNames.concat(ancestorRecord.evos);
    }
    if (!familyNames.length) familyNames.push(speciesName || speciesRef);

    var seen = {};
    var memberIds = [];
    var memberNames = [];
    for (var i = 0; i < familyNames.length; i++) {
      var memberName = familyNames[i];
      var memberId = getCanonicalSpeciesId(memberName);
      if (!memberId || seen[memberId]) continue;
      seen[memberId] = true;
      memberIds.push(memberId);
      memberNames.push(getSpeciesDisplayName(memberName) || memberName);
    }

    if (!memberIds.length) {
      memberIds.push(speciesId);
      memberNames.push(speciesName || speciesId);
    }

    var ancestorId = getCanonicalSpeciesId(ancestorName || speciesName || speciesRef) || speciesId;
    var info = {
      key: ancestorId,
      ancestorName:
        getSpeciesDisplayName(ancestorName || speciesName || speciesRef) ||
        ancestorName ||
        speciesName ||
        speciesId,
      memberIds: memberIds,
      memberNames: memberNames,
    };
    familyCache[speciesId] = info;
    return info;
  }

  function getEncounterSlots(locationRecord, encType) {
    if (!locationRecord || !locationRecord[encType] || !Array.isArray(locationRecord[encType].encs)) {
      return [];
    }

    var slots = [];
    var rates =
      typeof getEncounterRateSlots === "function"
        ? getEncounterRateSlots(locationRecord, encType)
        : [];

    for (var i = 0; i < locationRecord[encType].encs.length; i++) {
      var slot = locationRecord[encType].encs[i] || {};
      var speciesRef = slot.s || slot.species;
      if (!speciesRef || speciesRef === "-----") continue;
      var speciesId = getCanonicalSpeciesId(speciesRef);
      if (!speciesId) continue;
      var rate = Number(rates[i]) || 0;
      if (rate <= 0) continue;
      var familyInfo = getFamilyInfo(speciesId);
      slots.push({
        index: i,
        rate: rate,
        speciesId: speciesId,
        speciesName: getSpeciesDisplayName(speciesId),
        minLevel: Number(slot.mn || slot.minLvl || 0) || 0,
        maxLevel: Number(slot.mx || slot.maxLvl || slot.mn || slot.minLvl || 0) || 0,
        familyKey: familyInfo.key,
        familyInfo: familyInfo,
      });
    }

    return slots;
  }

  function cloneEncounterSlot(slot, nextIndex, nextRate) {
    return {
      index: Number.isFinite(nextIndex) ? nextIndex : slot.index,
      rate: Number.isFinite(nextRate) ? nextRate : slot.rate,
      speciesId: slot.speciesId,
      speciesName: slot.speciesName,
      minLevel: slot.minLevel,
      maxLevel: slot.maxLevel,
      familyKey: slot.familyKey,
      familyInfo: slot.familyInfo,
    };
  }

  function getGrassOverlayReplacementIndexes(locationRecord, overlaySlotCount) {
    var baseRates =
      typeof getEncounterRateSlots === "function"
        ? getEncounterRateSlots(locationRecord, "grass")
        : [];
    var indexes = [];
    for (var i = 0; i < baseRates.length; i++) {
      if ((Number(baseRates[i]) || 0) === 10) {
        indexes.push(i);
        if (indexes.length >= overlaySlotCount) return indexes;
      }
    }
    return indexes;
  }

  function getMergedGrassOverlaySlots(locationRecord, overlayType) {
    var baseSlots = getEncounterSlots(locationRecord, "grass");
    if (!baseSlots.length) return [];
    if (!overlayType || !locationRecord || !locationRecord[overlayType]) {
      return baseSlots.slice();
    }

    var overlaySlots = getEncounterSlots(locationRecord, overlayType);
    if (!overlaySlots.length) return baseSlots.slice();

    var replacementIndexes = getGrassOverlayReplacementIndexes(
      locationRecord,
      overlaySlots.length,
    );
    if (!replacementIndexes.length) return baseSlots.slice();

    var baseRates =
      typeof getEncounterRateSlots === "function"
        ? getEncounterRateSlots(locationRecord, "grass")
        : [];
    var slotByIndex = {};
    var orderedIndexes = [];

    for (var i = 0; i < baseSlots.length; i++) {
      slotByIndex[baseSlots[i].index] = cloneEncounterSlot(baseSlots[i]);
      orderedIndexes.push(baseSlots[i].index);
    }

    for (var overlayIndex = 0; overlayIndex < overlaySlots.length; overlayIndex++) {
      var targetIndex = replacementIndexes[overlayIndex];
      if (!Number.isFinite(targetIndex) || !slotByIndex[targetIndex]) continue;
      slotByIndex[targetIndex] = cloneEncounterSlot(
        overlaySlots[overlayIndex],
        targetIndex,
        Number(baseRates[targetIndex]) || slotByIndex[targetIndex].rate,
      );
    }

    var mergedSlots = [];
    for (var orderedIndex = 0; orderedIndex < orderedIndexes.length; orderedIndex++) {
      var slot = slotByIndex[orderedIndexes[orderedIndex]];
      if (slot) mergedSlots.push(slot);
    }
    return mergedSlots;
  }

  function compareLocationLinks(linkA, linkB) {
    var activeOrder = getActiveLocationOrder();
    if (activeOrder && activeOrder.byLocationNameId) {
      var orderA = Number.isFinite(linkA.locationNameId)
        ? activeOrder.byLocationNameId[linkA.locationNameId]
        : undefined;
      var orderB = Number.isFinite(linkB.locationNameId)
        ? activeOrder.byLocationNameId[linkB.locationNameId]
        : undefined;
      var hasA = Number.isFinite(orderA);
      var hasB = Number.isFinite(orderB);
      if (hasA && hasB && orderA !== orderB) return orderA - orderB;
      if (hasA && !hasB) return -1;
      if (!hasA && hasB) return 1;
    }

    return String(linkA.locationName || "").localeCompare(String(linkB.locationName || ""));
  }

  function getFamilyLocationLinks(familyInfo) {
    if (!familyInfo || !familyInfo.key) return [];

    resetFamilyLocationCacheIfNeeded();
    if (familyLocationCache.byFamilyKey[familyInfo.key]) {
      return familyLocationCache.byFamilyKey[familyInfo.key].slice();
    }

    var memberSet = {};
    for (var i = 0; i < familyInfo.memberIds.length; i++) {
      memberSet[familyInfo.memberIds[i]] = true;
    }

    var links = [];
    var seenLocations = {};
    var routes = getRouteDescriptorCache().routes;
    for (var routeIndex = 0; routeIndex < routes.length; routeIndex++) {
      var descriptor = routes[routeIndex];
      if (seenLocations[descriptor.locationId]) continue;
      if (isUnknownLocationName(descriptor.locationName)) continue;

      var found = false;
      for (var s = 0; s < descriptor.slots.length; s++) {
        if (memberSet[descriptor.slots[s].speciesId]) {
          found = true;
          break;
        }
      }

      if (!found) continue;
      seenLocations[descriptor.locationId] = true;
      links.push({
        locationId: descriptor.locationId,
        locationName: descriptor.locationName || descriptor.locationId,
        locationNameId: Number.parseInt(descriptor.locationNameId, 10),
      });
    }

    links.sort(compareLocationLinks);
    familyLocationCache.byFamilyKey[familyInfo.key] = links.slice();
    return links;
  }

  function buildRouteAnalysisFromSlots(targetSpeciesId, locationId, encType, slots, routeKey) {
    var canonicalTargetId = getCanonicalSpeciesId(targetSpeciesId);
    var locationRecord = BattleLocationdex && BattleLocationdex[locationId];
    var targetFamily = getFamilyInfo(canonicalTargetId);
    var competitorsByKey = {};
    var totalWeight = 0;
    var targetWeight = 0;

    for (var i = 0; i < slots.length; i++) {
      var slot = slots[i];
      totalWeight += slot.rate;
      if (slot.speciesId === canonicalTargetId) {
        targetWeight += slot.rate;
      }
      if (slot.familyKey === targetFamily.key) continue;

      if (!competitorsByKey[slot.familyKey]) {
        competitorsByKey[slot.familyKey] = {
          familyKey: slot.familyKey,
          familyInfo: slot.familyInfo,
          poolSpeciesIds: [],
          poolSpeciesNames: [],
          removedWeight: 0,
          basePercent: 0,
          locationLinks: [],
        };
      }
      var competitor = competitorsByKey[slot.familyKey];
      competitor.removedWeight += slot.rate;
      if (competitor.poolSpeciesIds.indexOf(slot.speciesId) < 0) {
        competitor.poolSpeciesIds.push(slot.speciesId);
        competitor.poolSpeciesNames.push(slot.speciesName);
      }
    }

    var competitors = [];
    for (var familyKey in competitorsByKey) {
      if (!Object.prototype.hasOwnProperty.call(competitorsByKey, familyKey)) continue;
      var group = competitorsByKey[familyKey];
      group.basePercent = totalWeight > 0 ? (group.removedWeight / totalWeight) * 100 : 0;
      group.locationLinks = getFamilyLocationLinks(group.familyInfo);
      group.label =
        group.poolSpeciesNames.length <= 1
          ? (group.poolSpeciesNames[0] || group.familyInfo.ancestorName)
          : group.poolSpeciesNames.join(" / ");
      competitors.push(group);
    }

    competitors.sort(function (a, b) {
      if (b.removedWeight !== a.removedWeight) {
        return b.removedWeight - a.removedWeight;
      }
      return a.label.localeCompare(b.label);
    });

    return {
      routeKey: routeKey || (encType + ":" + locationId),
      targetSpeciesId: canonicalTargetId,
      targetDisplayName: getSpeciesDisplayName(canonicalTargetId),
      locationId: locationId,
      locationName: (locationRecord && locationRecord.name) || locationId,
      encType: encType,
      totalWeight: totalWeight,
      targetWeight: targetWeight,
      targetBasePercent: totalWeight > 0 ? (targetWeight / totalWeight) * 100 : 0,
      competitors: competitors,
    };
  }

  function buildRouteAnalysis(targetSpeciesId, locationId, encType) {
    var locationRecord = BattleLocationdex && BattleLocationdex[locationId];
    var routeDescriptor = getRouteDescriptor(encType + ":" + locationId);
    var slots = routeDescriptor ? routeDescriptor.slots : getEncounterSlots(locationRecord, encType);
    return buildRouteAnalysisFromSlots(
      targetSpeciesId,
      locationId,
      encType,
      slots,
      routeDescriptor && routeDescriptor.routeKey,
    );
  }

  var routeDescriptorCache = {
    dexRef: null,
    routes: [],
    byKey: {},
  };

  function encTypeLabel(encType) {
    if (encType === "grass_day") return "Grass (Day)";
    if (encType === "grass_night") return "Grass (Night)";
    if (typeof snakeToTitleCase === "function") {
      return snakeToTitleCase(encType);
    }
    return String(encType || "");
  }

  function getEncounterTypeSortOrder(encType) {
    var baseOrder = (window.encTypes || []).indexOf(encType);
    if (baseOrder >= 0) return baseOrder;

    var grassOrder = (window.encTypes || []).indexOf("grass");
    if (encType === "grass_day") {
      return grassOrder >= 0 ? grassOrder + 0.1 : 0.1;
    }
    if (encType === "grass_night") {
      return grassOrder >= 0 ? grassOrder + 0.2 : 0.2;
    }
    return 999;
  }

  function buildRouteDescriptor(locationId, locationRecord, encType, slots) {
    if (!slots.length) return null;

    var familyWeights = {};
    var familyLabels = {};
    var totalWeight = 0;
    for (var s = 0; s < slots.length; s++) {
      totalWeight += slots[s].rate;
      familyWeights[slots[s].familyKey] =
        (familyWeights[slots[s].familyKey] || 0) + slots[s].rate;
      familyLabels[slots[s].familyKey] = slots[s].familyInfo.ancestorName;
    }

    var familyKeys = Object.keys(familyWeights);
    return {
      routeKey: encType + ":" + locationId,
      locationId: locationId,
      locationName: locationRecord.name || locationId,
      locationNameId: Number.parseInt(locationRecord.locationNameId, 10),
      encType: encType,
      slots: slots,
      totalWeight: totalWeight,
      familyWeights: familyWeights,
      familyLabels: familyLabels,
      familyKeys: familyKeys,
    };
  }

  function getNormalizedLocationRouteDescriptors(locationId, locationRecord) {
    var descriptors = [];
    if (!locationRecord || typeof locationRecord !== "object") return descriptors;

    var hasGrass = getEncounterSlots(locationRecord, "grass").length > 0;
    var hasTimeDay = getEncounterSlots(locationRecord, "time_day").length > 0;
    var hasTimeNight = getEncounterSlots(locationRecord, "time_night").length > 0;

    if (hasGrass) {
      if (hasTimeDay) {
        descriptors.push(
          buildRouteDescriptor(
            locationId,
            locationRecord,
            "grass_day",
            getMergedGrassOverlaySlots(locationRecord, "time_day"),
          ),
        );
      }
      if (hasTimeNight) {
        descriptors.push(
          buildRouteDescriptor(
            locationId,
            locationRecord,
            "grass_night",
            getMergedGrassOverlaySlots(locationRecord, "time_night"),
          ),
        );
      }
      if (!hasTimeDay && !hasTimeNight) {
        descriptors.push(
          buildRouteDescriptor(locationId, locationRecord, "grass", getEncounterSlots(locationRecord, "grass")),
        );
      }
    }

    for (var i = 0; i < (window.encTypes || []).length; i++) {
      var encType = window.encTypes[i];
      if (encType === "grass") continue;
      if (isTimeOverlayEncType(encType)) continue;
      if (isIgnoredRoutingEncType(encType)) continue;
      descriptors.push(
        buildRouteDescriptor(locationId, locationRecord, encType, getEncounterSlots(locationRecord, encType)),
      );
    }

    return descriptors.filter(Boolean);
  }

  function getRouteDescriptorCache() {
    if (routeDescriptorCache.dexRef === window.BattleLocationdex) {
      return routeDescriptorCache;
    }

    var routes = [];
    var byKey = {};
    for (var locationId in window.BattleLocationdex || {}) {
      if (locationId === "rates") continue;
      if (!Object.prototype.hasOwnProperty.call(window.BattleLocationdex, locationId)) continue;
      var locationRecord = BattleLocationdex[locationId];
      if (!locationRecord || typeof locationRecord !== "object") continue;
      if (isUnknownLocationName(locationRecord.name || locationId)) continue;
      var locationDescriptors = getNormalizedLocationRouteDescriptors(locationId, locationRecord);
      for (var i = 0; i < locationDescriptors.length; i++) {
        var descriptor = locationDescriptors[i];
        routes.push(descriptor);
        byKey[descriptor.routeKey] = descriptor;
      }
    }

    routes.sort(function (routeA, routeB) {
      var locationCompare = compareLocationLinks(routeA, routeB);
      if (locationCompare) return locationCompare;
      var typeOrderA = getEncounterTypeSortOrder(routeA.encType);
      var typeOrderB = getEncounterTypeSortOrder(routeB.encType);
      if (typeOrderA !== typeOrderB) return typeOrderA - typeOrderB;
      return routeA.routeKey.localeCompare(routeB.routeKey);
    });

    routeDescriptorCache.dexRef = window.BattleLocationdex;
    routeDescriptorCache.routes = routes;
    routeDescriptorCache.byKey = byKey;
    return routeDescriptorCache;
  }

  function toKeySet(values) {
    if (values instanceof Set) return new Set(values);
    var set = new Set();
    if (!values) return set;
    if (Array.isArray(values)) {
      for (var i = 0; i < values.length; i++) {
        if (values[i]) set.add(values[i]);
      }
      return set;
    }
    for (var key in values) {
      if (values[key]) set.add(key);
    }
    return set;
  }

  function sortedSetValues(setValue) {
    return Array.from(setValue || []).sort();
  }

  function getNuzlockeState() {
    if (
      !window.DDEX_NUZLOCKE_BOX ||
      typeof window.DDEX_NUZLOCKE_BOX.getState !== "function"
    ) {
      return null;
    }
    return window.DDEX_NUZLOCKE_BOX.getState();
  }

  function getSyncedFamilyKeysFromState(state) {
    var familyKeys = new Set();
    if (!state) return familyKeys;

    var records = Array.isArray(state.records) ? state.records : [];
    for (var i = 0; i < records.length; i++) {
      var record = records[i] || {};
      var familyInfo = getFamilyInfo(record.species || record.speciesId);
      if (familyInfo && familyInfo.key) familyKeys.add(familyInfo.key);
    }

    if (!records.length && state.speciesIds && typeof state.speciesIds.forEach === "function") {
      state.speciesIds.forEach(function (speciesId) {
        var familyInfo = getFamilyInfo(speciesId);
        if (familyInfo && familyInfo.key) familyKeys.add(familyInfo.key);
      });
    }

    return familyKeys;
  }

  function getUsedLocationIdsFromState(state) {
    var usedLocationIds = new Set();
    if (!state) return usedLocationIds;

    if (typeof state.locationIdsToSpecies === "object" && state.locationIdsToSpecies) {
      if (typeof state.locationIdsToSpecies.forEach === "function") {
        state.locationIdsToSpecies.forEach(function (speciesIds, locationId) {
          if (speciesIds && speciesIds.length) usedLocationIds.add(locationId);
        });
      } else {
        for (var locationId in state.locationIdsToSpecies) {
          if (!Object.prototype.hasOwnProperty.call(state.locationIdsToSpecies, locationId)) continue;
          var list = state.locationIdsToSpecies[locationId];
          if (list && list.length) usedLocationIds.add(locationId);
        }
      }
    }

    if (!usedLocationIds.size && window.DDEX_NUZLOCKE_BOX && typeof window.DDEX_NUZLOCKE_BOX.getLocationSummary === "function") {
      for (var battleLocationId in window.BattleLocationdex || {}) {
        if (battleLocationId === "rates") continue;
        var summary = window.DDEX_NUZLOCKE_BOX.getLocationSummary(battleLocationId);
        if (summary && summary.speciesIds && summary.speciesIds.length) {
          usedLocationIds.add(battleLocationId);
        }
      }
    }

    return usedLocationIds;
  }

  function getTargetRoutesForSpecies(targetSpeciesId) {
    var routes = [];
    var descriptors = getRouteDescriptorCache().routes;
    for (var i = 0; i < descriptors.length; i++) {
      var descriptor = descriptors[i];
      var analysis = buildRouteAnalysis(targetSpeciesId, descriptor.locationId, descriptor.encType);
      if (analysis && analysis.targetWeight > 0) {
        analysis.routeLabel = descriptor.locationName + " (" + encTypeLabel(descriptor.encType) + ")";
        routes.push(analysis);
      }
    }
    return routes;
  }

  function getRouteDescriptor(routeKey) {
    return getRouteDescriptorCache().byKey[routeKey] || null;
  }

  function getTargetRouteLabel(routeAnalysis) {
    return (
      routeAnalysis.routeLabel ||
      (routeAnalysis.locationName + " (" + encTypeLabel(routeAnalysis.encType) + ")")
    );
  }

  function getRouteOutcomeDistribution(routeDescriptor, dupedFamilyKeys, targetSpeciesId) {
    var selected = toKeySet(dupedFamilyKeys);
    var canonicalTargetId = getCanonicalSpeciesId(targetSpeciesId);
    var familyWeights = {};
    var familyLabels = {};
    var familySpeciesNames = {};
    var targetSpeciesWeights = {};
    var remainingWeight = 0;

    for (var i = 0; i < routeDescriptor.slots.length; i++) {
      var slot = routeDescriptor.slots[i];
      if (selected.has(slot.familyKey)) continue;
      familyWeights[slot.familyKey] = (familyWeights[slot.familyKey] || 0) + slot.rate;
      familyLabels[slot.familyKey] = slot.familyInfo.ancestorName;
      if (!familySpeciesNames[slot.familyKey]) familySpeciesNames[slot.familyKey] = [];
      if (familySpeciesNames[slot.familyKey].indexOf(slot.speciesName) < 0) {
        familySpeciesNames[slot.familyKey].push(slot.speciesName);
      }
      if (slot.speciesId === canonicalTargetId) {
        targetSpeciesWeights[slot.familyKey] =
          (targetSpeciesWeights[slot.familyKey] || 0) + slot.rate;
      }
      remainingWeight += slot.rate;
    }

    if (!remainingWeight) return [];

    var outcomes = [];
    for (var familyKey in familyWeights) {
      if (!Object.prototype.hasOwnProperty.call(familyWeights, familyKey)) continue;
      outcomes.push({
        familyKey: familyKey,
        familyLabel: familyLabels[familyKey] || familyKey,
        removedWeight: familyWeights[familyKey],
        branchChance: familyWeights[familyKey] / remainingWeight,
        encounterSpeciesNames: (familySpeciesNames[familyKey] || []).slice(),
        encounterLabel:
          familySpeciesNames[familyKey] && familySpeciesNames[familyKey].length === 1
            ? familySpeciesNames[familyKey][0]
            : (familyLabels[familyKey] || familyKey) + " family",
        targetSpeciesWeight: targetSpeciesWeights[familyKey] || 0,
        targetSpeciesChanceWithinFamily:
          familyWeights[familyKey] > 0
            ? (targetSpeciesWeights[familyKey] || 0) / familyWeights[familyKey]
            : 0,
      });
    }

    outcomes.sort(function (a, b) {
      if (b.branchChance !== a.branchChance) return b.branchChance - a.branchChance;
      return a.familyLabel.localeCompare(b.familyLabel);
    });

    return outcomes;
  }

  function expandRelevantFamilyKeys(context, seedFamilyKeys, depth) {
    var relevant = new Set();
    var frontier = new Set();

    seedFamilyKeys.forEach(function (familyKey) {
      if (!familyKey) return;
      relevant.add(familyKey);
      frontier.add(familyKey);
    });

    for (var level = 0; level < depth; level++) {
      if (!frontier.size) break;
      var nextFrontier = new Set();
      frontier.forEach(function (familyKey) {
        var routeKeys = context.familyToRouteKeys[familyKey] || [];
        for (var i = 0; i < routeKeys.length; i++) {
          var descriptor = context.routeByKey[routeKeys[i]];
          if (!descriptor) continue;
          for (var j = 0; j < descriptor.familyKeys.length; j++) {
            var linkedFamilyKey = descriptor.familyKeys[j];
            if (relevant.has(linkedFamilyKey)) continue;
            relevant.add(linkedFamilyKey);
            nextFrontier.add(linkedFamilyKey);
          }
        }
      });
      frontier = nextFrontier;
    }

    return relevant;
  }

  function buildOptimizationContext(targetSpeciesId, options) {
    options = options || {};
    var canonicalTargetId = getCanonicalSpeciesId(targetSpeciesId);
    var targetFamilyInfo = getFamilyInfo(canonicalTargetId);
    var targetRoutes = getTargetRoutesForSpecies(canonicalTargetId);
    var nuzlockeState = options.includeNuzlockeState === false ? null : getNuzlockeState();
    var syncedFamilyKeys = options.includeNuzlockeState === false
      ? new Set()
      : getSyncedFamilyKeysFromState(nuzlockeState);
    var usedLocationIds = options.includeNuzlockeState === false
      ? new Set()
      : getUsedLocationIdsFromState(nuzlockeState);

    var familyToRouteKeys = {};
    var routeCache = getRouteDescriptorCache();
    for (var i = 0; i < routeCache.routes.length; i++) {
      var descriptor = routeCache.routes[i];
      for (var j = 0; j < descriptor.familyKeys.length; j++) {
        var familyKey = descriptor.familyKeys[j];
        if (!familyToRouteKeys[familyKey]) familyToRouteKeys[familyKey] = [];
        familyToRouteKeys[familyKey].push(descriptor.routeKey);
      }
    }

    return {
      targetSpeciesId: canonicalTargetId,
      targetDisplayName: getSpeciesDisplayName(canonicalTargetId),
      targetFamilyInfo: targetFamilyInfo,
      targetRoutes: targetRoutes,
      syncedFamilyKeys: syncedFamilyKeys,
      usedLocationIds: usedLocationIds,
      hasSavedProgress: !!(nuzlockeState && nuzlockeState.source && nuzlockeState.source !== "none"),
      nuzlockeSource: nuzlockeState && nuzlockeState.source ? nuzlockeState.source : "none",
      routeDescriptors: routeCache.routes,
      routeByKey: routeCache.byKey,
      familyToRouteKeys: familyToRouteKeys,
      memo: {},
      routeOrder: getActiveLocationOrder(),
    };
  }

  function createResultBase(routeAnalysis, threshold) {
    return {
      targetRoute: {
        routeKey: routeAnalysis.routeKey,
        locationId: routeAnalysis.locationId,
        locationName: routeAnalysis.locationName,
        encType: routeAnalysis.encType,
      },
      targetRouteLabel: getTargetRouteLabel(routeAnalysis),
      threshold: threshold,
      thresholdMet: false,
      successChance: 0,
      targetRouteChance: 0,
      stepsRequired: 0,
      maxDepthUsed: 0,
      expectedSteps: 0,
      status: "dead_end",
      branchTree: null,
      summary: {},
      warnings: [],
      distinctLocationCount: 0,
      distinctLocationIds: [],
    };
  }

  function createTerminalTargetResult(routeAnalysis, threshold, targetRouteChance, reason) {
    var result = createResultBase(routeAnalysis, threshold);
    result.successChance = targetRouteChance;
    result.targetRouteChance = targetRouteChance;
    result.thresholdMet = targetRouteChance >= threshold;
    result.status = reason || (result.thresholdMet ? "threshold_met" : "best_under_limit");
    result.branchTree = {
      type: "terminal",
      terminalReason: result.status,
      targetRouteLabel: result.targetRouteLabel,
      targetRouteChance: targetRouteChance,
      successChance: targetRouteChance,
      message:
        result.status === "threshold_met"
          ? "Take " + result.targetRouteLabel + " next."
          : "Best remaining route is " + result.targetRouteLabel + ".",
    };
    result.summary = {
      meetsThreshold: result.thresholdMet,
      routeChance: targetRouteChance,
    };
    return result;
  }

  function createEarlySuccessResult(routeAnalysis, threshold, familyLabel) {
    var result = createResultBase(routeAnalysis, threshold);
    result.successChance = 1;
    result.targetRouteChance = 1;
    result.thresholdMet = true;
    result.status = "success_early_target";
    result.branchTree = {
      type: "terminal",
      terminalReason: "success_early_target",
      targetRouteLabel: result.targetRouteLabel,
      targetRouteChance: 1,
      successChance: 1,
      familyLabel: familyLabel,
      message: "Target family found early.",
    };
    result.summary = {
      meetsThreshold: true,
      routeChance: 1,
    };
    return result;
  }

  function createExactTargetFamilyResult(
    routeAnalysis,
    threshold,
    familyLabel,
    targetSpeciesChanceWithinFamily,
  ) {
    var result = createResultBase(routeAnalysis, threshold);
    var successChance = Math.max(0, Math.min(1, Number(targetSpeciesChanceWithinFamily) || 0));
    result.successChance = successChance;
    result.targetRouteChance = 0;
    result.thresholdMet = successChance >= threshold;
    result.status = successChance > 0 ? "exact_target_family_branch" : "exact_target_family_miss";
    result.branchTree = {
      type: "terminal",
      terminalReason: result.status,
      targetRouteLabel: result.targetRouteLabel,
      targetRouteChance: 0,
      successChance: successChance,
      familyLabel: familyLabel,
      exactSpeciesChance: successChance,
      message:
        successChance > 0
          ? "Target family found early. Only exact species counts as success."
          : "Target family found early, but not the exact species.",
    };
    result.summary = {
      meetsThreshold: result.thresholdMet,
      routeChance: 0,
      exactSpeciesChance: successChance,
    };
    return result;
  }

  function resultComparator(a, b) {
    if (!b) return -1;
    if (a.thresholdMet !== b.thresholdMet) {
      return a.thresholdMet ? -1 : 1;
    }

    if (a.thresholdMet && b.thresholdMet) {
      if (a.stepsRequired !== b.stepsRequired) return a.stepsRequired - b.stepsRequired;
      if (a.maxDepthUsed !== b.maxDepthUsed) return a.maxDepthUsed - b.maxDepthUsed;
      if (a.distinctLocationCount !== b.distinctLocationCount) {
        return a.distinctLocationCount - b.distinctLocationCount;
      }
      if (a.successChance !== b.successChance) return b.successChance - a.successChance;
      if (a.expectedSteps !== b.expectedSteps) return a.expectedSteps - b.expectedSteps;
    } else {
      if (a.successChance !== b.successChance) return b.successChance - a.successChance;
      if (a.stepsRequired !== b.stepsRequired) return a.stepsRequired - b.stepsRequired;
      if (a.maxDepthUsed !== b.maxDepthUsed) return a.maxDepthUsed - b.maxDepthUsed;
      if (a.distinctLocationCount !== b.distinctLocationCount) {
        return a.distinctLocationCount - b.distinctLocationCount;
      }
      if (a.expectedSteps !== b.expectedSteps) return a.expectedSteps - b.expectedSteps;
    }

    if (a.targetRoute && b.targetRoute) {
      var routeCompare = compareLocationLinks(a.targetRoute, b.targetRoute);
      if (routeCompare) return routeCompare;
      var typeOrderA = (window.encTypes || []).indexOf(a.targetRoute.encType);
      var typeOrderB = (window.encTypes || []).indexOf(b.targetRoute.encType);
      if (typeOrderA !== typeOrderB) return typeOrderA - typeOrderB;
    }
    return String(a.targetRouteLabel || "").localeCompare(String(b.targetRouteLabel || ""));
  }

  function buildStateMemoKey(routeAnalysis, state) {
    return [
      routeAnalysis.routeKey,
      state.remainingDepth,
      sortedSetValues(state.dupedFamilyKeys).join(","),
      sortedSetValues(state.usedLocationIds).join(","),
    ].join("|");
  }

  function getRelevantSeedFamilyKeys(routeAnalysis, dupedFamilyKeys, targetFamilyKey) {
    var relevant = new Set([targetFamilyKey]);
    var selected = toKeySet(dupedFamilyKeys);
    for (var i = 0; i < routeAnalysis.competitors.length; i++) {
      if (!selected.has(routeAnalysis.competitors[i].familyKey)) {
        relevant.add(routeAnalysis.competitors[i].familyKey);
      }
    }
    return relevant;
  }

  function getCandidateRoutes(context, routeAnalysis, state) {
    var usedLocationIds = state.usedLocationIds;
    var seedFamilyKeys = getRelevantSeedFamilyKeys(
      routeAnalysis,
      state.dupedFamilyKeys,
      context.targetFamilyInfo.key,
    );
    var relevantFamilyKeys = expandRelevantFamilyKeys(
      context,
      seedFamilyKeys,
      state.remainingDepth,
    );

    var candidates = [];
    for (var i = 0; i < context.routeDescriptors.length; i++) {
      var descriptor = context.routeDescriptors[i];
      if (descriptor.locationId === routeAnalysis.locationId) continue;
      if (usedLocationIds.has(descriptor.locationId)) continue;

      var overlapsRelevant = false;
      for (var j = 0; j < descriptor.familyKeys.length; j++) {
        if (relevantFamilyKeys.has(descriptor.familyKeys[j])) {
          overlapsRelevant = true;
          break;
        }
      }
      if (!overlapsRelevant) continue;
      candidates.push(descriptor);
    }

    return candidates;
  }

  function optimizeRouteState(context, routeAnalysis, state, options) {
    options = options || {};
    var threshold = options.threshold;
    var includeFamilyTree = options.includeFamilyTree !== false;
    var memoKey = buildStateMemoKey(routeAnalysis, state);
    if (context.memo[memoKey]) return context.memo[memoKey];

    var currentOdds = computeAdjustedOdds(routeAnalysis, state.dupedFamilyKeys);
    var fallbackResult = createTerminalTargetResult(
      routeAnalysis,
      threshold,
      currentOdds.chance,
      currentOdds.chance >= threshold ? "threshold_met" : "best_under_limit",
    );

    if (currentOdds.chance >= threshold || state.remainingDepth <= 0) {
      context.memo[memoKey] = fallbackResult;
      return fallbackResult;
    }

    var candidates = getCandidateRoutes(context, routeAnalysis, state);
    var bestResult = fallbackResult;

    for (var i = 0; i < candidates.length; i++) {
      var descriptor = candidates[i];
      var outcomes = getRouteOutcomeDistribution(
        descriptor,
        state.dupedFamilyKeys,
        context.targetSpeciesId,
      );
      if (!outcomes.length) continue;

      var successChance = 0;
      var expectedSteps = 1;
      var stepsRequired = 1;
      var maxDepthUsed = 1;
      var distinctLocationIds = new Set([descriptor.locationId]);
      var branches = [];

      for (var j = 0; j < outcomes.length; j++) {
        var outcome = outcomes[j];
        var childResult;
        if (outcome.familyKey === context.targetFamilyInfo.key) {
          if (includeFamilyTree) {
            childResult = createEarlySuccessResult(
              routeAnalysis,
              threshold,
              outcome.familyLabel,
            );
          } else {
            childResult =
              outcome.targetSpeciesChanceWithinFamily >= 1
                ? createEarlySuccessResult(routeAnalysis, threshold, outcome.familyLabel)
                : createExactTargetFamilyResult(
                    routeAnalysis,
                    threshold,
                    outcome.familyLabel,
                    outcome.targetSpeciesChanceWithinFamily,
                  );
          }
        } else {
          var nextDuped = new Set(state.dupedFamilyKeys);
          nextDuped.add(outcome.familyKey);
          var nextUsed = new Set(state.usedLocationIds);
          nextUsed.add(descriptor.locationId);
          var nextRemainingDepth = Math.min(1, state.remainingDepth - 1);
          childResult = optimizeRouteState(
            context,
            routeAnalysis,
            {
              dupedFamilyKeys: nextDuped,
              usedLocationIds: nextUsed,
              remainingDepth: nextRemainingDepth,
            },
            options,
          );
        }

        successChance += outcome.branchChance * childResult.successChance;
        expectedSteps += outcome.branchChance * childResult.expectedSteps;
        stepsRequired = Math.max(stepsRequired, 1 + childResult.stepsRequired);
        maxDepthUsed = Math.max(maxDepthUsed, 1 + childResult.maxDepthUsed);

        for (var k = 0; k < childResult.distinctLocationIds.length; k++) {
          distinctLocationIds.add(childResult.distinctLocationIds[k]);
        }

        branches.push({
          type: "outcome_branch",
          familyKey: outcome.familyKey,
          familyLabel: outcome.familyLabel,
          encounterLabel: outcome.encounterLabel,
          encounterSpeciesNames: outcome.encounterSpeciesNames,
          branchChance: outcome.branchChance,
          targetChanceAfterBranch: childResult.targetRouteChance,
          targetRouteLabel: childResult.targetRouteLabel,
          child: childResult.branchTree,
        });
      }

      var candidateResult = createResultBase(routeAnalysis, threshold);
      candidateResult.successChance = successChance;
      candidateResult.targetRouteChance = currentOdds.chance;
      candidateResult.thresholdMet = successChance >= threshold;
      candidateResult.stepsRequired = stepsRequired;
      candidateResult.maxDepthUsed = maxDepthUsed;
      candidateResult.expectedSteps = expectedSteps;
      candidateResult.status = candidateResult.thresholdMet ? "threshold_met" : "best_under_limit";
      candidateResult.distinctLocationIds = sortedSetValues(distinctLocationIds);
      candidateResult.distinctLocationCount = candidateResult.distinctLocationIds.length;
      candidateResult.summary = {
        meetsThreshold: candidateResult.thresholdMet,
        routeChance: currentOdds.chance,
      };
      candidateResult.branchTree = {
        type: "encounter_choice",
        locationId: descriptor.locationId,
        locationName: descriptor.locationName,
        encType: descriptor.encType,
        routeKey: descriptor.routeKey,
        children: branches,
      };

      if (resultComparator(candidateResult, bestResult) < 0) {
        bestResult = candidateResult;
      }
    }

    context.memo[memoKey] = bestResult;
    return bestResult;
  }

  function rankOptimizationPlans(plans) {
    return (plans || []).slice().sort(resultComparator);
  }

  function optimizeEncounterRouting(context, options) {
    options = options || {};
    var threshold = Number(options.thresholdPercent);
    if (!Number.isFinite(threshold)) threshold = 100;
    threshold = Math.max(0, Math.min(100, threshold)) / 100;

    var depth = parseInt(options.depth, 10);
    if (!Number.isFinite(depth) || isNaN(depth)) depth = 1;
    depth = Math.max(0, Math.min(4, depth));
    var includeFamilyTree = options.includeFamilyTree !== false;

    var selectedRouteKey = String(options.targetRouteKey || "");
    var results = [];
    var targetRoutes = context.targetRoutes.slice();

    if (selectedRouteKey) {
      targetRoutes = targetRoutes.filter(function (routeAnalysis) {
        return routeAnalysis.routeKey === selectedRouteKey;
      });
    }

    targetRoutes = targetRoutes.filter(function (routeAnalysis) {
      return !context.usedLocationIds.has(routeAnalysis.locationId);
    });

    for (var i = 0; i < targetRoutes.length; i++) {
      var routeAnalysis = targetRoutes[i];
      var result = optimizeRouteState(
        context,
        routeAnalysis,
        {
          dupedFamilyKeys: new Set(context.syncedFamilyKeys),
          usedLocationIds: new Set(context.usedLocationIds),
          remainingDepth: depth,
        },
        {
          threshold: threshold,
          includeFamilyTree: includeFamilyTree,
        },
      );
      result.threshold = threshold;
      result.targetRouteLabel = getTargetRouteLabel(routeAnalysis);
      result.rootTargetRoute = routeAnalysis.routeKey;
      result.includeFamilyTree = includeFamilyTree;
      results.push(result);
    }

    return rankOptimizationPlans(results);
  }

  function formatOutcomeBranchLines(branch, lines, indent, nextStepNumber) {
    var prefix =
      indent +
      "- If you hit " +
      (branch.encounterLabel || branch.familyLabel + " family") +
      " (" +
      formatPercent(branch.branchChance * 100) +
      ")";

    if (!branch.child) {
      lines.push(prefix + ".");
      return;
    }

    if (branch.child.type === "terminal") {
      switch (branch.child.terminalReason) {
        case "success_early_target":
          lines.push(prefix + ": SUCCESS (target family found early)");
          return;
        case "exact_target_family_branch":
          lines.push(
            prefix +
              ": " +
              formatPercent(branch.child.exactSpeciesChance * 100) +
              " chance to hit the exact target species here; otherwise the family is burned",
          );
          return;
        case "exact_target_family_miss":
          lines.push(prefix + ": target family found, but not the exact species");
          return;
        case "threshold_met":
          lines.push(
            prefix +
              ": then take " +
              branch.child.targetRouteLabel +
              " next (" +
              formatPercent(branch.child.targetRouteChance * 100) +
              ")",
          );
          return;
        case "best_under_limit":
          lines.push(
            prefix +
              ": best remaining route is " +
              branch.child.targetRouteLabel +
              " (" +
              formatPercent(branch.child.targetRouteChance * 100) +
              ")",
          );
          return;
      }
    }

    lines.push(
      prefix +
        ": current " +
        branch.targetRouteLabel +
        " chance becomes " +
        formatPercent(branch.targetChanceAfterBranch * 100),
    );
    formatPlanNodeLines(branch.child, lines, indent + "  ", nextStepNumber);
  }

  function formatPlanNodeLines(node, lines, indent, stepNumber) {
    if (!node) return;
    if (node.type === "terminal") {
      if (node.terminalReason === "threshold_met") {
        lines.push(
          indent +
            "Take " +
            node.targetRouteLabel +
            " next: " +
            formatPercent(node.targetRouteChance * 100),
        );
      } else if (node.terminalReason === "best_under_limit") {
        lines.push(
          indent +
            "Best remaining route is " +
            node.targetRouteLabel +
            ": " +
            formatPercent(node.targetRouteChance * 100),
        );
      } else if (node.terminalReason === "success_early_target") {
        lines.push(indent + "SUCCESS (target family found early)");
      } else if (node.terminalReason === "exact_target_family_branch") {
        lines.push(
          indent +
            "Target family found early: exact-species success chance here is " +
            formatPercent(node.exactSpeciesChance * 100),
        );
      } else if (node.terminalReason === "exact_target_family_miss") {
        lines.push(indent + "Target family found early, but not the exact species");
      }
      return;
    }

    lines.push(
      indent +
        "Encounter " +
        stepNumber +
        ": " +
        node.locationName +
        " (" +
        encTypeLabel(node.encType) +
        ")",
    );
    for (var i = 0; i < (node.children || []).length; i++) {
      formatOutcomeBranchLines(node.children[i], lines, indent + "  ", stepNumber + 1);
    }
  }

  function getTerminalContributionChance(node) {
    if (!node || node.type !== "terminal") return 0;
    switch (node.terminalReason) {
      case "success_early_target":
        return 1;
      case "exact_target_family_branch":
        return Number(node.exactSpeciesChance) || 0;
      case "threshold_met":
      case "best_under_limit":
        return Number(node.targetRouteChance) || 0;
      default:
        return 0;
    }
  }

  function buildSuccessBreakdownDescription(path, terminalNode) {
    var lastStep = path.length ? path[path.length - 1] : null;
    if (terminalNode.terminalReason === "success_early_target" && lastStep) {
      return (
        "from finding " +
        (lastStep.encounterLabel || lastStep.familyLabel) +
        " in " +
        lastStep.locationName +
        " (" +
        encTypeLabel(lastStep.encType) +
        ")"
      );
    }
    if (terminalNode.terminalReason === "exact_target_family_branch" && lastStep) {
      return (
        "from the exact target-species roll inside " +
        (lastStep.encounterLabel || lastStep.familyLabel) +
        " in " +
        lastStep.locationName +
        " (" +
        encTypeLabel(lastStep.encType) +
        ")"
      );
    }
    if (!path.length) {
      return "from taking " + terminalNode.targetRouteLabel + " immediately";
    }
    return (
      "to find " +
      (lastStep.encounterLabel || lastStep.familyLabel) +
      " in " +
      lastStep.locationName +
      " (" +
      encTypeLabel(lastStep.encType) +
      "), then encounter from " +
      terminalNode.targetRouteLabel +
      " at a boosted " +
      formatPercent((Number(terminalNode.targetRouteChance) || 0) * 100)
    );
  }

  function collectSuccessBreakdownEntries(node, cumulativeChance, path, entries) {
    if (!node) return;
    if (node.type === "terminal") {
      var terminalChance = getTerminalContributionChance(node);
      var contribution = cumulativeChance * terminalChance;
      if (contribution > 0) {
        entries.push({
          contribution: contribution,
          description: buildSuccessBreakdownDescription(path, node),
        });
      }
      return;
    }

    for (var i = 0; i < (node.children || []).length; i++) {
      var branch = node.children[i];
      collectSuccessBreakdownEntries(
        branch.child,
        cumulativeChance * (Number(branch.branchChance) || 0),
        path.concat([
          {
            locationName: node.locationName,
            encType: node.encType,
            familyLabel: branch.familyLabel,
            encounterLabel: branch.encounterLabel,
          },
        ]),
        entries,
      );
    }
  }

  function getSuccessBreakdownEntries(result) {
    var entries = [];
    collectSuccessBreakdownEntries(result && result.branchTree, 1, [], entries);
    entries.sort(function (a, b) {
      if (b.contribution !== a.contribution) return b.contribution - a.contribution;
      return a.description.localeCompare(b.description);
    });
    return entries;
  }

  function formatOptimizationPlan(result) {
    if (!result) return "";
    var lines = [];
    var breakdownEntries = getSuccessBreakdownEntries(result);
    if (breakdownEntries.length) {
      lines.push("Success breakdown:");
      for (var breakdownIndex = 0; breakdownIndex < breakdownEntries.length; breakdownIndex++) {
        lines.push(
          "- " +
            formatPercent(breakdownEntries[breakdownIndex].contribution * 100) +
            " " +
            breakdownEntries[breakdownIndex].description,
        );
      }
      lines.push("");
    }
    formatPlanNodeLines(result.branchTree, lines, "", 1);
    return lines.join("\n");
  }

  function formatOptimizationPlanHtml(result) {
    var text = formatOptimizationPlan(result);
    if (!text) return "";

    var escaped = escapeHTML(text);
    escaped = escaped.replace(
      /^- ([0-9.]+%) /gm,
      '- <span class="ddex-advanced-highlight">$1</span> ',
    );
    return escaped.replace(/\n/g, "<br />");
  }

  function getBranchEncounterLabel(branch) {
    return branch.encounterLabel || (branch.familyLabel ? branch.familyLabel + " family" : "that family");
  }

  function getTerminalNodeStatusClass(node) {
    switch (node && node.terminalReason) {
      case "success_early_target":
      case "exact_target_family_branch":
      case "threshold_met":
        return "success";
      case "exact_target_family_miss":
        return "failure";
      default:
        return "neutral";
    }
  }

  function renderTerminalNodeHtml(node) {
    if (!node) return "";
    var statusClass = getTerminalNodeStatusClass(node);
    var buf =
      '<div class="ddex-advanced-flow-terminal ' +
      statusClass +
      '">';

    switch (node.terminalReason) {
      case "success_early_target":
        buf += "SUCCESS: target family found early";
        break;
      case "exact_target_family_branch":
        buf +=
          'Exact-species success chance here: <span class="ddex-advanced-highlight">' +
          formatPercent(node.exactSpeciesChance * 100) +
          "</span>";
        break;
      case "exact_target_family_miss":
        buf += "Target family found, but not the exact species";
        break;
      case "threshold_met":
      case "best_under_limit":
        buf +=
          "Then encounter from <strong>" +
          escapeHTML(node.targetRouteLabel) +
          '</strong> at <span class="ddex-advanced-highlight">' +
          formatPercent(node.targetRouteChance * 100) +
          "</span>";
        break;
      default:
        buf += escapeHTML(node.message || "Continue");
        break;
    }

    buf += "</div>";
    return buf;
  }

  function renderFlowNodeHtml(node, stepNumber) {
    if (!node) return "";
    if (node.type === "terminal") {
      return renderTerminalNodeHtml(node);
    }

    var buf =
      '<section class="ddex-advanced-flow-step">' +
      '<div class="ddex-advanced-flow-step-header">' +
      '<span class="ddex-advanced-flow-step-index">' +
      stepNumber +
      "</span>" +
      '<div class="ddex-advanced-flow-step-copy">' +
      '<div class="ddex-advanced-flow-step-title">Encounter ' +
      stepNumber +
      "</div>" +
      '<div class="ddex-advanced-flow-step-route">' +
      escapeHTML(node.locationName) +
      " (" +
      escapeHTML(encTypeLabel(node.encType)) +
      ")" +
      "</div>" +
      "</div>" +
      "</div>";

    if (node.children && node.children.length) {
      buf += '<div class="ddex-advanced-flow-branches">';
      for (var i = 0; i < node.children.length; i++) {
        var branch = node.children[i];
        var branchLabel = getBranchEncounterLabel(branch);
        var branchClass = branch.child ? getTerminalNodeStatusClass(branch.child) : "neutral";
        buf +=
          '<div class="ddex-advanced-flow-branch ' +
          branchClass +
          '">' +
          '<div class="ddex-advanced-flow-branch-header">' +
          '<span class="ddex-advanced-highlight ddex-advanced-flow-branch-chance">' +
          formatPercent(branch.branchChance * 100) +
          "</span>" +
          '<span class="ddex-advanced-flow-branch-label">Hit ' +
          escapeHTML(branchLabel) +
          "</span>" +
          "</div>" +
          '<div class="ddex-advanced-flow-branch-body">';

        if (branch.child && branch.child.type === "encounter_choice") {
          buf +=
            '<div class="ddex-advanced-flow-branch-note">Continue routing with this outcome.</div>' +
            renderFlowNodeHtml(branch.child, stepNumber + 1);
        } else {
          buf += renderTerminalNodeHtml(branch.child);
        }

        buf += "</div></div>";
      }
      buf += "</div>";
    }

    buf += "</section>";
    return buf;
  }

  function renderSuccessBreakdownHtml(result) {
    var entries = getSuccessBreakdownEntries(result);
    if (!entries.length) return "";

    var buf =
      '<details class="ddex-advanced-section ddex-advanced-breakdown">' +
      '<summary class="ddex-advanced-section-summary">Success breakdown</summary>' +
      '<div class="ddex-advanced-breakdown-list">';

    for (var i = 0; i < entries.length; i++) {
      buf +=
        '<div class="ddex-advanced-breakdown-row">' +
        '<span class="ddex-advanced-highlight ddex-advanced-breakdown-percent">' +
        formatPercent(entries[i].contribution * 100) +
        "</span>" +
        '<span class="ddex-advanced-breakdown-copy">' +
        escapeHTML(entries[i].description) +
        "</span>" +
        "</div>";
    }

    buf += "</div></details>";
    return buf;
  }

  function renderOptimizationSectionsHtml(result) {
    if (!result) return "";
    return (
      renderSuccessBreakdownHtml(result) +
      '<section class="ddex-advanced-section ddex-advanced-flow">' +
      '<div class="ddex-advanced-section-title">Encounter steps</div>' +
      renderFlowNodeHtml(result.branchTree, 1) +
      "</section>"
    );
  }

  function getEffectiveSelectedFamilies(routeAnalysis, syncedFamilyKeys, manualOverrides) {
    var allowed = {};
    for (var i = 0; i < routeAnalysis.competitors.length; i++) {
      allowed[routeAnalysis.competitors[i].familyKey] = true;
    }

    var selected = new Set();
    var synced = toKeySet(syncedFamilyKeys);
    synced.forEach(function (familyKey) {
      if (allowed[familyKey]) selected.add(familyKey);
    });

    for (var overrideKey in manualOverrides || {}) {
      if (!allowed[overrideKey]) continue;
      if (manualOverrides[overrideKey]) selected.add(overrideKey);
      else selected.delete(overrideKey);
    }

    return selected;
  }

  function computeAdjustedOdds(routeAnalysis, selectedFamilyKeys) {
    var selected = toKeySet(selectedFamilyKeys);
    var removedWeight = 0;
    for (var i = 0; i < routeAnalysis.competitors.length; i++) {
      var competitor = routeAnalysis.competitors[i];
      if (selected.has(competitor.familyKey)) {
        removedWeight += competitor.removedWeight;
      }
    }

    var denominator = routeAnalysis.totalWeight - removedWeight;
    var chance = 0;
    if (routeAnalysis.targetWeight > 0) {
      if (denominator <= 0) chance = 1;
      else chance = routeAnalysis.targetWeight / denominator;
    }
    if (chance > 1) chance = 1;
    if (chance < 0 || !Number.isFinite(chance)) chance = 0;

    return {
      removedWeight: removedWeight,
      denominator: denominator,
      chance: chance,
      percent: chance * 100,
      percentText: formatPercent(chance * 100),
      removedWeightText: formatWeight(removedWeight),
      basePercentText: formatPercent(routeAnalysis.targetBasePercent),
    };
  }

  function renderLocationLinks(links) {
    if (!links || !links.length) return '<span class="ddex-route-family-locations-empty">none</span>';
    var root = getRouterRoot();
    var parts = [];
    for (var i = 0; i < links.length; i++) {
      parts.push(
        '<a class="ddex-route-family-location-link" href="' +
          root +
          "encounters/" +
          escapeHTML(links[i].locationId) +
          '" data-target="push">' +
          escapeHTML(links[i].locationName) +
          "</a>",
      );
    }
    return parts.join(", ");
  }

  function renderRoutePanel(routeAnalysis, panelState) {
    var selected = getEffectiveSelectedFamilies(
      routeAnalysis,
      panelState && panelState.syncedFamilyKeys,
      (panelState && panelState.manualOverrides) || {},
    );
    var adjusted = computeAdjustedOdds(routeAnalysis, selected);

    var buf =
      '<div class="ddex-route-panel" data-route-key="' +
      escapeHTML(routeAnalysis.routeKey) +
      '">' +
      '<div class="ddex-route-panel-summary">' +
      '<strong class="ddex-route-panel-current">' +
      adjusted.percentText +
      "</strong>" +
      '<span class="ddex-route-panel-meta">Base ' +
      adjusted.basePercentText +
      "</span>" +
      '<span class="ddex-route-panel-meta">Removed ' +
      adjusted.removedWeightText +
      "</span>" +
      "</div>";

    if (!routeAnalysis.competitors.length) {
      buf += '<div class="ddex-route-empty">No duplicate families available for this encounter.</div>';
      buf += "</div>";
      return buf;
    }

    buf += '<div class="ddex-route-family-list">';
    for (var i = 0; i < routeAnalysis.competitors.length; i++) {
      var competitor = routeAnalysis.competitors[i];
      var isSelected = selected.has(competitor.familyKey);
      buf +=
        '<div class="ddex-route-family-row' +
        (isSelected ? " is-selected" : "") +
        '" data-route-key="' +
        escapeHTML(routeAnalysis.routeKey) +
        '" data-family-key="' +
        escapeHTML(competitor.familyKey) +
        '">' +
        '<div class="ddex-route-family-main">' +
        '<span class="ddex-route-family-text">Dupe ' +
        escapeHTML(competitor.label) +
        " Family in " +
        renderLocationLinks(competitor.locationLinks) +
        "</span>" +
        '<span class="ddex-route-family-rate">' +
        formatWeight(competitor.removedWeight) +
        "</span>" +
        "</div>" +
        "</div>";
    }
    buf += "</div></div>";
    return buf;
  }

  window.DDEXEncounterRouting = {
    getCanonicalSpeciesId: getCanonicalSpeciesId,
    getFamilyInfo: getFamilyInfo,
    getEncounterSlots: getEncounterSlots,
    buildRouteAnalysis: buildRouteAnalysis,
    buildOptimizationContext: buildOptimizationContext,
    optimizeEncounterRouting: optimizeEncounterRouting,
    rankOptimizationPlans: rankOptimizationPlans,
    formatOptimizationPlan: formatOptimizationPlan,
    getEffectiveSelectedFamilies: getEffectiveSelectedFamilies,
    computeAdjustedOdds: computeAdjustedOdds,
    renderRoutePanel: renderRoutePanel,
    getFamilyLocationLinks: getFamilyLocationLinks,
    formatPercent: formatPercent,
    formatOptimizationPlanHtml: formatOptimizationPlanHtml,
    renderOptimizationSectionsHtml: renderOptimizationSectionsHtml,
  };
})();
