import type { ReactNode } from "react";
import { t } from "../../i18n";
import { sanitizeDocumentUrl } from "./feedDocumentParsing";
import type { JsonValue, ListItem, TextBlock } from "./feedDocumentTypes";

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

function toReadableJsonLabel(key: string): string {
  const normalized = String(key ?? "")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
  return normalized || key;
}

export function renderJsonValue(value: JsonValue, highlightQuery = "", keyPrefix = "json"): ReactNode {
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
          <li key={`${keyPrefix}-item-${index}`}>{renderJsonValue(item, highlightQuery, `${keyPrefix}-${index}`)}</li>
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
            {renderHighlightedText(toReadableJsonLabel(key), highlightQuery, `${keyPrefix}-${key}-${index}-label`)}
          </h3>
          {renderJsonValue(entryValue, highlightQuery, `${keyPrefix}-${key}-${index}`)}
        </section>
      ))}
    </div>
  );
}

export function renderInlineMarkdown(text: string, highlightQuery = "", keyPrefix = "inline"): ReactNode[] {
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
        <a href={href} key={`inline-link-${start}-${match[4].length}`} rel="noreferrer noopener" target="_blank">
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

function renderListBlock(block: { ordered: boolean; items: ListItem[] }, keyPrefix: string, highlightQuery = ""): ReactNode {
  const items = block.items.map((item, itemIndex) => (
    <li key={`${keyPrefix}-item-${itemIndex}`}>
      <span>{renderInlineMarkdown(item.text, highlightQuery, `${keyPrefix}-item-${itemIndex}`)}</span>
      {item.childLists.map((childBlock, childIndex) =>
        renderListBlock(childBlock, `${keyPrefix}-item-${itemIndex}-child-${childIndex}`, highlightQuery),
      )}
    </li>
  ));

  if (block.ordered) {
    return <ol className="feed-document-list" key={keyPrefix}>{items}</ol>;
  }
  return <ul className="feed-document-list" key={keyPrefix}>{items}</ul>;
}

export function renderDocumentBlock(block: TextBlock, index: number, highlightQuery: string): ReactNode {
  if (block.kind === "heading") {
    if (block.level === 1) {
      return <h1 className="feed-document-h1" key={`block-${index}`}>{renderInlineMarkdown(block.text, highlightQuery, `heading-h1-${index}`)}</h1>;
    }
    if (block.level === 2) {
      return <h2 className="feed-document-h2" key={`block-${index}`}>{renderInlineMarkdown(block.text, highlightQuery, `heading-h2-${index}`)}</h2>;
    }
    return <h3 className="feed-document-h3" key={`block-${index}`}>{renderInlineMarkdown(block.text, highlightQuery, `heading-h3-${index}`)}</h3>;
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
        <img alt={block.alt || t("feed.document.imageAlt")} loading="lazy" src={safeSrc} />
        {(block.title || block.alt) && <figcaption>{block.title || block.alt}</figcaption>}
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
                <th key={`header-${index}-${headerIndex}`}>{renderInlineMarkdown(header, highlightQuery, `table-header-${index}-${headerIndex}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={`row-${index}-${rowIndex}`}>
                {row.map((cell, cellIndex) => (
                  <td key={`cell-${index}-${rowIndex}-${cellIndex}`}>{renderInlineMarkdown(cell, highlightQuery, `table-cell-${index}-${rowIndex}-${cellIndex}`)}</td>
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
    return <pre className="feed-document-code" key={`block-${index}`}><code>{block.code}</code></pre>;
  }

  return (
    <p className="feed-document-paragraph" key={`block-${index}`}>
      {renderInlineMarkdown(block.text, highlightQuery, `paragraph-${index}`)}
    </p>
  );
}
