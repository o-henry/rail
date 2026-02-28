import type { DashboardTopicAgentConfig, DashboardTopicId, DashboardTopicSnapshot } from "./types";

type KnowledgeSnippetLike = {
  fileName: string;
  chunkIndex: number;
  text: string;
  score: number;
};

type BuildDashboardPromptParams = {
  topic: DashboardTopicId;
  config: DashboardTopicAgentConfig;
  snippets: KnowledgeSnippetLike[];
  previousSnapshot?: DashboardTopicSnapshot;
};

function renderSnippets(snippets: KnowledgeSnippetLike[]): string {
  if (snippets.length === 0) {
    return "No snippets were retrieved from current crawl files.";
  }
  return snippets
    .map(
      (snippet, index) =>
        `${index + 1}. [source: ${snippet.fileName}#${snippet.chunkIndex} / score:${snippet.score.toFixed(3)}]\n${snippet.text}`,
    )
    .join("\n\n");
}

function renderPreviousSnapshot(previousSnapshot?: DashboardTopicSnapshot): string {
  if (!previousSnapshot) {
    return "No previous snapshot.";
  }
  return JSON.stringify(
    {
      generatedAt: previousSnapshot.generatedAt,
      summary: previousSnapshot.summary,
      highlights: previousSnapshot.highlights,
      risks: previousSnapshot.risks,
      events: previousSnapshot.events,
      references: previousSnapshot.references,
    },
    null,
    2,
  );
}

export function buildDashboardTopicPrompt(params: BuildDashboardPromptParams): string {
  return `
You are the dashboard intelligence agent for topic "${params.topic}".

[System Role]
${params.config.systemPrompt}

[Task]
- Use only provided snippets as primary evidence.
- Produce concise and grounded summary for dashboard rendering.
- Keep references specific and deduplicated.
- If evidence is missing, clearly state uncertainty and keep references empty.

[Output JSON Schema]
Return strict JSON object with fields:
{
  "summary": string,
  "highlights": string[],
  "risks": string[],
  "events": [{"title": string, "date"?: string, "note"?: string}],
  "references": [{"url": string, "title": string, "source": string, "publishedAt"?: string}],
  "generatedAt": string (ISO datetime),
  "topic": string,
  "model": string
}

[Previous Snapshot]
${renderPreviousSnapshot(params.previousSnapshot)}

[Retrieved Snippets]
${renderSnippets(params.snippets)}

[Constraints]
- highlights max 6 items
- risks max 6 items
- events max 8 items
- references max ${params.config.maxSources} items
- summary max 550 chars
- return JSON only (no markdown, no commentary)
`.trim();
}
