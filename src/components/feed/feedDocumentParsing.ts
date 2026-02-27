import type { JsonValue, ListItem, TextBlock } from "./feedDocumentTypes";

function parseImageLine(input: string): { alt: string; src: string; title?: string } | null {
  const line = input.trim();
  const matched = line.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/);
  if (!matched) {
    return null;
  }
  const alt = String(matched[1] ?? "").trim();
  const src = String(matched[2] ?? "").trim();
  const title = String(matched[3] ?? "").trim();
  if (!src) {
    return null;
  }
  return { alt, src, ...(title ? { title } : {}) };
}

function parseTableRow(input: string): string[] {
  const normalized = input.trim().replace(/^\|/, "").replace(/\|$/, "");
  return normalized.split("|").map((cell) => cell.trim());
}

function isTableDividerLine(input: string): boolean {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(input.trim());
}

const LIST_LINE_PATTERN = /^(\s*)([-*]|\d+\.)\s+(.+)$/;

function parseListLine(rawLine: string): { indent: number; ordered: boolean; text: string } | null {
  const matched = String(rawLine ?? "").match(LIST_LINE_PATTERN);
  if (!matched) {
    return null;
  }
  const indent = String(matched[1] ?? "").replace(/\t/g, "  ").length;
  const marker = String(matched[2] ?? "");
  const text = String(matched[3] ?? "").trim();
  return {
    indent,
    ordered: /^\d+\.$/.test(marker),
    text,
  };
}

function parseListLevel(
  lines: string[],
  startIndex: number,
  levelIndent: number,
  ordered: boolean,
): { items: ListItem[]; nextIndex: number } {
  const items: ListItem[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const currentRaw = lines[index] ?? "";
    const parsed = parseListLine(currentRaw);
    if (!parsed) {
      break;
    }
    if (parsed.indent < levelIndent) {
      break;
    }

    if (parsed.indent > levelIndent) {
      if (items.length === 0) {
        break;
      }
      const parent = items[items.length - 1];
      const nested = parseListLevel(lines, index, parsed.indent, parsed.ordered);
      if (nested.nextIndex <= index) {
        break;
      }
      if (nested.items.length > 0) {
        parent.childLists.push({
          ordered: parsed.ordered,
          items: nested.items,
        });
      }
      index = nested.nextIndex;
      continue;
    }

    if (parsed.ordered !== ordered) {
      break;
    }

    items.push({
      text: parsed.text,
      childLists: [],
    });
    index += 1;
  }

  return { items, nextIndex: index };
}

function parseListBlock(lines: string[], startIndex: number): { block: TextBlock; nextIndex: number } | null {
  const first = parseListLine(lines[startIndex] ?? "");
  if (!first) {
    return null;
  }
  const parsed = parseListLevel(lines, startIndex, first.indent, first.ordered);
  if (parsed.items.length === 0) {
    return null;
  }
  return {
    block: {
      kind: "list",
      ordered: first.ordered,
      items: parsed.items,
    },
    nextIndex: parsed.nextIndex,
  };
}

function parseTextBlocks(source: string): TextBlock[] {
  const lines = source.split("\n");
  const blocks: TextBlock[] = [];
  let index = 0;

  const pushParagraph = (items: string[]) => {
    const text = items.join("\n").trim();
    if (text) {
      blocks.push({ kind: "paragraph", text });
    }
  };

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    const image = parseImageLine(trimmed);
    if (image) {
      blocks.push({ kind: "image", ...image });
      index += 1;
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        kind: "heading",
        level: headingMatch[1].length as 1 | 2 | 3,
        text: headingMatch[2].trim(),
      });
      index += 1;
      continue;
    }

    if (/^[-*_]{3,}$/.test(trimmed)) {
      blocks.push({ kind: "rule" });
      index += 1;
      continue;
    }

    if (parseListLine(line)) {
      const listBlock = parseListBlock(lines, index);
      if (listBlock) {
        blocks.push(listBlock.block);
        index = listBlock.nextIndex;
        continue;
      }
      index += 1;
      continue;
    }

    if (trimmed.includes("|") && index + 1 < lines.length && isTableDividerLine(lines[index + 1] ?? "")) {
      const headerCells = parseTableRow(trimmed);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length) {
        const rowRaw = lines[index] ?? "";
        const row = rowRaw.trim();
        if (!row || !row.includes("|")) {
          break;
        }
        const cells = parseTableRow(row);
        rows.push(cells);
        index += 1;
      }
      if (headerCells.length > 0) {
        const fixedRows = rows.map((row) => {
          const cloned = row.slice(0, headerCells.length);
          while (cloned.length < headerCells.length) {
            cloned.push("");
          }
          return cloned;
        });
        blocks.push({ kind: "table", headers: headerCells, rows: fixedRows });
      }
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length) {
      const rowRaw = lines[index] ?? "";
      const row = rowRaw.trim();
      if (
        !row ||
        parseImageLine(row) ||
        (row.includes("|") && index + 1 < lines.length && isTableDividerLine(lines[index + 1] ?? "")) ||
        /^(#{1,3})\s+/.test(row) ||
        parseListLine(rowRaw) ||
        /^[-*_]{3,}$/.test(row)
      ) {
        break;
      }
      paragraph.push(rowRaw);
      index += 1;
    }
    pushParagraph(paragraph);
  }

  return blocks;
}

export function parseDocumentBlocks(content: string): TextBlock[] {
  const text = String(content ?? "");
  const blocks: TextBlock[] = [];
  const regex = /```([^\n`]*)\n([\s\S]*?)```/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const [raw, langRaw, codeBody] = match;
    const start = match.index;
    const before = text.slice(cursor, start);
    blocks.push(...parseTextBlocks(before));
    blocks.push({
      kind: "code",
      language: String(langRaw ?? "").trim(),
      code: String(codeBody ?? "").trim(),
    });
    cursor = start + raw.length;
  }

  blocks.push(...parseTextBlocks(text.slice(cursor)));
  return blocks;
}

export function parseWholeJsonDocument(source: string): JsonValue | null {
  const trimmed = String(source ?? "").trim();
  if (!trimmed) {
    return null;
  }
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed) as JsonValue;
    return parsed;
  } catch {
    return null;
  }
}

export function normalizeFlattenedStructuredText(input: string): string {
  const source = String(input ?? "").replace(/\r\n/g, "\n");
  if (!source.trim()) {
    return "";
  }

  const flattenedSignalKeys = [
    "intent",
    "userGoal",
    "requiredOutputs",
    "constraints",
    "assumptions",
    "researchPlan",
    "acceptanceCriteria",
    "riskChecklist",
    "selfValidationPlan",
    "templateIntent",
    "webQueries",
    "verificationRules",
    "collectionOrder",
  ];

  const keyPattern = flattenedSignalKeys.join("|");
  const keyValueMatches = source.match(new RegExp(`\\b(?:${keyPattern})\\s*:`, "g")) ?? [];
  const newlineCount = (source.match(/\n/g) ?? []).length;
  const longestLine = source
    .split("\n")
    .reduce((max, line) => Math.max(max, line.length), 0);
  const hasExplicitMarkdownStructure =
    /(^|\n)\s*#{1,6}\s+\S/m.test(source) ||
    /(^|\n)\s*[-*]\s+\S/m.test(source) ||
    /(^|\n)\s*\d+\.\s+\S/m.test(source);
  const looksFlattened =
    keyValueMatches.length >= 4 &&
    newlineCount <= 3 &&
    longestLine >= 320 &&
    !hasExplicitMarkdownStructure;

  if (!looksFlattened) {
    const genericKeyValueMatches =
      source.match(/\b[A-Za-z가-힣][A-Za-z0-9가-힣_\/().& -]{1,36}\s*:\s*/g) ?? [];
    const looksGenericFlattened =
      genericKeyValueMatches.length >= 5 &&
      newlineCount <= 2 &&
      longestLine >= 280 &&
      !hasExplicitMarkdownStructure;
    if (!looksGenericFlattened) {
      return source;
    }
    return source
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\s*(?:,|;|\|)\s*(?=[A-Za-z가-힣][A-Za-z0-9가-힣_\/().& -]{1,36}\s*:)/g, "\n")
      .replace(
        /\b([A-Za-z가-힣][A-Za-z0-9가-힣_\/().& -]{1,36})\s*:\s*/g,
        "\n$1: ",
      )
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  return source
    .replace(/[ \t]{2,}/g, " ")
    .replace(new RegExp(`\\s*(?:,|;|\\|)\\s*(?=(?:${keyPattern})\\s*:)`, "g"), "\n")
    .replace(
      new RegExp(`\\b(${keyPattern})\\s*:`, "g"),
      "\n$1:",
    )
    .replace(/([^\n])\s-\s(?=\S)/g, "$1\n- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function sanitizeDocumentUrl(raw: string): string | null {
  const candidate = String(raw ?? "").trim();
  if (!candidate) {
    return null;
  }
  if (!/^https?:\/\//i.test(candidate)) {
    return null;
  }
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}
