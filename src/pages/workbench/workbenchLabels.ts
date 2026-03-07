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
