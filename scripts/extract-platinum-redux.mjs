import { mkdir, readFile, writeFile } from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ddexRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(ddexRoot, "..");
const calcRoot = path.join(workspaceRoot, "Dynamic-Calc-Hgengine");

const ROMS = [
  {
    file: path.join(workspaceRoot, "platredux.nds"),
    title: "Platinum Redux",
    backupName: "platredux",
    emitDex: false,
  },
  {
    file: path.join(workspaceRoot, "platreduxhc.nds"),
    title: "Platinum Redux HC",
    backupName: "platreduxhc",
    emitDex: true,
  },
];

function installBrowserShims() {
  globalThis.window = globalThis;
  globalThis.document = {
    createElement() {
      return {
        click() {},
        remove() {},
        set href(_value) {},
        set download(_value) {},
      };
    },
    body: {
      appendChild() {},
      removeChild() {},
    },
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async function fetchLocalAsset(input) {
    const rawUrl = String(input || "");
    let localPath = "";

    if (rawUrl.startsWith("file://")) {
      localPath = fileURLToPath(rawUrl);
    } else if (rawUrl.startsWith("./")) {
      let relPath = rawUrl.replace(/^\.\//, "");
      if (relPath.startsWith("vanilla_texts/") || relPath.startsWith("texts/")) {
        relPath = path.join("rom", relPath);
      }
      localPath = path.join(ddexRoot, relPath);
    }

    if (localPath) {
      const text = await readFile(localPath, "utf8");
      return {
        ok: true,
        status: 200,
        text: async () => text,
      };
    }

    if (typeof originalFetch === "function") {
      return originalFetch(input);
    }

    throw new Error(`Unsupported fetch URL: ${rawUrl}`);
  };
}

function evalGlobal(relPath) {
  const code = fs.readFileSync(path.join(ddexRoot, relPath), "utf8");
  vm.runInThisContext(code, { filename: relPath });
}

function loadExports(relPath) {
  const code = fs.readFileSync(path.join(ddexRoot, relPath), "utf8");
  const sandbox = { exports: {} };
  vm.runInNewContext(code, sandbox, { filename: relPath });
  return sandbox.exports;
}

function installDdexDataGlobals() {
  evalGlobal("rom/gen4_symbols.js");
  evalGlobal("rom/platinum_scrcmd_database.js");
  evalGlobal("rom/hgss_scrcmd_database.js");

  window.BattleAliases = loadExports("data/alias.js").BattleAliases || {};
  window.BattleTypeChart = loadExports("data/typechart.js").BattleTypeChart || {};
  window.BattleMovedex = loadExports("data/moves.js").BattleMovedex || {};
  window.BattlePokedex = loadExports("data/species.js").BattlePokedex || {};
}

function stripPrivateMeta(value) {
  return JSON.stringify(value, (key, nextValue) => (key === "_meta" ? undefined : nextValue), 2);
}

function formatBackupDataFile(backupData) {
  return `backup_data = ${stripPrivateMeta(backupData)};\n`;
}

function formatOverridesFile(overrides) {
  return `var overrides = ${JSON.stringify(overrides, null, 2)};\n`;
}

function formatSearchIndexFile(result) {
  return [
    "// DO NOT EDIT - automatically built with scripts/extract-platinum-redux.mjs",
    "",
    `exports.BattleSearchIndex = ${JSON.stringify(result.searchIndex)};`,
    "",
    `exports.BattleSearchIndexOffset = ${JSON.stringify(result.searchIndexOffset)};`,
    "",
    `exports.BattleSearchCountIndex = ${JSON.stringify(result.searchIndexCount)};`,
    "",
    "exports.BattleArticleTitles = {};",
    "",
  ].join("\n");
}

async function writeExtractionOutputs(romConfig, result) {
  if (result.romFamily !== "Plat") {
    throw new Error(`${romConfig.file} extracted as ${result.romFamily}, expected Plat`);
  }

  const backupData = {
    ...(result.backupData || {}),
    title: romConfig.title,
  };
  const calcBackupPath = path.join(calcRoot, "backups", `${romConfig.backupName}.js`);
  await mkdir(path.dirname(calcBackupPath), { recursive: true });
  await writeFile(calcBackupPath, formatBackupDataFile(backupData), "utf8");

  const summary = {
    title: romConfig.title,
    romTitle: result.romTitle,
    romFamily: result.romFamily,
    backup: path.relative(workspaceRoot, calcBackupPath),
    backupPoks: Object.keys(backupData.poks || {}).length,
    backupMoves: Object.keys(backupData.moves || {}).length,
    formattedSets: Object.keys(backupData.formatted_sets || {}).length,
  };

  if (romConfig.emitDex) {
    const overridesPath = path.join(ddexRoot, "data", "overrides", "platinumredux.js");
    const searchIndexPath = path.join(ddexRoot, "data", "overrides", "platinumredux_searchindex.js");
    await mkdir(path.dirname(overridesPath), { recursive: true });
    await writeFile(overridesPath, formatOverridesFile(result.overrides), "utf8");
    await writeFile(searchIndexPath, formatSearchIndexFile(result), "utf8");
    summary.dexOverrides = path.relative(workspaceRoot, overridesPath);
    summary.dexSearchIndex = path.relative(workspaceRoot, searchIndexPath);
    summary.overridePoks = Object.keys(result.overrides?.poks || {}).length;
    summary.overrideMoves = Object.keys(result.overrides?.moves || {}).length;
    summary.overrideItems = Object.keys(result.overrides?.items || {}).length;
    summary.overrideAbilities = Object.keys(result.overrides?.abilities || {}).length;
    summary.overrideEncs = Object.keys(result.overrides?.encs || {}).length;
    summary.searchIndex = result.searchIndex?.length || 0;
  }

  return summary;
}

async function main() {
  installBrowserShims();
  installDdexDataGlobals();

  const { buildOverridesFromRom } = await import(pathToFileURL(path.join(ddexRoot, "rom", "dspre_export.js")));
  const summaries = [];

  for (const romConfig of ROMS) {
    const romBytes = await readFile(romConfig.file);
    const logs = [];
    const result = await buildOverridesFromRom(
      romBytes.buffer.slice(romBytes.byteOffset, romBytes.byteOffset + romBytes.byteLength),
      {
        log(message) {
          if (/^(ROM ID|Parsed CSV|Item locations|Overrides counts|\[warn\])/.test(message)) {
            logs.push(message);
          }
        },
      }
    );
    const summary = await writeExtractionOutputs(romConfig, result);
    summary.logs = logs;
    summaries.push(summary);
  }

  console.log(JSON.stringify(summaries, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
