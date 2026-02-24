import { useMemo } from "react";
import FeedChart from "./FeedChart";
import { extractChartSpecsFromContent } from "../../features/feed/chartSpec";

type FeedDocumentProps = {
  text: string;
  className?: string;
};

type TextBlock =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "paragraph"; text: string }
  | { kind: "image"; alt: string; src: string; title?: string }
  | { kind: "table"; headers: string[]; rows: string[][] }
  | { kind: "rule" }
  | { kind: "code"; language: string; code: string };

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

    if (/^-\s+/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length) {
        const row = (lines[index] ?? "").trim();
        if (!/^-\s+/.test(row)) {
          break;
        }
        items.push(row.replace(/^-\s+/, "").trim());
        index += 1;
      }
      if (items.length > 0) {
        blocks.push({ kind: "list", ordered: false, items });
      }
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length) {
        const row = (lines[index] ?? "").trim();
        if (!/^\d+\.\s+/.test(row)) {
          break;
        }
        items.push(row.replace(/^\d+\.\s+/, "").trim());
        index += 1;
      }
      if (items.length > 0) {
        blocks.push({ kind: "list", ordered: true, items });
      }
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
        /^-\s+/.test(row) ||
        /^\d+\.\s+/.test(row) ||
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

export default function FeedDocument({ text, className = "" }: FeedDocumentProps) {
  const extracted = useMemo(() => extractChartSpecsFromContent(text), [text]);
  const blocks = useMemo(
    () => parseDocumentBlocks(extracted.contentWithoutChartBlocks),
    [extracted.contentWithoutChartBlocks],
  );

  return (
    <div className={`feed-document ${className}`.trim()}>
      {extracted.charts.map((chart, index) => (
        <FeedChart key={`chart-${index}`} spec={chart} />
      ))}
      {blocks.map((block, index) => {
        if (block.kind === "heading") {
          if (block.level === 1) {
            return (
              <h1 className="feed-document-h1" key={`block-${index}`}>
                {block.text}
              </h1>
            );
          }
          if (block.level === 2) {
            return (
              <h2 className="feed-document-h2" key={`block-${index}`}>
                {block.text}
              </h2>
            );
          }
          return (
            <h3 className="feed-document-h3" key={`block-${index}`}>
              {block.text}
            </h3>
          );
        }

        if (block.kind === "list") {
          if (block.ordered) {
            return (
              <ol className="feed-document-list" key={`block-${index}`}>
                {block.items.map((item, itemIndex) => (
                  <li key={`item-${index}-${itemIndex}`}>{item}</li>
                ))}
              </ol>
            );
          }
          return (
            <ul className="feed-document-list" key={`block-${index}`}>
              {block.items.map((item, itemIndex) => (
                <li key={`item-${index}-${itemIndex}`}>{item}</li>
              ))}
            </ul>
          );
        }

        if (block.kind === "image") {
          return (
            <figure className="feed-document-image" key={`block-${index}`}>
              <img alt={block.alt || "문서 이미지"} loading="lazy" src={block.src} />
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
                      <th key={`header-${index}-${headerIndex}`}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={`row-${index}-${rowIndex}`}>
                      {row.map((cell, cellIndex) => (
                        <td key={`cell-${index}-${rowIndex}-${cellIndex}`}>{cell}</td>
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
            {block.text}
          </p>
        );
      })}
    </div>
  );
}
