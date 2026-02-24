import { extractStringByPaths, formatUnknown } from "../../app/mainAppUtils";
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
    return "응답 에이전트";
  }
  if (simpleWorkflowUI) {
    return "내부 처리";
  }
  if (type === "transform") {
    return "데이터 변환";
  }
  return "결정 분기";
}

export function nodeSelectionLabel(node: GraphNode): string {
  if (node.type === "turn") {
    return turnModelLabel(node);
  }
  if (node.type === "transform") {
    return "데이터 변환";
  }
  return "결정 분기";
}

export function nodeStatusLabel(status: NodeExecutionStatus): string {
  if (status === "idle") {
    return "대기";
  }
  if (status === "queued") {
    return "대기열";
  }
  if (status === "running") {
    return "실행 중";
  }
  if (status === "waiting_user") {
    return "사용자 입력 대기";
  }
  if (status === "done") {
    return "완료";
  }
  if (status === "failed") {
    return "오류";
  }
  if (status === "skipped") {
    return "건너뜀";
  }
  return "정지";
}

export function knowledgeStatusMeta(status?: KnowledgeFileStatus): { label: string; tone: string } {
  if (status === "ready") {
    return { label: "준비됨", tone: "ready" };
  }
  if (status === "missing") {
    return { label: "파일 없음", tone: "missing" };
  }
  if (status === "unsupported") {
    return { label: "미지원", tone: "unsupported" };
  }
  if (status === "error") {
    return { label: "오류", tone: "error" };
  }
  return { label: "미확인", tone: "unknown" };
}

export function approvalDecisionLabel(decision: "accept" | "acceptForSession" | "decline" | "cancel"): string {
  if (decision === "accept") {
    return "허용";
  }
  if (decision === "acceptForSession") {
    return "세션 동안 허용";
  }
  if (decision === "decline") {
    return "거절";
  }
  return "취소";
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
    return "방금";
  }
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) {
    return `${minutes}분 전`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}시간 전`;
  }
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

export function authModeLabel(mode: "chatgpt" | "apikey" | "unknown"): string {
  if (mode === "chatgpt") {
    return "챗지피티";
  }
  if (mode === "apikey") {
    return "API 키";
  }
  return "미확인";
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
