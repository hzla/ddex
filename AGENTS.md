# Dynamic Dex Override Authoring Guide

## Overview

Dynamic Dex is a webapp that loads a base dex from `/data/*.js` and then optionally overlays ROM-specific data on top of it.

For a ROM-specific dex, external tools only need to emit two files:

- `/data/overrides/<rom>.js`
- `/data/overrides/<rom>_searchindex.js`

Those two files are enough for the app to display ROM-specific Pokemon, items, moves, abilities, and encounter/location data without changing app code.

The important constraint is that this document describes the current renderer and merger behavior as it exists in `ddex/js/*.js`. It is not a cleaned-up future schema. If the implementation is inconsistent or only partially merges fields, this guide documents that behavior directly.

## What the Webapp Displays

The current UI supports the following ROM-specific data:

- Pokemon pages: types, base stats, abilities, wild held items, evolution chain data, learnsets, encounter locations, and vanilla-vs-override differences
- Move pages: type, base power, category, PP, accuracy, priority, description changes, and learnset usage
- Item pages: updated descriptions plus ground pickups, NPC gifts, trainer rewards, mart locations, and wild held-item sources
- Ability pages: updated descriptions and reverse lookup of all Pokemon with that ability
- Encounter pages: location-specific encounter tables with encounter rates and level ranges
- Search: species, moves, items, abilities, locations, aliases, acronyms, and form shortcuts

## Required External Outputs

External tooling should emit exactly two files.

### 1. Override file

Recommended wrapper:

```js
var overrides = { ... };
```

Shipped override files currently work with either:

```js
var overrides = { ... };
```

or:

```js
overrides = { ... };
```

Use `var overrides = ...` for new tooling. That is what the in-app exporter writes.

### 2. Search index file

The search index file should export these four bindings:

```js
exports.BattleSearchIndex = ...;
exports.BattleSearchIndexOffset = ...;
exports.BattleSearchCountIndex = ...;
exports.BattleArticleTitles = {};
```

Use the CommonJS-style output above even though the file is loaded in the browser as a script. That matches the current generated `_searchindex.js` files.

## Override File Contract

The override payload is a single object with this top-level shape:

```js
{
  poks: { ... },
  moves: { ... },
  abilities: { ... },
  items: { ... },
  encs: { ... }
}
```

### Keying Rules

The renderer does not use one consistent keying rule across every entity type.

- `poks` is looked up by species display name such as `Bulbasaur` or `Mime Jr.`
- `moves` is looked up by move display name such as `Thunder Punch`
- `abilities` is safest when keyed by normalized id such as `compoundeyes` or `waterabsorb`
- `items` is safest when keyed by normalized item id such as `masterball` or `pokball`

Why this matters:

- Pokemon pages read `JSON.parse(localStorage.overrides).poks[pokemon.name]`
- Move pages read `JSON.parse(localStorage.overrides).moves[move.name]`
- Item pages read `JSON.parse(localStorage.overrides).items[id]`
- Ability merge logic normalizes each key with `cleanString(...)`, and ability pages later read `abilities[id]`

Because of that inconsistency:

- punctuation, accents, and alternate spellings are risky unless the emitted key matches the exact lookup path
- item and ability producers should prefer normalized ids
- species and move producers should prefer the exact display name that the UI uses

### Source-data preprocessing

Many decomp-style source repos do not store the final runtime data as plain JSON. Instead they store it behind:

- `#if / #elif / #else / #endif` compile-time branches
- string macros split across multiple quoted lines
- pointer tables that map enum constants to text blocks

If you are generating ddex files from source headers rather than from an already-built JSON export:

- prefer the newer-generation branch in config-gated data blocks
- in practice this is usually the first `#if` branch, with older-generation fallbacks in later `#elif` or `#else` branches
- do not merge multiple branches together
- flatten multiline text descriptions into normal display strings before emitting `desc`
- when a file offers "newer gen behavior" versus "older gen behavior", export the newer behavior for ddex generation even if the source repo could compile with an older fallback

This matters especially for move descriptions, item descriptions, ability descriptions, and move data where alternate compile-time branches can change the emitted text or numeric values.

## Species Schema

Species override records are consumed by `overrideMonData(...)` in [`overrides.js`](/Users/andylee/Repos/Docs/ddex/js/overrides.js).

### Mandatory fields for records that should render correctly

```js
{
  types: string[],
  abs: [string, string, string],
  items: [string | null, string | null, string | null],
  bs: {
    hp: number,
    at: number,
    df: number,
    sa: number,
    sd: number,
    sp: number
  },
  learnset_info: {
    learnset: Array<[number, string]>,
    tms: string[]
  }
}
```

Notes:

- `abs[0]` becomes ability slot `0`
- `abs[1]` becomes ability slot `1`
- `abs[2]` becomes hidden ability slot `H`
- `items[0]` is shown as the 50% wild item slot
- `items[1]` is shown as the 5% wild item slot
- `items[2]` is shown as the 1% wild item slot
- `"None"` and `null` suppress wild-item display

Important source-mapping nuance:

- ddex expects the final `abs` array in slot order `[ability0, ability1, hiddenAbility]`
- many source repos use a different ordering in their internal species structs
- do not assume the source order already matches ddex
- normalize the source abilities into ddex slot order before emitting overrides

If your source repo stores abilities in a different order, the renderer will silently display the wrong normal or hidden ability unless you reorder them during generation.

### Strongly recommended for new custom species

These are required if the species does not already exist in base data:

- `name: string`
- `num: number`

If a species does not exist in `BattlePokedex`, the merger synthesizes a new entry, but it still expects those fields to exist in the override record.

### Evolution fields

These fields describe outgoing evolutions from this species:

- `evos: string[]`
- `evoMethods: string[]`
- `evoParams: any[]`

These arrays are positional. Index `i` in all three arrays describes the same branch:

- `evos[i]` = target species name
- `evoMethods[i]` = method code
- `evoParams[i]` = method-specific parameter

Keep them aligned exactly.

Important:

- If a species has no outgoing evolutions, omit `evos`, `evoMethods`, and `evoParams` entirely.
- Do not emit empty arrays for those fields. The current evolution renderer treats an empty `evos` array as truthy and will incorrectly enter evolution-chain rendering.

#### Supported `evoMethods` observed in shipped overrides

- `level`
- `levelFriendship`
- `levelMove`
- `trade`
- `useItem`
- `item`
- `levelExtra`

#### `evoParam` expectations by method

- `level`: numeric level
  - example: `16`
  - the evolution-chain UI renders this as `L16`
- `levelFriendship`: usually `""`
  - an empty param renders as `Max Happiness`
- `levelMove`: move name string
  - example: `"Ancient Power"`
- `useItem`: item name string
  - example: `"Thunder Stone"`
- `item`: item name string
  - treat this as item-based evolution data in override files
- `trade`: usually `""` for plain trade, or an item name for trade-while-holding-item style data
  - example: `"Metal Coat"`
- `levelExtra`: freeform special requirement
  - examples observed in shipped data include `""`, numbers, held-item strings, or other special conditions
  - if the requirement is not actually numeric, emit human-readable text

If an evolution uses an item, the parameter should be an item name. For example:

- `evoMethods: ["useItem"]`
- `evoParams: ["Thunder Stone"]`

If an evolution uses a move, the parameter should be a move name. For example:

- `evoMethods: ["levelMove"]`
- `evoParams: ["Ancient Power"]`

### Optional compatibility fields copied by the merger

These fields are copied from the override into `BattlePokedex` if present:

- `evoLevel`
- `evoType`
- `evoCondition`

These fields are mainly useful for compatibility with the standard species shape used by `battledata.js`.

### Optional fields defined in base Dex data but not merged from override records

`battledata.js` supports these fields on species objects:

- `evoItem`
- `evoMove`
- `evoMap`
- `evoSpecies`

Do not rely on override-only versions of those fields. `overrideMonData(...)` does not copy them into `BattlePokedex`.

### Learnset extras

Optional fields under `learnset_info`:

- `tutors: string[]`
- `tutorsBySource: Record<string, string[]>`

Behavior:

- `tutors` is merged into `BattleLearnsets` as `"T"` sources
- `tutorsBySource` is not merged into `BattleLearnsets`, but the learnset renderer reads it from raw override data when present

### Description and display-name guidance

When generating species-adjacent data from source headers:

- move names in learnsets should be final display names, not `MOVE_*` constants
- item names in wild-item slots and evolution params should be final display names, not `ITEM_*` constants
- if a source repo stores descriptions as pointer tables plus string constants, resolve the pointer first and emit the final text into `desc`
- `desc` should be human-readable final text, not a description-symbol name

### Example species record

```js
{
  "Pikachu": {
    "name": "Pikachu",
    "num": 25,
    "types": ["Electric"],
    "items": ["Oran Berry", "Light Ball", null],
    "bs": { "hp": 35, "at": 55, "df": 40, "sa": 50, "sd": 50, "sp": 90 },
    "learnset_info": {
      "learnset": [[1, "Thunder Shock"], [5, "Tail Whip"]],
      "tms": ["Thunderbolt", "Protect"],
      "tutors": ["Signal Beam"]
    },
    "abs": ["Static", "Lightning Rod", "-"],
    "evos": ["Raichu"],
    "evoMethods": ["useItem"],
    "evoParams": ["Thunder Stone"],
    "evoType": "useItem",
    "evoCondition": ""
  }
}
```

## Item Schema

Item records are consumed partly by `overrideItemData(...)` and partly by the item page renderer in [`pokedex.js`](/Users/andylee/Repos/Docs/ddex/js/pokedex.js).

### Mandatory for existing item overrides

- `desc: string`

### Required for new custom items

- `name: string`
- `desc: string`

### Optional fields the current UI reads

- `oldDesc: string`
- `location: string`
- `ground_locations: string[]`
- `npcs: Array<{ spriteID: number, location: string, orientation: number }>`
- `rewards: string[]`
- `marts: string[]`
- `wilds: string[]`
- `new: boolean`

### Field meanings

- `location`
  - freeform display text
  - used for the simple `Found on ground` paragraph
- `ground_locations`
  - array of location ids
  - each id is resolved through `BattleLocationdex[loc].name` when possible
- `npcs`
  - array of NPC gift entries
  - `spriteID` chooses the sprite sheet image
  - `location` is usually a location id
  - `orientation` controls which frame is used from the sprite sheet
- `rewards`
  - plain trainer-name strings
  - displayed as `Rewarded after defeating`
- `marts`
  - plain text labels such as mart stock names, counters, or cashier labels
- `wilds`
  - array of species display names
  - each entry is linked to `/pokemon/<cleanString(name)>`
- `oldDesc`
  - if present, the UI renders an old/new description comparison
- `new`
  - marker metadata observed in shipped files
  - not currently used by the item page renderer

### Choosing `location` vs `ground_locations`

Use `location` when your source only gives you freeform place names such as script folder names or raw map names.

Use `ground_locations` only when you can emit ids that actually resolve through `BattleLocationdex`.

Practical rule:

- if you have `"Oldale Town"` or `"Abandoned Ship Room B1f"` style text, put it in `location`
- if you have a stable ddex location id such as `"oldaletown"` that exists in `encs`, you may also emit it in `ground_locations`

If you emit unresolved values into `ground_locations`, the item page will print those raw ids directly.

### Important merge nuance

For existing base items, the merger only copies these fields into `BattleItems`:

- `desc`
- `location`
- `rewards`

The following fields are not merged into `BattleItems`:

- `ground_locations`
- `npcs`
- `marts`
- `wilds`

Those fields still work because the item page renders them directly from the raw `overrides.items[...]` payload in local storage.

### Example item record

```js
{
  "thunderstone": {
    "name": "Thunder Stone",
    "desc": "Evolves certain Pokemon.",
    "oldDesc": "A peculiar stone that can make certain species of Pokemon evolve.",
    "location": "Route 10 hidden item",
    "ground_locations": ["powerplant", "route10"],
    "npcs": [
      { "spriteID": 52, "location": "route10", "orientation": 0 }
    ],
    "rewards": ["Scientist Lyle"],
    "marts": ["Stock 6+Badges", "Celadon Dept. Store 4F"],
    "wilds": ["Pikachu"],
    "new": true
  }
}
```

## Move and Ability Schema

## Moves

Move records are merged by `overrideMoveData(...)`.

### Mandatory fields used by merge code

- `t`
- `bp`
- `cat`
- `pp`
- `acc`
- `prio`
- `desc`

Meaning:

- `t` = type name
- `bp` = base power
- `cat` = category (`Physical`, `Special`, or `Status`)
- `pp` = PP
- `acc` = accuracy
- `prio` = priority
- `desc` = long/short description text

Description sourcing guidance:

- if your source repo stores move descriptions in a separate description table, resolve that table and emit the final text into `desc`
- if compile-time branches affect the description text, select the active branch before emitting
- do not emit description-symbol names or macro identifiers into `desc`

### Required for new custom moves

- `name`
- `num` if your external tool wants a stable explicit move number

If `BattleMovedex[moveId]` does not exist, the merger synthesizes a new move and fills default `flags` and `contestType`.

### Optional observed fields

- `oldDesc`
- `new`
- `flags`
- `multihit`
- `recoil`
- `sf`
- `tar`
- `willCrit`
- `e_id`

Important nuance:

- some of these appear in shipped data
- `overrideMoveData(...)` does not copy all of them into existing base moves
- the move page can still use `oldDesc` from raw override data for old/new diff rendering

## Abilities

Ability records are merged by `overrideAbilityData(...)`.

### Required fields

- `desc`

### Required for new custom abilities

- `name`

### Optional observed fields

- `oldDesc`
- `new`

As with items and moves, `oldDesc` is useful when the page should render a before/after comparison.

Ability description sourcing guidance:

- many decomp repos store ability descriptions in a pointer table plus string constants
- resolve that pointer table by ability index and emit the final text as `desc`
- do not rely on the ability name alone; ddex ability pages expect real description text

## Encounter Schema

Encounter data is stored in `encs`.

This section is especially important because encounter overrides replace the base location dataset wholesale.

### Required top-level structure

```js
{
  encs: {
    rates: {
      [encounterType]: number[]
    },
    [locationId]: {
      name: string,
      ...
    }
  }
}
```

### Required location structure

Each location entry should look like:

```js
{
  "name": "Route 1",
  "grass": {
    "rates": [40, 30],
    "encs": [
      { "s": "Pidgey", "mn": 2, "mx": 4 },
      { "s": "Rattata", "mn": 2, "mx": 3 }
    ]
  }
}
```

### Slot fields

- `s` = species name
- `mn` = minimum level
- `mx` = optional maximum level

If `mx` is omitted, the encounter page falls back to `mn`.

### Optional local rates

An encounter-type object may also define its own `rates` array:

```js
{
  "gift": {
    "rates": [100, 100, 100],
    "encs": [
      { "s": "TURTWIG", "mn": 5 },
      { "s": "PIPLUP", "mn": 5 },
      { "s": "CHIMCHAR", "mn": 5 }
    ]
  }
}
```

Rate lookup order in the current renderer is:

1. `location[encounterType].rates`
2. `encs.rates[encounterType]`
3. no rates

This keeps older override files valid while allowing variable-length per-location pools.

### Encounter-type keys observed in shipped data

- `grass`
- `land`
- `surf`
- `fish`
- `old_rod`
- `good_rod`
- `super_rod`
- `rock`
- `rock_smash`
- `swarm`
- `time_day`
- `time_night`
- `radar`
- `dual_ruby`
- `dual_sapphire`
- `dual_emerald`
- `dual_fire_red`
- `dual_leaf_green`
- `hoenn_music`
- `sinnoh_music`
- `grass_doubles`
- `grass_special`
- `surf_special`
- `super_rod_special`
- `grotto1`
- `grotto2`
- `global_honey_tree`
- `local_honey_tree`
- `gift`
- `static`

### Ordering rules

- the UI builds encounter-type sections from the key order in `encs.rates`, then appends encounter types that exist only on location records
- each rate array must stay aligned with the encounter slots in the corresponding location subtable

That means:

- `location.gift.rates[0]` is the rate for `location.gift.encs[0]` when local rates are present
- `encs.rates.grass[0]` is the rate for `location.grass.encs[0]`
- `encs.rates.grass[1]` is the rate for `location.grass.encs[1]`
- and so on

### Grouped source-format guidance

Some source repos do not store fishing as three already-separated tables. Instead they store:

- one shared `fishing_mons` slot list
- one shared fishing rate array
- a group map that says which slot indices belong to `old_rod`, `good_rod`, and `super_rod`

When the source format looks like that:

- split the fishing slots into three ddex sections during generation
- split the shared fishing rates the same way
- keep the resulting slot order identical to the source-group index order

Do not emit one combined `fishing_mons` section if the ddex UI is expected to show separate rods.

### Location id guidance

Best practice for generated encounter location keys:

- derive a human-readable display name first
- then normalize that display name into the location id

This usually produces ids that are easier to reuse consistently across:

- `encs`
- search index location entries
- item `ground_locations`

If the source repo also provides a label like `gRoute101`, prefer the human-readable form of that label for the final location name.

### Optional subtype display name

An encounter-type object may also contain its own `name` field:

```js
{
  "grotto1": {
    "name": "Hidden Grotto - Rare Slot",
    "encs": [...]
  }
}
```

The encounter page will use that subtype name as the section header if present.

### Minimal encounter example

```js
{
  "encs": {
    "rates": {
      "grass": [40, 30, 20, 10],
      "surf": [60, 30, 10]
    },
    "route1": {
      "name": "Route 1",
      "grass": {
        "encs": [
          { "s": "Pidgey", "mn": 2, "mx": 4 },
          { "s": "Rattata", "mn": 2, "mx": 3 },
          { "s": "Sentret", "mn": 3, "mx": 4 },
          { "s": "Hoothoot", "mn": 2, "mx": 2 }
        ]
      },
      "gift": {
        "rates": [100],
        "encs": [
          { "s": "TOGEPI", "mn": 1 }
        ]
      },
      "surf": {
        "encs": [
          { "s": "Poliwag", "mn": 10, "mx": 15 },
          { "s": "Goldeen", "mn": 10, "mx": 15 },
          { "s": "Tentacool", "mn": 12, "mx": 16 }
        ]
      }
    }
  }
}
```

## Search Index File Contract

The search index file must export four values:

```js
exports.BattleSearchIndex = ...;
exports.BattleSearchIndexOffset = ...;
exports.BattleSearchCountIndex = ...;
exports.BattleArticleTitles = {};
```

### `BattleSearchIndex`

The builder in [`build_index.js`](/Users/andylee/Repos/Docs/ddex/data/build_index.js) emits two main entry shapes:

- normal entry: `[id, type]`
- alias entry: `[aliasId, type, originalIndex, matchStart]`

Where:

- `id` is the normalized search id
- `type` is the entity type
- `originalIndex` points at the canonical entry in `BattleSearchIndex`
- `matchStart` is the normalized-character offset inside the display name

Normalization rule:

- use the same `toID`-style normalization as the app and local builder
- lowercase the text
- convert `é` to `e`
- strip non-alphanumeric characters

If the generator uses a different normalization function than the app, alias offsets and direct result lookups can break.

Observed type values from the local builder:

- `pokemon`
- `move`
- `item`
- `ability`
- `type`
- `location`
- `category`

Note that some shipped `_searchindex.js` files contain legacy extra trailing fields on alias entries. The current search code only relies on:

- index `0`
- index `1`
- index `2`
- index `3`

Do not depend on any additional trailing elements.

### `BattleSearchIndexOffset`

- array parallel to `BattleSearchIndex`
- each entry is either `""` or a numeric-string offset map
- the search renderer uses it to translate match positions from normalized ids back into the original display-name positions

### `BattleSearchCountIndex`

Map of summary counts such as:

- `"fire move": 123`
- `"water pokemon": 87`

The local builder fills these counts for move-by-type and Pokemon-by-type totals.

### Rebuild trigger guidance

Regenerate the search index whenever any of these change:

- species display names
- move display names
- item display names
- ability display names
- location display names
- encounter location ids
- alias-generation rules

Changing encounter names without rebuilding the search index will leave location search out of sync even if the `encs` payload itself is valid.

### `BattleArticleTitles`

Current generated files emit:

```js
exports.BattleArticleTitles = {};
```

Leave it empty unless the search implementation is extended to support article titles.

## How Overrides Replace Base Data

Load order matters.

The app first loads:

- `/data/search-index.js`
- `/data/species.js`
- `/data/moves.js`
- `/data/items.js`
- `/data/abilities.js`
- `/data/encounters.js`

Then it loads the ROM-specific override file and calls:

```js
overrideDexData(overrides)
```

### Merge behavior by dataset

#### Abilities

- existing abilities overwrite `desc` and `shortDesc`
- new abilities are inserted into `BattleAbilities`

#### Items

- existing items overwrite `desc`, `location`, and `rewards`
- new items are inserted into `BattleItems`
- additional raw-only fields such as `ground_locations`, `npcs`, `marts`, and `wilds` are still available through `localStorage.overrides`

#### Moves

- existing moves overwrite type, base power, category, PP, accuracy, priority, description, and short description
- new moves are synthesized with:
  - `name`
  - `num`
  - empty `flags`
  - empty `contestType`

#### Species

- existing species overwrite:
  - types
  - abilities
  - wild items
  - tier
  - base stats
  - `evos`
  - `evoMethods`
  - `evoParams`
  - learnset data
- new species are synthesized with:
  - `name`
  - `num`
  - `tier: "obtainable"`
  - empty `abilities`
  - empty `baseStats`
  - a fresh `BattleLearnsets[speciesId].learnset`

#### Encounters

- `BattleLocationdex` is replaced wholesale with `overrides.encs`

### Practical implications

- unspecified fields on existing entities usually stay at their base values
- this is not a full deep merge
- it is a targeted overwrite of a subset of fields
- because encounters are replaced wholesale, the override file must contain the complete location dataset for the ROM, not just deltas

## Examples and Pseudocode

### Minimal species override

```js
var overrides = {
  poks: {
    "Budew": {
      "name": "Budew",
      "num": 406,
      "types": ["Grass", "Poison"],
      "items": ["None", "Poison Barb", null],
      "bs": { "hp": 40, "at": 30, "df": 35, "sa": 50, "sd": 70, "sp": 55 },
      "learnset_info": {
        "learnset": [[1, "Absorb"], [4, "Growth"]],
        "tms": ["Energy Ball"],
        "tutors": ["Giga Drain"],
        "tutorsBySource": {
          "Shards": ["Giga Drain"]
        }
      },
      "abs": ["Natural Cure", "Poison Point", "Leaf Guard"],
      "evos": ["Roselia"],
      "evoMethods": ["levelFriendship"],
      "evoParams": [""],
      "evoType": "levelFriendship",
      "evoCondition": "during the day"
    }
  },
  moves: {},
  abilities: {},
  items: {},
  encs: { "rates": {} }
};
```

Notes:

- the empty `evoParams[0]` renders as `Max Happiness`
- `evoCondition` adds extra text like `during the day`

### Item override with all display-only location fields

```js
var overrides = {
  poks: {},
  moves: {},
  abilities: {},
  items: {
    "duskstone": {
      "name": "Dusk Stone",
      "desc": "A peculiar stone that can make certain species of Pokemon evolve.",
      "oldDesc": "A peculiar stone that can make certain species of Pokemon evolve. It is as dark as dark can be.",
      "location": "Twisted Mountain hidden item",
      "ground_locations": ["twistedmountain", "mistraltoncave"],
      "npcs": [
        { "spriteID": 12, "location": "opelucidcity", "orientation": 0 }
      ],
      "rewards": ["Veteran Clara"],
      "marts": ["Stock 7+Badges"],
      "wilds": ["Murkrow"]
    }
  },
  encs: { "rates": {} }
};
```

### Minimal encounter block

```js
var overrides = {
  poks: {},
  moves: {},
  abilities: {},
  items: {},
  encs: {
    "rates": {
      "grass": [50, 30, 15, 5]
    },
    "route3": {
      "name": "Route 3",
      "grass": {
        "encs": [
          { "s": "Pidgey", "mn": 4, "mx": 6 },
          { "s": "Spearow", "mn": 4, "mx": 6 },
          { "s": "Mankey", "mn": 5, "mx": 7 },
          { "s": "Nidoran-F", "mn": 5, "mx": 5 }
        ]
      }
    }
  }
};
```

### Search-index generation pseudocode

This pseudocode follows the logic in [`build_index.js`](/Users/andylee/Repos/Docs/ddex/data/build_index.js):

```text
load base species, moves, items, abilities, and type chart
load the ROM override file
take locations from overrides.encs

index = []

add canonical pokemon ids as "<id> pokemon"
add canonical move ids as "<id> move"
add canonical item ids as "<id> item"
add canonical ability ids as "<id> ability"
add canonical type ids as "<id> type"
add canonical location ids as "<id> location"
add category ids for physical/special/status

for each canonical entry:
  add aliases for:
  - compound names
  - forms
  - Mega / Mega-X / Mega-Y shortcuts
  - Alolan / Galarian / Hisuian shortcuts
  - acronyms
  - suffix matches

add hardcoded special aliases such as Ultra Beast codes

sort all entries alphabetically

apply manual swaps for ambiguous search terms:
  grass
  fairy
  flying
  dragon
  bug
  psychic
  ditto

convert alias entries from original id to original index

build BattleSearchIndexOffset:
  for each search entry, map normalized character positions back to the
  original display name by counting skipped punctuation / spaces

build BattleSearchCountIndex:
  count moves by type
  count non-cosmetic Pokemon by type

emit:
  exports.BattleSearchIndex = ...
  exports.BattleSearchIndexOffset = ...
  exports.BattleSearchCountIndex = ...
  exports.BattleArticleTitles = {}
```

Regenerate the search index whenever:

- new species are added
- species names change
- move, item, ability, or location names change
- form names change
- aliases should change

## Authoring Rules / Pitfalls

- Keep `evos`, `evoMethods`, and `evoParams` aligned by index.
- Use item names in `evoParams` when the method expects an item.
- Use move names in `evoParams` when the method expects a move.
- Keep encounter rate arrays aligned with encounter slot order.
- Prefer normalized ids for `items` and `abilities`.
- Prefer exact UI display names for `poks` and `moves`.
- Provide the full `encs` dataset, not just encounter deltas.
- Regenerate the search index whenever searchable names or locations change.
- Include `oldDesc` when the page should render an old/new diff.
- Do not rely on `evoItem`, `evoMove`, `evoMap`, or `evoSpecies` being merged from override records.
- Do not assume the override merger performs a deep merge. It only overwrites the fields it explicitly copies.
- Be careful with punctuation and accents in species and move keys. If the key does not match the renderer lookup path, the page may fail to find the raw override record.
