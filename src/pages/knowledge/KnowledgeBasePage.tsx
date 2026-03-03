import { useEffect, useMemo, useState } from "react";
import {
  persistKnowledgeIndexToWorkspace,
  readKnowledgeEntries,
  removeKnowledgeEntry,
  upsertKnowledgeEntry,
} from "../../features/studio/knowledgeIndex";
import type { KnowledgeEntry, KnowledgeSourcePost } from "../../features/studio/knowledgeTypes";
import { invoke } from "../../shared/tauri";

type KnowledgeBasePageProps = {
  cwd: string;
  posts: KnowledgeSourcePost[];
  onInjectContextSources: (entries: KnowledgeEntry[]) => void;
};

const HIDDEN_MARKET_TOPICS = new Set([
  "MARKET_SUMMARY",
  "GLOBAL_HEADLINES",
  "TREND_RADAR",
  "COMMUNITY_HOT_TOPICS",
  "DEV_COMMUNITY_HOT_TOPICS",
  "EVENT_CALENDAR",
  "RISK_ALERT_BOARD",
  "DEV_ECOSYSTEM_UPDATES",
  "PAPER_TOPICS",
]);

function toUpperSnakeToken(raw: string): string {
  const base = String(raw ?? "").trim();
  if (!base) {
    return "TASK_UNKNOWN";
  }
  const snake = base
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  return snake || "TASK_UNKNOWN";
}

function isHiddenKnowledgeEntry(entry: Pick<KnowledgeEntry, "runId" | "taskId">): boolean {
  const runId = String(entry.runId ?? "").trim();
  const taskId = toUpperSnakeToken(String(entry.taskId ?? ""));
  const raw = `${runId} ${taskId}`.toUpperCase();
  if (runId.startsWith("topic-") || HIDDEN_MARKET_TOPICS.has(taskId)) {
    return true;
  }
  return /GLOBAL_HEADLINES|MARKET_SUMMARY|TREND_RADAR|COMMUNITY_HOT_TOPICS|EVENT_CALENDAR|RISK_ALERT_BOARD|DEV_ECOSYSTEM_UPDATES/.test(raw);
}

function toKnowledgeEntry(post: KnowledgeSourcePost): KnowledgeEntry | null {
  const runId = String(post.runId ?? "").trim();
  const taskId = toUpperSnakeToken(String(post.topicLabel ?? post.topic ?? "TASK_UNKNOWN"));
  if (isHiddenKnowledgeEntry({ runId, taskId })) {
    return null;
  }
  return {
    id: post.id,
    runId,
    taskId,
    roleId: "technical_writer",
    sourceKind: "artifact",
    title: String(post.summary ?? "").slice(0, 72) || post.agentName,
    summary: String(post.summary ?? ""),
    createdAt: post.createdAt,
    markdownPath: post.attachments.find((row) => row.kind === "markdown")?.filePath,
    jsonPath: post.attachments.find((row) => row.kind === "json")?.filePath,
  };
}

function formatSourceKindLabel(kind: KnowledgeEntry["sourceKind"]): string {
  if (kind === "artifact") {
    return "산출물";
  }
  if (kind === "ai") {
    return "AI 자료";
  }
  return "WEB 자료";
}

export default function KnowledgeBasePage({ cwd, posts, onInjectContextSources }: KnowledgeBasePageProps) {
  const [selectedId, setSelectedId] = useState<string>("");
  const [entries, setEntries] = useState<KnowledgeEntry[]>(() =>
    readKnowledgeEntries().filter((row) => !isHiddenKnowledgeEntry(row)),
  );

  useEffect(() => {
    let next = readKnowledgeEntries().filter((row) => !isHiddenKnowledgeEntry(row));
    for (const post of posts) {
      const row = toKnowledgeEntry(post);
      if (!row) {
        continue;
      }
      next = upsertKnowledgeEntry(row).filter((entry) => !isHiddenKnowledgeEntry(entry));
    }
    setEntries(next);
    void persistKnowledgeIndexToWorkspace({ cwd, invokeFn: invoke, rows: next });
  }, [cwd, posts]);

  const filtered = useMemo(() => [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [entries]);

  const selected = filtered.find((row) => row.id === selectedId) ?? filtered[0] ?? null;
  const entryStats = useMemo(
    () => ({
      total: entries.length,
      artifact: entries.filter((row) => row.sourceKind === "artifact").length,
      web: entries.filter((row) => row.sourceKind === "web").length,
      ai: entries.filter((row) => row.sourceKind === "ai").length,
    }),
    [entries],
  );

  useEffect(() => {
    if (!selected && selectedId) {
      setSelectedId("");
    }
  }, [selected, selectedId]);

  const persistRows = (rows: KnowledgeEntry[]) => {
    setEntries(rows);
    void persistKnowledgeIndexToWorkspace({ cwd, invokeFn: invoke, rows });
  };

  const onDeleteSelected = () => {
    if (!selected) {
      return;
    }
    const next = removeKnowledgeEntry(selected.id);
    persistRows(next);
    setSelectedId("");
  };

  return (
    <section className="panel-card knowledge-view workspace-tab-panel">
      <header className="knowledge-head">
        <h2>데이터베이스</h2>
        <p>역할 실행으로 생성된 산출물(MD/JSON)을 탐색하고 에이전트 컨텍스트로 재주입합니다.</p>
      </header>
      <section className="knowledge-overview">
        <article className="knowledge-overview-card panel-card">
          <strong>전체 문서</strong>
          <span>{entryStats.total}</span>
        </article>
        <article className="knowledge-overview-card panel-card">
          <strong>산출물</strong>
          <span>{entryStats.artifact}</span>
        </article>
        <article className="knowledge-overview-card panel-card">
          <strong>WEB 자료</strong>
          <span>{entryStats.web}</span>
        </article>
        <article className="knowledge-overview-card panel-card">
          <strong>AI 자료</strong>
          <span>{entryStats.ai}</span>
        </article>
      </section>
      <section className="knowledge-layout">
        <section className="knowledge-list panel-card knowledge-island">
          <header className="knowledge-list-head">
            <strong>산출물 탐색</strong>
            <span>{`표시 ${filtered.length}개`}</span>
          </header>
          {filtered.length === 0 ? (
            <p className="knowledge-empty">표시할 문서가 없습니다.</p>
          ) : (
            filtered.map((entry) => (
              <button
                key={entry.id}
                className={`knowledge-row${selected?.id === entry.id ? " is-selected" : ""}`}
                onClick={() => setSelectedId(entry.id)}
                type="button"
              >
                <strong>{entry.title}</strong>
                <span>{`${toUpperSnakeToken(entry.taskId)} · ${formatSourceKindLabel(entry.sourceKind)}`}</span>
                <small>{new Date(entry.createdAt).toLocaleString()}</small>
              </button>
            ))
          )}
        </section>
        <section className="knowledge-detail panel-card knowledge-island">
          {selected ? (
            <>
              <header className="knowledge-detail-head">
                <h3>{selected.title}</h3>
                <div className="knowledge-detail-actions">
                  <button type="button" onClick={() => onInjectContextSources([selected])}>
                    컨텍스트로 사용
                  </button>
                  <button type="button" className="danger" onClick={onDeleteSelected}>
                    삭제
                  </button>
                </div>
              </header>
              <p>{selected.summary || "요약 없음"}</p>
              <dl className="knowledge-paths">
                <dt>유형</dt>
                <dd>{formatSourceKindLabel(selected.sourceKind)}</dd>
                <dt>SOURCE</dt>
                <dd>{selected.sourceUrl || "-"}</dd>
                <dt>TASK</dt>
                <dd>{toUpperSnakeToken(selected.taskId)}</dd>
                <dt>MD</dt>
                <dd>{selected.markdownPath || "-"}</dd>
                <dt>JSON</dt>
                <dd>{selected.jsonPath || "-"}</dd>
              </dl>
            </>
          ) : (
            <p className="knowledge-empty">좌측에서 문서를 선택하세요.</p>
          )}
        </section>
      </section>
    </section>
  );
}
