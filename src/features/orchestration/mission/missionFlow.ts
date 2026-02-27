import type { MissionFlowState, MissionStage, MissionStageState } from "../types";

type BuildMissionFlowStateParams = {
  hasDecomposed: boolean;
  pendingApprovals: number;
  hasExecutionStarted: boolean;
  hasExecutionCompleted: boolean;
  hasSummary: boolean;
};

const STAGES: Array<{ id: MissionStage; title: string }> = [
  { id: "decompose", title: "요구사항 분해" },
  { id: "approval", title: "승인 확인" },
  { id: "execution", title: "실행" },
  { id: "summary", title: "요약" },
];

function stageDoneMap(params: BuildMissionFlowStateParams): Record<MissionStage, boolean> {
  return {
    decompose: params.hasDecomposed,
    approval: params.pendingApprovals === 0 && params.hasDecomposed,
    execution: params.hasExecutionCompleted && params.hasExecutionStarted,
    summary: params.hasSummary,
  };
}

export function buildMissionFlowState(params: BuildMissionFlowStateParams): MissionFlowState {
  const doneMap = stageDoneMap(params);
  let activeStage: MissionStage = "decompose";
  for (const stage of STAGES) {
    if (!doneMap[stage.id]) {
      activeStage = stage.id;
      break;
    }
  }
  if (STAGES.every((stage) => doneMap[stage.id])) {
    activeStage = "summary";
  }

  const stages: MissionStageState[] = STAGES.map((stage) => {
    if (doneMap[stage.id]) {
      return { id: stage.id, title: stage.title, status: "done" };
    }
    if (stage.id === activeStage) {
      return { id: stage.id, title: stage.title, status: "active" };
    }
    return { id: stage.id, title: stage.title, status: "todo" };
  });

  const ctaByStage: Record<MissionStage, { headline: string; actionLabel: string }> = {
    decompose: {
      headline: "요구사항을 역할별 태스크로 분해하세요.",
      actionLabel: "태스크 분해 시작",
    },
    approval: {
      headline: "실행 전 승인 항목을 처리하세요.",
      actionLabel: "승인 요청 확인",
    },
    execution: {
      headline: "태스크를 실행하고 결과를 수집하세요.",
      actionLabel: "실행 진행",
    },
    summary: {
      headline: "최종 요약과 산출물을 확인하세요.",
      actionLabel: "요약 보기",
    },
  };

  return {
    stages,
    activeStage,
    cta: {
      stage: activeStage,
      headline: ctaByStage[activeStage].headline,
      actionLabel: ctaByStage[activeStage].actionLabel,
    },
  };
}
