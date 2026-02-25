import { useMemo, type ReactNode } from "react";
import FeedChart from "./FeedChart";
import { extractChartSpecsFromContent } from "../../features/feed/chartSpec";

type FeedDocumentProps = {
  text: string;
  className?: string;
  highlightQuery?: string;
};

type ListItem = {
  text: string;
  childLists: { ordered: boolean; items: ListItem[] }[];
};

type TextBlock =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "list"; ordered: boolean; items: ListItem[] }
  | { kind: "paragraph"; text: string }
  | { kind: "image"; alt: string; src: string; title?: string }
  | { kind: "table"; headers: string[]; rows: string[][] }
  | { kind: "rule" }
  | { kind: "code"; language: string; code: string };

type JsonValue = null | string | number | boolean | JsonValue[] | { [key: string]: JsonValue };

function escapeRegex(input: string): string {
  return String(input ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitHighlightParts(input: string, query: string): { value: string; hit: boolean }[] {
  const source = String(input ?? "");
  const keyword = String(query ?? "").trim();
  if (!source || !keyword) {
    return [{ value: source, hit: false }];
  }
  const matcher = new RegExp(`(${escapeRegex(keyword)})`, "gi");
  const chunks = source.split(matcher);
  return chunks
    .filter((chunk) => chunk.length > 0)
    .map((chunk) => ({
      value: chunk,
      hit: chunk.localeCompare(keyword, undefined, { sensitivity: "accent" }) === 0,
    }));
}

function renderHighlightedText(input: string, query: string, keyPrefix: string): ReactNode[] {
  const parts = splitHighlightParts(input, query);
  return parts.map((part, index) =>
    part.hit ? (
      <mark className="feed-highlight-mark" key={`${keyPrefix}-hit-${index}`}>
        {part.value}
      </mark>
    ) : (
      <span key={`${keyPrefix}-text-${index}`}>{part.value}</span>
    ),
  );
}

function normalizeFlattenedStructuredText(input: string): string {
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

  const matchedSignals = flattenedSignalKeys.filter((key) =>
    new RegExp(`\\b${key}\\b`).test(source),
  ).length;
  const newlineCount = (source.match(/\n/g) ?? []).length;
  const longestLine = source
    .split("\n")
    .reduce((max, line) => Math.max(max, line.length), 0);
  const looksFlattened = matchedSignals >= 3 && newlineCount <= 3 && longestLine >= 360;

  if (!looksFlattened) {
    return source;
  }

  return source
    .replace(/\s{2,}/g, " ")
    .replace(
      /\b(intent|userGoal|requiredOutputs|constraints|assumptions|researchPlan|acceptanceCriteria|riskChecklist|selfValidationPlan|templateIntent|webQueries|sources|collectionOrder|verificationRules)\b/g,
      "\n$1",
    )
    .replace(/([^\n])\s-\s(?=\S)/g, "$1\n- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitizeDocumentUrl(raw: string): string | null {
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

function parseDocumentBlocks(content: string): TextBlock[] {
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

function parseWholeJsonDocument(source: string): JsonValue | null {
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

function toReadableJsonLabel(key: string): string {
  const normalized = String(key ?? "")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
  return normalized || key;
}

function renderJsonValue(value: JsonValue, highlightQuery = "", keyPrefix = "json"): ReactNode {
  if (value === null) {
    return <p className="feed-document-paragraph">(null)</p>;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return (
      <p className="feed-document-paragraph">
        {renderHighlightedText(String(value), highlightQuery, `${keyPrefix}-value`)}
      </p>
    );
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <p className="feed-document-paragraph">(empty)</p>;
    }
    return (
      <ul className="feed-document-list">
        {value.map((item, index) => (
          <li key={`${keyPrefix}-item-${index}`}>
            {renderJsonValue(item, highlightQuery, `${keyPrefix}-${index}`)}
          </li>
        ))}
      </ul>
    );
  }

  const entries = Object.entries(value);
  if (entries.length === 0) {
    return <p className="feed-document-paragraph">(empty)</p>;
  }
  return (
    <div className="feed-json-document">
      {entries.map(([key, entryValue], index) => (
        <section className="feed-json-section" key={`${keyPrefix}-${key}-${index}`}>
          <h3 className="feed-document-h3">
            {renderHighlightedText(
              toReadableJsonLabel(key),
              highlightQuery,
              `${keyPrefix}-${key}-${index}-label`,
            )}
          </h3>
          {renderJsonValue(entryValue, highlightQuery, `${keyPrefix}-${key}-${index}`)}
        </section>
      ))}
    </div>
  );
}

function renderInlineMarkdown(text: string, highlightQuery = "", keyPrefix = "inline"): ReactNode[] {
  const source = String(text ?? "");
  if (!source) {
    return [];
  }
  const nodes: ReactNode[] = [];
  const pattern = /\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(source)) !== null) {
    const start = match.index;
    if (start > cursor) {
      nodes.push(...renderHighlightedText(source.slice(cursor, start), highlightQuery, `${keyPrefix}-${start}`));
    }
    if (match[1]) {
      nodes.push(
        <strong key={`inline-bold-${start}-${match[1].length}`}>
          {renderHighlightedText(match[1], highlightQuery, `${keyPrefix}-bold-${start}`)}
        </strong>,
      );
    } else if (match[2]) {
      nodes.push(
        <code key={`inline-code-${start}-${match[2].length}`}>
          {renderHighlightedText(match[2], highlightQuery, `${keyPrefix}-code-${start}`)}
        </code>,
      );
    } else if (match[3]) {
      nodes.push(
        <em key={`inline-italic-${start}-${match[3].length}`}>
          {renderHighlightedText(match[3], highlightQuery, `${keyPrefix}-italic-${start}`)}
        </em>,
      );
    } else if (match[4] && match[5]) {
      const href = sanitizeDocumentUrl(match[5]);
      if (!href) {
        nodes.push(...renderHighlightedText(`${match[4]} (${match[5]})`, highlightQuery, `${keyPrefix}-raw-${start}`));
        cursor = start + match[0].length;
        continue;
      }
      nodes.push(
        <a
          href={href}
          key={`inline-link-${start}-${match[4].length}`}
          rel="noreferrer noopener"
          target="_blank"
        >
          {renderHighlightedText(match[4], highlightQuery, `${keyPrefix}-link-${start}`)}
        </a>,
      );
    } else {
      nodes.push(...renderHighlightedText(match[0], highlightQuery, `${keyPrefix}-etc-${start}`));
    }
    cursor = start + match[0].length;
  }

  if (cursor < source.length) {
    nodes.push(...renderHighlightedText(source.slice(cursor), highlightQuery, `${keyPrefix}-tail`));
  }
  return nodes.length > 0 ? nodes : [source];
}

function renderListBlock(
  block: { ordered: boolean; items: ListItem[] },
  keyPrefix: string,
  highlightQuery = "",
): ReactNode {
  const items = block.items.map((item, itemIndex) => (
    <li key={`${keyPrefix}-item-${itemIndex}`}>
      <span>{renderInlineMarkdown(item.text, highlightQuery, `${keyPrefix}-item-${itemIndex}`)}</span>
      {item.childLists.map((childBlock, childIndex) =>
        renderListBlock(
          childBlock,
          `${keyPrefix}-item-${itemIndex}-child-${childIndex}`,
          highlightQuery,
        ),
      )}
    </li>
  ));

  if (block.ordered) {
    return (
      <ol className="feed-document-list" key={keyPrefix}>
        {items}
      </ol>
    );
  }
  return (
    <ul className="feed-document-list" key={keyPrefix}>
      {items}
    </ul>
  );
}

export default function FeedDocument({ text, className = "", highlightQuery = "" }: FeedDocumentProps) {
  const normalizedText = useMemo(() => normalizeFlattenedStructuredText(text), [text]);
  const extracted = useMemo(() => extractChartSpecsFromContent(normalizedText), [normalizedText]);
  const jsonDocument = useMemo(
    () => parseWholeJsonDocument(extracted.contentWithoutChartBlocks),
    [extracted.contentWithoutChartBlocks],
  );
  const blocks = useMemo(
    () => parseDocumentBlocks(extracted.contentWithoutChartBlocks),
    [extracted.contentWithoutChartBlocks],
  );

  return (
    <div className={`feed-document ${className}`.trim()}>
      {extracted.charts.map((chart, index) => (
        <FeedChart key={`chart-${index}`} spec={chart} />
      ))}
      {jsonDocument
        ? renderJsonValue(jsonDocument, highlightQuery)
        : blocks.map((block, index) => {
        if (block.kind === "heading") {
          if (block.level === 1) {
            return (
              <h1 className="feed-document-h1" key={`block-${index}`}>
                {renderInlineMarkdown(block.text, highlightQuery, `heading-h1-${index}`)}
              </h1>
            );
          }
          if (block.level === 2) {
            return (
              <h2 className="feed-document-h2" key={`block-${index}`}>
                {renderInlineMarkdown(block.text, highlightQuery, `heading-h2-${index}`)}
              </h2>
            );
          }
          return (
            <h3 className="feed-document-h3" key={`block-${index}`}>
              {renderInlineMarkdown(block.text, highlightQuery, `heading-h3-${index}`)}
            </h3>
          );
        }

        if (block.kind === "list") {
          return renderListBlock(block, `block-${index}`, highlightQuery);
        }

        if (block.kind === "image") {
          const safeSrc = sanitizeDocumentUrl(block.src);
          if (!safeSrc) {
            return null;
          }
          return (
            <figure className="feed-document-image" key={`block-${index}`}>
              <img alt={block.alt || "문서 이미지"} loading="lazy" src={safeSrc} />
              {(block.title || block.alt) && (
                <figcaption>{block.title || block.alt}</figcaption>
              )}
            </figure>
          );
        }

        if (block.kind === "table") {
          return (
            <div className="feed-document-table-wrap" key={`block-${index}`}>
              <table className="feed-document-table">
                <thead>
                  <tr>
                    {block.headers.map((header, headerIndex) => (
                      <th key={`header-${index}-${headerIndex}`}>
                        {renderInlineMarkdown(header, highlightQuery, `table-header-${index}-${headerIndex}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={`row-${index}-${rowIndex}`}>
                      {row.map((cell, cellIndex) => (
                        <td key={`cell-${index}-${rowIndex}-${cellIndex}`}>
                          {renderInlineMarkdown(
                            cell,
                            highlightQuery,
                            `table-cell-${index}-${rowIndex}-${cellIndex}`,
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        if (block.kind === "rule") {
          return <hr className="feed-document-rule" key={`block-${index}`} />;
        }

        if (block.kind === "code") {
          return (
            <pre className="feed-document-code" key={`block-${index}`}>
              <code>{block.code}</code>
            </pre>
          );
        }

        return (
          <p className="feed-document-paragraph" key={`block-${index}`}>
            {renderInlineMarkdown(block.text, highlightQuery, `paragraph-${index}`)}
          </p>
        );
      })}
    </div>
  );
}
