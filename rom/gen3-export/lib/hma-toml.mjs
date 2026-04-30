function stripComment(line) {
  let inString = false;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "#") {
      return line.slice(0, index);
    }
  }
  return line;
}

function parseInteger(valueText) {
  const trimmed = valueText.trim();
  if (/^0x[0-9a-f]+$/i.test(trimmed)) return Number.parseInt(trimmed, 16);
  if (/^[+-]?\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10);
  return Number.NaN;
}

function parseArray(valueText) {
  const inner = valueText.trim().slice(1, -1).trim();
  if (!inner) return [];
  const values = [];
  let start = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index <= inner.length; index += 1) {
    const char = inner[index];
    if (index === inner.length || (!inString && char === ",")) {
      const token = inner.slice(start, index).trim();
      if (token) values.push(parseValue(token));
      start = index + 1;
      continue;
    }
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") inString = true;
  }
  return values;
}

function arrayBracketDepth(text) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (const char of text) {
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "[") depth += 1;
    if (char === "]") depth -= 1;
  }
  return depth;
}

function parseValue(valueText) {
  const trimmed = valueText.trim();
  if (!trimmed) return "";
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed.startsWith("\"")) return JSON.parse(trimmed);
  if (trimmed.startsWith("[")) return parseArray(trimmed);
  const asInt = parseInteger(trimmed);
  if (!Number.isNaN(asInt)) return asInt;
  return trimmed;
}

export function preprocessHmaToml(text) {
  return text
    .replace(/'''(.*?)'''/gs, (_match, body) => JSON.stringify(body))
    .replace(/\bFalse\b/g, "false")
    .replace(/\bTrue\b/g, "true");
}

export function parseHmaToml(text) {
  const preprocessed = preprocessHmaToml(text);
  const result = {};
  let currentObject = result;

  const lines = preprocessed.split(/\r?\n/);
  for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
    const rawLine = lines[lineNumber];
    const withoutComment = stripComment(rawLine).trim();
    if (!withoutComment) continue;

    if (/^\[\[.+\]\]$/.test(withoutComment)) {
      const tableName = withoutComment.slice(2, -2).trim();
      result[tableName] ||= [];
      const entry = {};
      result[tableName].push(entry);
      currentObject = entry;
      continue;
    }

    if (/^\[.+\]$/.test(withoutComment)) {
      const tableName = withoutComment.slice(1, -1).trim();
      result[tableName] ||= {};
      currentObject = result[tableName];
      continue;
    }

    const equalsIndex = withoutComment.indexOf("=");
    if (equalsIndex === -1) continue;
    const key = withoutComment.slice(0, equalsIndex).trim();
    let valueText = withoutComment.slice(equalsIndex + 1).trim();
    if (valueText.startsWith("[") && arrayBracketDepth(valueText) > 0) {
      while (lineNumber + 1 < lines.length && arrayBracketDepth(valueText) > 0) {
        lineNumber += 1;
        const nextLine = stripComment(lines[lineNumber]).trim();
        valueText += ` ${nextLine}`;
      }
    }
    try {
      currentObject[key] = parseValue(valueText);
    } catch (error) {
      throw new Error(`Failed to parse HMA TOML line ${lineNumber + 1} ${JSON.stringify(rawLine.trim())}: ${error.message}`);
    }
  }

  return result;
}
