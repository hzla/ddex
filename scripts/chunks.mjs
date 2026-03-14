export const scriptChunks = {
  "app-shell": [
    "js/lib/jquery-1.12.4.min.js",
    "js/lib/lodash.min.js",
    "js/lib/backbone-min.js",
    "js/panels.js",
    "config/config.js",
    "js/battledata.js",
    "js/battle-dex-search.js",
    "js/search.js",
    "js/bootstrap.js",
  ],
  "base-data": [
    "data/search-index.js",
    "data/alias.js",
    "data/species.js",
    "data/moves.js",
    "data/abilities.js",
    "data/items.js",
    "data/encounters.js",
    "data/typechart.js",
  ],
  "override-runtime": [
    "js/overrides.js",
  ],
  "detail-data": [
    "data/vanilla_species.js",
    "data/vanilla_moves.js",
    "data/learnsets.js",
    "js/pokedex.js",
    "js/pokedex-pokemon.js",
    "js/pokedex-moves.js",
    "js/pokedex-encounters.js",
    "js/pokedex-search.js",
    "js/router.js",
  ],
  "rom-tools": [
    "js/rom-bootstrap.js",
  ],
};

export const styleChunks = {
  app: [
    "theme/panels.css",
    "theme/main.css",
    "theme/utilichart.css",
    "theme/pokedex.css",
  ],
};

export const staticCopies = [
  "favicon.ico",
  "img",
  "theme",
  "data/overrides",
  "rom",
];
