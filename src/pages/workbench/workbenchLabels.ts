import type { AgenticVerificationStatus, AgenticWorkSurface } from "../../features/orchestration/types";
import type { WorkSessionReviewState, WorkSessionStatus } from "../../features/orchestration/workbench/types";

export function workbenchSurfaceLabel(surface: AgenticWorkSurface): string {
  if (surface === "vscode") {
    return "VS Code";
  }
  if (surface === "unity") {
    return "Unity";
  }
  return "RAIL";
}

export function workbenchVerificationLabel(status: AgenticVerificationStatus): string {
  if (status === "verified") {
    return "검증 완료";
  }
  if (status === "failed") {
    return "검증 실패";
  }
  return "검증 대기";
}

export function workbenchStatusLabel(status: WorkSessionStatus): string {
  if (status === "waiting") {
    return "대기";
  }
  if (status === "active") {
    return "진행";
  }
  if (status === "review") {
    return "검토";
  }
  if (status === "unity") {
    return "Unity 확인";
  }
  return "완료";
}

export function workbenchReviewLabel(state: WorkSessionReviewState): string {
  if (state === "approved") {
    return "승인됨";
  }
  if (state === "rejected") {
    return "반려됨";
  }
  if (state === "pending") {
    return "검토 대기";
  }
  return "검토 없음";
}

export function workbenchRuntimeStatusLabel(status: string): string {
  if (status === "running") {
    return "실행 중";
  }
  if (status === "queued") {
    return "대기열";
  }
  if (status === "waiting_user") {
    return "사용자 응답 대기";
  }
  if (status === "done") {
    return "완료";
  }
  if (status === "error") {
    return "오류";
  }
  if (status === "paused") {
    return "일시중지";
  }
  if (status === "idle") {
    return "유휴";
  }
  return status || "알 수 없음";
}
