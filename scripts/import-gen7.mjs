#!/usr/bin/env node
// Install the JSON produced by Dynamic Calc's tools/gen7/export_dynamic_calc.py.
import fs from 'node:fs/promises';
import path from 'node:path';
import {buildDdexSearchIndex} from '../rom/gen3-export/lib/ddex-search-index.mjs';
import {formatSearchIndexJs} from '../rom/gen3-export/lib/file-formats.mjs';

const [input, slug] = process.argv.slice(2);
if (!input || !/^[a-z0-9_-]+$/.test(slug || '')) {
  throw new Error('Usage: node scripts/import-gen7.mjs <export.ddex.json> <game-slug>');
}
const overrides = JSON.parse(await fs.readFile(input, 'utf8'));
const manifest = JSON.parse(await fs.readFile(path.join(path.dirname(input), 'dynamic_calc_manifest.json'), 'utf8'));
for (const key of ['poks', 'moves', 'abilities', 'items', 'encs']) {
  if (!overrides[key] || typeof overrides[key] !== 'object') throw new Error(`Missing ${key}`);
}
for (const [name, mon] of Object.entries(overrides.poks)) {
  if (!mon.bs || !mon.abs || !mon.learnset_info) throw new Error(`Invalid species ${name}`);
  if (mon.evos) for (const key of ['evoMethods','evoMethodIds','evoParams','evoLevels']) {
    if (mon[key]?.length !== mon.evos.length) throw new Error(`Unaligned ${name}.${key}`);
  }
}
const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'data', 'overrides', slug);
await fs.writeFile(out + '.js', 'var hideEffectIds = true;\nvar overrides = ' + JSON.stringify(overrides, null, 2) + ';\n');
await fs.writeFile(out + '_searchindex.js', formatSearchIndexJs(buildDdexSearchIndex(overrides)));
await fs.writeFile(out + '.manifest.json', JSON.stringify(manifest, null, 2) + '\n');
console.log(`Installed ${Object.keys(overrides.poks).length} species/forms and ${Object.keys(overrides.moves).length} moves as ${slug}.`);
