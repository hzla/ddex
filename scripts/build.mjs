import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { scriptChunks, staticCopies, styleChunks } from "./chunks.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const buildTarget =
  process.env.DDEX_TARGET === "github-pages" ? "github-pages" : "vercel";
const basePath = normalizeBasePath(process.env.DDEX_BASE_PATH || "");
const outputDir =
  process.env.DDEX_OUTPUT_DIR ||
  (buildTarget === "github-pages" ? "dist-pages" : "dist");
const distDir = path.resolve(rootDir, outputDir);
const assetsDir = path.join(distDir, "assets");

function normalizeBasePath(input) {
  const value = String(input || "").trim();
  if (!value || value === "/") return "";
  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  return withLeadingSlash.replace(/\/+$/, "");
}

function joinBasePath(currentBasePath, relPath) {
  if (!relPath) return currentBasePath || "/";
  if (/^(?:[a-z]+:)?\/\//i.test(relPath)) return relPath;
  if (!relPath.startsWith("/")) return relPath;
  if (!currentBasePath) return relPath;
  if (relPath === currentBasePath || relPath.startsWith(`${currentBasePath}/`)) {
    return relPath;
  }
  if (relPath === "/") return `${currentBasePath}/`;
  return `${currentBasePath}${relPath}`;
}

function hashContent(contents) {
  return createHash("sha256").update(contents).digest("hex").slice(0, 10);
}

async function readSource(relPath) {
  return readFile(path.join(rootDir, relPath), "utf8");
}

function joinScripts(parts) {
  return parts
    .map((part, index) => {
      return [
        `/* ${index + 1}: ${part.path} */`,
        part.contents.replace(/\s+$/g, ""),
      ].join("\n");
    })
    .join("\n\n");
}

function joinStyles(parts) {
  return parts
    .map((part) => part.contents.replace(/\s+$/g, ""))
    .join("\n");
}

async function emitChunk(name, extension, contents) {
  const hash = hashContent(contents);
  const filename = `${name}.${hash}.${extension}`;
  await writeFile(path.join(assetsDir, filename), contents);
  return joinBasePath(basePath, `/assets/${filename}`);
}

async function buildScriptChunks() {
  const manifest = {};
  for (const [name, relPaths] of Object.entries(scriptChunks)) {
    const parts = [];
    for (const relPath of relPaths) {
      parts.push({
        path: relPath,
        contents: await readSource(relPath),
      });
    }
    manifest[name] = await emitChunk(name, "js", joinScripts(parts));
  }
  return manifest;
}

async function buildStyleChunks() {
  const manifest = {};
  for (const [name, relPaths] of Object.entries(styleChunks)) {
    const parts = [];
    for (const relPath of relPaths) {
      parts.push({
        path: relPath,
        contents: await readSource(relPath),
      });
    }
    manifest[name] = await emitChunk(name, "css", joinStyles(parts));
  }
  return manifest;
}

async function copyStaticAssets() {
  for (const relPath of staticCopies) {
    await cp(path.join(rootDir, relPath), path.join(distDir, relPath), {
      recursive: true,
      force: true,
      filter: (src) => path.basename(src) !== ".DS_Store",
    });
  }
}

function renderIndexHtml(manifest) {
  const manifestJson = JSON.stringify(manifest);
  const configJson = JSON.stringify({
    target: buildTarget,
    basePath,
  });
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Dynamic Dex</title>
    <meta http-equiv="X-UA-Compatible" content="IE=Edge,chrome=IE8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <link rel="stylesheet" href="https://play.pokemonshowdown.com/style/font-awesome.css" />
    <link rel="stylesheet" href="${manifest.app}" />
    <script async src="https://www.googletagmanager.com/gtag/js?id=UA-26211653-3"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'UA-26211653-3');
      window.onerror = function(err, uri, line) {
        gtag('event', 'exception', {'description': uri + ':' + line + ': ' + err});
        return false;
      };
      window.__DDEX_CONFIG__ = ${configJson};
      window.__DDEX_ASSET_MANIFEST__ = ${manifestJson};
    </script>
  </head>
  <body>
    <div class="pfx-panel">
      <div class="pfx-body">
        <noscript>
          <p><strong>Requires JavaScript!</strong></p>
        </noscript>
        <p>Loading...</p>
      </div>
    </div>
    <script src="${manifest["app-shell"]}"></script>
  </body>
</html>
`;
}

async function main() {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(assetsDir, { recursive: true });

  const styleManifest = await buildStyleChunks();
  const scriptManifest = await buildScriptChunks();
  const manifest = { ...styleManifest, ...scriptManifest };

  await writeFile(
    path.join(distDir, "asset-manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  const indexHtml = renderIndexHtml(manifest);
  await writeFile(path.join(distDir, "index.html"), indexHtml);
  if (buildTarget === "github-pages") {
    await writeFile(path.join(distDir, "404.html"), indexHtml);
    await writeFile(path.join(distDir, ".nojekyll"), "");
  }
  await copyStaticAssets();
}

await main();
