import type { ViaNodeType } from "./viaCatalog";

export type RagTemplateId = "rag.full" | "rag.fast_news" | "rag.market_watch";

export const RAG_TEMPLATE_NODE_TYPES: Record<RagTemplateId, ViaNodeType[]> = {
  "rag.full": [
    "trigger.manual",
    "source.news",
    "source.sns",
    "source.community",
    "source.dev",
    "source.market",
    "transform.normalize",
    "transform.verify",
    "transform.rank",
    "agent.codex",
    "export.rag",
  ],
  "rag.fast_news": [
    "trigger.manual",
    "source.news",
    "transform.normalize",
    "transform.verify",
    "transform.rank",
    "agent.codex",
    "export.rag",
  ],
  "rag.market_watch": [
    "trigger.manual",
    "source.market",
    "source.community",
    "source.news",
    "transform.normalize",
    "transform.verify",
    "transform.rank",
    "agent.codex",
    "export.rag",
  ],
};

export const RAG_TEMPLATE_OPTIONS: Array<{ value: RagTemplateId; label: string }> = [
  { value: "rag.full", label: "전체 파이프라인" },
  { value: "rag.fast_news", label: "빠른 뉴스 브리핑" },
  { value: "rag.market_watch", label: "시장/커뮤니티 모니터" },
];
