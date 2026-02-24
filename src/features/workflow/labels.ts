import { extractStringByPaths, formatUnknown } from "../../shared/lib/valueUtils";
import { t } from "../../i18n";
import { turnModelLabel } from "./graph-utils";
import type { GraphNode, KnowledgeFileStatus, NodeExecutionStatus, NodeType } from "./types";
import type { TurnConfig } from "./domain";

const FALLBACK_TURN_ROLE = "GENERAL AGENT";

export function turnRoleLabel(node: GraphNode): string {
  const config = node.config as TurnConfig;
  const raw = String(config.role ?? "").trim();
  if (raw) {
    return raw;
  }

  const signal = `${node.id} ${String(config.promptTemplate ?? "")}`.toLowerCase();
  if (signal.includes("search")) {
    return "SEARCH AGENT";
  }
  if (signal.includes("judge") || signal.includes("evaluator") || signal.includes("quality")) {
    return "EVALUATION AGENT";
  }
  if (signal.includes("final") || signal.includes("synth")) {
    return "SYNTHESIS AGENT";
  }
  if (signal.includes("intake") || signal.includes("requirements")) {
    return "PLANNING AGENT";
  }
  if (signal.includes("architect")) {
    return "ARCHITECTURE AGENT";
  }
  if (signal.includes("implementation")) {
    return "IMPLEMENTATION AGENT";
  }
  return FALLBACK_TURN_ROLE;
}

export function nodeTypeLabel(type: NodeType, simpleWorkflowUI = true): string {
  if (type === "turn") {
    return t("label.node.turn");
  }
  if (simpleWorkflowUI) {
    return t("label.node.internal");
  }
  if (type === "transform") {
    return t("label.node.transform");
  }
  return t("label.node.gate");
}

export function nodeSelectionLabel(node: GraphNode): string {
  if (node.type === "turn") {
    return turnModelLabel(node);
  }
  if (node.type === "transform") {
    return t("label.node.transform");
  }
  return t("label.node.gate");
}

export function nodeStatusLabel(status: NodeExecutionStatus): string {
  if (status === "idle") {
    return t("label.status.idle");
  }
  if (status === "queued") {
    return t("label.status.queued");
  }
  if (status === "running") {
    return t("label.status.running");
  }
  if (status === "waiting_user") {
    return t("label.status.waiting_user");
  }
  if (status === "done") {
    return t("label.status.done");
  }
  if (status === "failed") {
    return t("label.status.failed");
  }
  if (status === "skipped") {
    return t("label.status.skipped");
  }
  return t("label.status.cancelled");
}

export function knowledgeStatusMeta(status?: KnowledgeFileStatus): { label: string; tone: string } {
  if (status === "ready") {
    return { label: t("label.knowledge.ready"), tone: "ready" };
  }
  if (status === "missing") {
    return { label: t("label.knowledge.missing"), tone: "missing" };
  }
  if (status === "unsupported") {
    return { label: t("label.knowledge.unsupported"), tone: "unsupported" };
  }
  if (status === "error") {
    return { label: t("label.knowledge.error"), tone: "error" };
  }
  return { label: t("label.knowledge.unknown"), tone: "unknown" };
}

export function approvalDecisionLabel(decision: "accept" | "acceptForSession" | "decline" | "cancel"): string {
  if (decision === "accept") {
    return t("label.approval.accept");
  }
  if (decision === "acceptForSession") {
    return t("label.approval.acceptForSession");
  }
  if (decision === "decline") {
    return t("label.approval.decline");
  }
  return t("label.approval.cancel");
}

export function approvalSourceLabel(source: "remote"): string {
  if (source === "remote") {
    return "엔진(app-server)";
  }
  return source;
}

export function lifecycleStateLabel(state: string): string {
  const map: Record<string, string> = {
    starting: "시작 중",
    ready: "준비됨",
    stopped: "중지됨",
    disconnected: "연결 끊김",
    parseError: "파싱 오류",
    readError: "읽기 오류",
    stderrError: "표준오류 스트림 오류",
  };
  return map[state] ?? state;
}

export function formatRelativeFeedTime(iso: string): string {
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) {
    return iso;
  }
  const diffMs = Date.now() - at;
  if (diffMs < 60_000) {
    return t("time.justNow");
  }
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) {
    return t("time.minutesAgo", { value: minutes });
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return t("time.hoursAgo", { value: hours });
  }
  const days = Math.floor(hours / 24);
  return t("time.daysAgo", { value: days });
}

export function authModeLabel(mode: "chatgpt" | "apikey" | "unknown"): string {
  if (mode === "chatgpt") {
    return t("label.auth.chatgpt");
  }
  if (mode === "apikey") {
    return t("label.auth.apikey");
  }
  return t("label.auth.unknown");
}

export function extractFinalAnswer(output: unknown): string {
  const maybeText = extractStringByPaths(output, [
    "text",
    "completion.text",
    "finalDraft",
    "result",
  ]);
  if (maybeText) {
    return maybeText;
  }
  if (output == null) {
    return "";
  }
  return formatUnknown(output);
}
