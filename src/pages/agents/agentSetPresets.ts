import { DASHBOARD_TOPIC_IDS, type DashboardTopicId } from "../../features/dashboard/intelligence";

export type AgentSetOptionLike = {
  id: string;
  label: string;
  description: string;
};

export type AgentThreadPreset = {
  id: string;
  name: string;
  role: string;
  guidance: string[];
  starterPrompt: string;
};

export type AgentSetPreset = {
  mission: string;
  defaultDraft: string;
  threads: AgentThreadPreset[];
};

function isDashboardTopicId(value: string): value is DashboardTopicId {
  return DASHBOARD_TOPIC_IDS.includes(value as DashboardTopicId);
}

function topicIdFromSetId(setId: string): DashboardTopicId | null {
  if (!setId.startsWith("data-")) {
    return null;
  }
  const candidate = setId.slice(5);
  return isDashboardTopicId(candidate) ? candidate : null;
}

function buildDataTopicPreset(option: AgentSetOptionLike, topicId: DashboardTopicId): AgentSetPreset {
  return {
    mission: `${option.label}의 크롤링/RAG/Codex 파이프라인을 분담 실행하여 스냅샷을 안정적으로 생성합니다.`,
    defaultDraft: `${option.label} 토픽을 실행하고 핵심 변화 3개, 리스크 2개, 참고 링크를 업데이트해줘.`,
    threads: [
      {
        id: `${topicId}-crawler`,
        name: "crawler-agent",
        role: "Crawler Operator",
        guidance: [
          "allowlist 소스 상태를 확인하고 수집 실패 원인을 분리합니다.",
          "최신성 기준(시간/날짜)을 우선 검증합니다.",
          "raw 파일 저장 경로와 파일 개수를 요약합니다.",
        ],
        starterPrompt: "수집 소스별 성공/실패 현황과 원인을 먼저 점검해줘.",
      },
      {
        id: `${topicId}-rag`,
        name: "rag-analyst",
        role: "RAG Evidence Analyst",
        guidance: [
          "중복 스니펫을 묶고 핵심 증거만 남깁니다.",
          "근거 없는 주장과 추론을 분리합니다.",
          "요약에 필요한 reference 후보 URL을 정리합니다.",
        ],
        starterPrompt: "retrieved snippets를 근거 중심으로 정리해서 핵심 증거를 뽑아줘.",
      },
      {
        id: `${topicId}-synth`,
        name: "snapshot-synthesizer",
        role: "Snapshot Synthesizer",
        guidance: [
          "summary/highlights/risks/events를 JSON 스키마에 맞춰 구성합니다.",
          "근거가 약하면 불확실성을 명시하고 과장하지 않습니다.",
          "실행 가능한 next action을 포함한 최종 스냅샷을 만듭니다.",
        ],
        starterPrompt: "최종 스냅샷 JSON을 안정적으로 생성하고 리스크를 분리 보고해줘.",
      },
    ],
  };
}

function buildNamedPreset(option: AgentSetOptionLike): AgentSetPreset {
  switch (option.id) {
    case "market-research":
      return {
        mission: "시장 신호를 수집·해석·브리핑으로 분리해 실행 가능한 인사이트로 통합합니다.",
        defaultDraft: "이번 주 시장 신호를 요약하고, 실행 가능한 액션 아이템 5개로 정리해줘.",
        threads: [
          {
            id: "market-scout",
            name: "signal-scout",
            role: "Signal Scout",
            guidance: [
              "가격/거래량/거시 이벤트를 빠르게 수집합니다.",
              "신뢰 가능한 1차 출처를 우선합니다.",
              "상승/하락 신호를 분리해 노이즈를 제거합니다.",
            ],
            starterPrompt: "최근 24시간 시장 핵심 신호를 소스 포함으로 정리해줘.",
          },
          {
            id: "market-analyst",
            name: "risk-analyst",
            role: "Risk Analyst",
            guidance: [
              "핵심 리스크를 확률·영향 기준으로 우선순위화합니다.",
              "반례와 불확실성을 명시합니다.",
              "검증이 필요한 항목을 따로 분리합니다.",
            ],
            starterPrompt: "수집 신호를 기반으로 리스크 우선순위를 정리해줘.",
          },
          {
            id: "market-brief",
            name: "briefing-lead",
            role: "Briefing Lead",
            guidance: [
              "의사결정자가 바로 읽을 수 있게 핵심만 압축합니다.",
              "결론/근거/리스크/다음 행동 순서로 출력합니다.",
              "과도한 서술 대신 실행 항목 중심으로 정리합니다.",
            ],
            starterPrompt: "의사결정용 1페이지 브리핑 형태로 최종 정리해줘.",
          },
        ],
      };
    case "content-ops":
      return {
        mission: "기획-작성-검수를 분리해 콘텐츠 생산 품질과 속도를 동시에 확보합니다.",
        defaultDraft: "이번 주 배포 콘텐츠 3건의 기획안과 검수 체크리스트를 만들어줘.",
        threads: [
          {
            id: "content-plan",
            name: "content-planner",
            role: "Content Planner",
            guidance: [
              "타깃/채널/목표 행동을 명확히 정의합니다.",
              "콘텐츠 포맷별 핵심 메시지를 분리합니다.",
              "우선순위와 일정 제약을 같이 반영합니다.",
            ],
            starterPrompt: "배포 채널별 기획안과 우선순위를 제안해줘.",
          },
          {
            id: "content-write",
            name: "content-writer",
            role: "Content Writer",
            guidance: [
              "핵심 메시지를 유지한 상태로 채널 톤을 맞춥니다.",
              "길이/CTA/구조를 채널별로 최적화합니다.",
              "필요한 근거와 출처를 함께 제시합니다.",
            ],
            starterPrompt: "기획안을 기반으로 게시물 초안을 작성해줘.",
          },
          {
            id: "content-qa",
            name: "quality-reviewer",
            role: "Quality Reviewer",
            guidance: [
              "사실성, 문장 품질, 정책 리스크를 검수합니다.",
              "수정 전/후를 명확히 비교합니다.",
              "배포 가능 여부와 보완 포인트를 제시합니다.",
            ],
            starterPrompt: "초안을 검수하고 수정 포인트를 우선순위로 정리해줘.",
          },
        ],
      };
    case "dev-delivery":
      return {
        mission: "요구사항 정제-구현-검증을 분리해 개발 전달 품질을 높입니다.",
        defaultDraft: "현재 요구사항을 기반으로 구현 계획과 테스트 항목을 정리해줘.",
        threads: [
          {
            id: "dev-spec",
            name: "spec-architect",
            role: "Spec Architect",
            guidance: [
              "요구사항을 구현 가능한 단위로 분해합니다.",
              "수용 기준과 비기능 요구사항을 함께 명시합니다.",
              "리스크가 큰 항목은 별도 트랙으로 분리합니다.",
            ],
            starterPrompt: "요구사항을 구현 단위/수용 기준으로 구조화해줘.",
          },
          {
            id: "dev-impl",
            name: "implementation-agent",
            role: "Implementation Agent",
            guidance: [
              "작은 단위 패치로 변경을 쪼개 적용합니다.",
              "기존 아키텍처 경계를 지키며 구현합니다.",
              "코드 변경의 이유와 영향 범위를 함께 기록합니다.",
            ],
            starterPrompt: "우선순위가 높은 변경부터 작은 패치로 구현해줘.",
          },
          {
            id: "dev-verify",
            name: "verification-agent",
            role: "Verification Agent",
            guidance: [
              "빌드/테스트/회귀 리스크를 점검합니다.",
              "실패 시 원인과 재현 절차를 남깁니다.",
              "릴리즈 전 체크리스트를 최종 확인합니다.",
            ],
            starterPrompt: "변경사항 검증 계획과 회귀 리스크를 정리해줘.",
          },
        ],
      };
    default:
      return {
        mission: option.description,
        defaultDraft: `${option.label} 기준으로 실행 계획을 정리하고 바로 실행 가능한 작업으로 나눠줘.`,
        threads: [
          {
            id: `${option.id}-planner`,
            name: "planner-agent",
            role: "Planner",
            guidance: ["요구사항을 단계별 작업으로 분해합니다.", "핵심 제약을 먼저 명시합니다."],
            starterPrompt: "현재 요청을 실행 가능한 단계로 먼저 분해해줘.",
          },
          {
            id: `${option.id}-executor`,
            name: "executor-agent",
            role: "Executor",
            guidance: ["우선순위가 높은 작업부터 실행합니다.", "완료 기준을 명확히 보고합니다."],
            starterPrompt: "분해된 단계 중 우선순위 1순위를 실행해줘.",
          },
        ],
      };
  }
}

export function buildAgentSetPreset(option: AgentSetOptionLike): AgentSetPreset {
  const topicId = topicIdFromSetId(option.id);
  if (topicId) {
    return buildDataTopicPreset(option, topicId);
  }
  return buildNamedPreset(option);
}
