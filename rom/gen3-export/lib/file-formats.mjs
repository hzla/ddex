export function formatAssignedJs(variableName, payload) {
  return [
    `var ${variableName} = ${JSON.stringify(payload, null, 2)};`,
    "",
    `if (typeof module !== 'undefined') module.exports = ${variableName};`,
    "",
  ].join("\n");
}

export function formatSearchIndexJs(payload) {
  return [
    "// DO NOT EDIT - automatically built with build-tools/build-indexes",
    "",
    `exports.BattleSearchIndex = ${JSON.stringify(payload.BattleSearchIndex)};`,
    "",
    `exports.BattleSearchIndexOffset = ${JSON.stringify(payload.BattleSearchIndexOffset)};`,
    "",
    `exports.BattleSearchCountIndex = ${JSON.stringify(payload.BattleSearchCountIndex)};`,
    "",
    `exports.BattleArticleTitles = ${JSON.stringify(payload.BattleArticleTitles)};`,
    "",
  ].join("\n");
}
