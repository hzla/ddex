// Keep calculator labels free of delimiters used by its set-name parser.
// Trainer IDs retain the preset identity; plain numbers distinguish repeated names.
export function normalizePixelmonCalcSetNames(result) {
  const trainers = new Map();
  const usedNames = new Set();
  let changed = result.calcSetNameVersion !== 1;
  for (const trainer of result.trainers || []) {
    const baseName = String(trainer.name || "Trainer")
      .replace(/\s+\([^()]*\)$/, "")
      .replace(/[()[\]]/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "Trainer";
    let calcName = baseName;
    let number = 2;
    while (usedNames.has(calcName)) calcName = `${baseName} ${number++}`;
    usedNames.add(calcName);
    if (trainer.calcName !== calcName) changed = true;
    trainer.calcName = calcName;
    trainers.set(Number(trainer.id), trainer);
  }

  const formattedSets = Object.create(null);
  for (const [species, sets] of Object.entries(result.backupData?.formatted_sets || {})) {
    const renamedSets = Object.create(null);
    for (const [oldLabel, set] of Object.entries(sets)) {
      const trainer = trainers.get(Number(set.tr_id));
      const label = trainer
        ? `Lvl ${set.level || 100} ${trainer.calcName} #${Number(set.sub_index) + 1}`
        : oldLabel.replace(/\s*\([^()]*\)|\s*\[[^\]]*\]/g, "").trim();
      if (Object.hasOwn(renamedSets, label)) throw new Error(`Duplicate calculator set label: ${species} ${label}`);
      if (oldLabel !== label || set.pixelmonRandomPool !== !!trainer?.random || set.pixelmonTrainerName !== trainer?.calcName) changed = true;
      renamedSets[label] = { ...set, pixelmonRandomPool: !!trainer?.random, pixelmonTrainerName: trainer?.calcName };
    }
    formattedSets[species] = renamedSets;
  }
  if (result.backupData) result.backupData.formatted_sets = formattedSets;
  result.calcSetNameVersion = 1;
  return changed;
}
