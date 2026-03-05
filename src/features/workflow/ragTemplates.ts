import type { ViaNodeType } from "./viaCatalog";

export type RagTemplateId = "rag.market" | "rag.community" | "rag.news" | "rag.sns";

export const RAG_TEMPLATE_NODE_TYPES: Record<RagTemplateId, ViaNodeType[]> = {
  "rag.market": [
    "trigger.manual",
    "source.market",
    "transform.normalize",
    "transform.verify",
    "transform.rank",
    "agent.codex",
    "export.rag",
  ],
  "rag.community": [
    "trigger.manual",
    "source.community",
    "transform.normalize",
    "transform.verify",
    "transform.rank",
    "agent.codex",
    "export.rag",
  ],
  "rag.news": [
    "trigger.manual",
    "source.news",
    "transform.normalize",
    "transform.verify",
    "transform.rank",
    "agent.codex",
    "export.rag",
  ],
  "rag.sns": [
    "trigger.manual",
    "source.sns",
    "transform.normalize",
    "transform.verify",
    "transform.rank",
    "agent.codex",
    "export.rag",
  ],
};

export const RAG_TEMPLATE_OPTIONS: Array<{ value: RagTemplateId; label: string }> = [
  { value: "rag.market", label: "주식/마켓" },
  { value: "rag.community", label: "커뮤니티" },
  { value: "rag.news", label: "뉴스" },
  { value: "rag.sns", label: "SNS" },
];
