import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { buildFireRedDeluxeArtifacts, FIRE_RED_DELUXE_SPRITE_ALIASES } from "../rom/fire-red-deluxe.mjs";
import { verifyFireRedDeluxeDocumentation } from "../rom/fire-red-deluxe-documentation.mjs";

const args = process.argv.slice(2);
const option = name => args[args.indexOf(name) + 1];
if (!args.includes("--hard-rom") || !args.includes("--normal-rom") || !args.includes("--workbook-json")) {
  throw new Error("Usage: node scripts/extract-fire-red-deluxe.mjs --hard-rom PATH --normal-rom PATH --workbook-json PATH [--calc-dir PATH]");
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const calcRoot = args.includes("--calc-dir") ? path.resolve(option("--calc-dir")) : path.resolve(root, "../Dynamic-Calc-Hgengine");
const layout = JSON.parse(fs.readFileSync(path.join(root, "rom/gen3-export/data/fire-red-deluxe-layout.json"), "utf8"));
const workbook = JSON.parse(fs.readFileSync(option("--workbook-json"), "utf8"));
const saves = {};
const reports = {};
for (const mode of ["normal", "hard"]) {
  const romPath = option(mode === "hard" ? "--hard-rom" : "--normal-rom");
  const rom = fs.readFileSync(romPath);
  const result = buildFireRedDeluxeArtifacts(rom, layout, mode);
  const report = verifyFireRedDeluxeDocumentation(result, workbook);
  report.rom = path.basename(romPath);
  report.romSha256 = createHash("sha256").update(rom).digest("hex");
  const slug = result.slug;
  const compact = (global, data) => `${global} = ${JSON.stringify(data)};\n`;
  fs.writeFileSync(path.join(calcRoot, `backups/${slug}.js`), compact("backup_data", result.calcOutput));
  fs.writeFileSync(path.join(calcRoot, `backups/trainer_orders/${slug}.js`), compact("trainerOrders", report.order.linked));
  fs.writeFileSync(path.join(root, `data/overrides/${slug}.js`), "var hideEffectIds = true;\n" + compact("var overrides", result.dexOutput));
  fs.writeFileSync(path.join(root, `data/overrides/${slug}_searchindex.js`), result.files.searchIndex.text);
  saves[slug] = result.saveConstants;
  reports[mode] = report;
  console.log(mode, result.summary, report.checks, "Differences:", report.differences.length,
    "Linked trainers:", Object.keys(report.order.linked).length, "Unmatched order rows:", report.order.unmatched.length);
}
fs.writeFileSync(path.join(calcRoot, "js/savereaders/save_constants/fire_red_deluxe.js"),
  `window.fireRedDeluxeSaveConstants = ${JSON.stringify(saves)};\nwindow.fireRedDeluxeSpriteAliases = ${JSON.stringify(FIRE_RED_DELUXE_SPRITE_ALIASES)};\n`);
const reportDir = path.join(root, "rom/reports");
fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(path.join(reportDir, "fire-red-deluxe-verification.json"), JSON.stringify(reports, null, 2) + "\n");
const summary = ["# Fire Red Deluxe Verification", "",
  "ROM data is authoritative. The v20.5 workbook is used for comparison and trainer navigation, not to overwrite ROM values.",
  "The Trainer List is read top-to-bottom within each location column, then left-to-right. Rival alternatives share navigation links.",
  "Encounter checks compare species, combined slot rates and level ranges. Documented floors are grouped by their ROM location name; unmapped names are reported, not treated as matches.",
  "Boss comparisons ignore move-slot and party ordering, but compare species, levels, abilities, natures, held items and moves.", ""];
summary.push("Regional abbreviations resolve to canonical species. Surfing/Flying Pikachu use Pikachu sprites. Legacy/custom forms without dedicated assets use matching base-species sprites; their distinct ROM stats and names are preserved.", "");
summary.push("Hard Mode has three Weather Ball records. The Water and Fire variants are explicitly named Weather Ball (Water) and Weather Ball (Fire), preserving their distinct move IDs, types and PP.", "");
for (const [mode, report] of Object.entries(reports)) {
  summary.push(`## ${mode === "hard" ? "Hard" : "Normal"} Mode`, "",
    `ROM: ${report.rom}. SHA256: ${report.romSha256}.`, "",
    `Checked ${report.checks.species} documented species, ${report.checks.learnsetMoves} level-up entries, ${report.checks.moves} moves, ${report.checks.bosses} boss entries and ${report.checks.encounters} encounter entries.`,
    `Linked ${Object.keys(report.order.linked).length} ROM trainer IDs in ${report.order.groups.length} documented fights.`,
    `Reported ${report.differences.length} data/name discrepancies and ${report.order.unmatched.length} unmatched trainer-order entries.`, "",
    ...(report.order.unmatched.length ? ["Unmatched trainer-order entries:", ...report.order.unmatched.map(row => `- ${row.cell}: ${row.location}: ${row.name}`)] : ["All trainer rows resolved; no unmatched navigation entries."]), "");
}
summary.push("Full cell-level comparisons and trainer-order mappings: ddex/rom/reports/fire-red-deluxe-verification.json.", "",
  "## Regeneration", "",
  "Run from the ddex repository. Python requires openpyxl. Keep ROMs and the original workbook outside the repositories.", "",
  "```sh",
  'python3 scripts/extract-fire-red-deluxe-workbook.py "PATH_TO_WORKBOOK.xlsx" /tmp/frd-workbook.json',
  'node scripts/extract-fire-red-deluxe.mjs --hard-rom "PATH_TO_HARD_ROM.gba" --normal-rom "PATH_TO_NORMAL_ROM.gba" --workbook-json /tmp/frd-workbook.json',
  "```", "",
  "The extractor validates relocated table pointers and refuses a changed ROM layout instead of silently exporting misaligned data.", "");
fs.writeFileSync(path.join(calcRoot, "agent_notes/fire_red_deluxe_verification.md"), summary.join("\n"));
