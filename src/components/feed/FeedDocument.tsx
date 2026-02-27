import { useMemo } from "react";
import FeedChart from "./FeedChart";
import { extractChartSpecsFromContent } from "../../features/feed/chartSpec";
import { normalizeFlattenedStructuredText, parseDocumentBlocks, parseWholeJsonDocument } from "./feedDocumentParsing";
import { renderDocumentBlock, renderJsonValue } from "./feedDocumentRender";

type FeedDocumentProps = {
  text: string;
  className?: string;
  highlightQuery?: string;
};

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
        : blocks.map((block, index) => renderDocumentBlock(block, index, highlightQuery))}
    </div>
  );
}
