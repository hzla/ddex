# Photonic Sun Rebalanced

Generated from the supplied decrypted Ultra Sun + v1.2 update + Rebalanced LayeredFS
assets. The game key is `photonicsun`; `pspm` is an alias. This is specifically the
supplied **Photonic Sun Rebalanced** build, even though the calculator's historic
catalog title is “Photonic Sun/Prismatic Moon”. It is not an independently audited
Prismatic Moon export.

The sibling Dynamic Calc repository's `tools/gen7/export_dynamic_calc.py` produces
the JSON. From this repository, regenerate the browser data assets with:

```sh
node scripts/import-gen7.mjs ../photonic-sun/output/dynamic-calc/photonicsun.ddex.json photonicsun
npm test
npm run build
```

Coverage: 1,011 species/forms, 728 move records, ROM level-up/egg/TM/tutor
compatibility, evolution branches and minimum levels, ability/item descriptions,
wild held items, and regular day/night encounter pools for 74 areas. Area/table
numbers are retained because binary tables alone do not establish terrain or
story-script conditions. Conditional SOS/weather slots remain in the extraction's
`encounters.raw.json`; static/gift locations are not mapped here.

The exporter reads patched TM assignments from code.bin. Tutor assignments use
standard pk3DS index lists unless configured. Table data does not prove arbitrary
changes to executable ability/move/evolution mechanics. Full provenance and
input hashes are in `photonic-sun/output/dynamic-calc/dynamic_calc_manifest.json`
in the workspace; see the reusable exporter README for all assumptions.

Evolution names are semantic, with original Gen 7 IDs retained for provenance.
`evoLevels` preserves the independent minimum level; these IDs must not use the
legacy Gen 4 method-number table. `learnset_info.eggMoves` supplies explicit egg
moves. No emulator test was used for this integration.
