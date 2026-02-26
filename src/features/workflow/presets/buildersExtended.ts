import type { GraphData, GraphEdge, GraphNode } from "../types";
import { GRAPH_SCHEMA_VERSION, defaultKnowledgeConfig, makePresetNode } from "./shared";

export function buildUnityGamePreset(): GraphData {
  const nodes: GraphNode[] = [
    makePresetNode("turn-unity-intake", "turn", 120, 120, {
      model: "GPT-5.3-Codex-Spark",
      role: "UNITY CONCEPT AGENT",
      cwd: ".",
      promptTemplate:
        "입력 요청을 유니티 게임 기획 브리프로 구조화하라.\n" +
        "형식: genre / coreLoop / targetPlatform / scope(MVP) / mustHave.\n" +
        "입력: {{input}}",
    }),
    makePresetNode("turn-unity-system", "turn", 420, 40, {
      model: "GPT-5.2-Codex",
      role: "UNITY SYSTEM DESIGN AGENT",
      cwd: ".",
      promptTemplate:
        "유니티 시스템 설계안을 작성하라.\n" +
        "필수: 씬 구조, 게임 상태 관리, 입력 시스템, 데이터 저장 전략.\n" +
        "입력: {{input}}",
    }),
    makePresetNode("turn-unity-implementation", "turn", 420, 220, {
      model: "GPT-5.2-Codex",
      role: "UNITY IMPLEMENTATION AGENT",
      cwd: ".",
      promptTemplate:
        "구현 계획을 작성하라.\n" +
        "필수: C# 스크립트 목록, 폴더 구조, 단계별 구현 순서, 테스트 포인트.\n" +
        "입력: {{input}}",
    }),
    makePresetNode("turn-unity-qa", "turn", 720, 120, {
      model: "GPT-5.2",
      role: "UNITY QA AGENT",
      cwd: ".",
      promptTemplate:
        "설계/구현 계획을 리뷰해 JSON 판정을 출력하라.\n" +
        '{ "DECISION":"PASS|REJECT", "bugsToWatch":["..."], "performanceRisks":["..."], "finalDraft":"..." }\n' +
        "입력: {{input}}",
    }),
    makePresetNode("gate-unity", "gate", 1020, 120, {
      decisionPath: "DECISION",
      passNodeId: "turn-unity-final",
      rejectNodeId: "transform-unity-rework",
      schemaJson: "{\"type\":\"object\",\"required\":[\"DECISION\"]}",
    }),
    makePresetNode("turn-unity-final", "turn", 1320, 40, {
      model: "GPT-5.3-Codex",
      role: "UNITY FINALIZATION AGENT",
      cwd: ".",
      promptTemplate:
        "유니티 개발 실행 가이드를 최종 작성하라.\n" +
        "구성: 1주차~N주차 스프린트, 우선순위, 검증 체크리스트, 리스크 대응.\n" +
        "입력: {{input}}",
    }),
    makePresetNode("transform-unity-rework", "transform", 1320, 220, {
      mode: "template",
      template:
        "REJECT. 유니티 계획 재작성 필요.\n보완 항목:\n1) 성능 병목\n2) 콘텐츠 제작 범위\n3) 테스트 자동화\n원문: {{input}}",
    }),
  ];

  const edges: GraphEdge[] = [
    { from: { nodeId: "turn-unity-intake", port: "out" }, to: { nodeId: "turn-unity-system", port: "in" } },
    {
      from: { nodeId: "turn-unity-intake", port: "out" },
      to: { nodeId: "turn-unity-implementation", port: "in" },
    },
    { from: { nodeId: "turn-unity-system", port: "out" }, to: { nodeId: "turn-unity-qa", port: "in" } },
    {
      from: { nodeId: "turn-unity-implementation", port: "out" },
      to: { nodeId: "turn-unity-qa", port: "in" },
    },
    { from: { nodeId: "turn-unity-qa", port: "out" }, to: { nodeId: "gate-unity", port: "in" } },
    { from: { nodeId: "gate-unity", port: "out" }, to: { nodeId: "turn-unity-final", port: "in" } },
    { from: { nodeId: "gate-unity", port: "out" }, to: { nodeId: "transform-unity-rework", port: "in" } },
  ];

  return { version: GRAPH_SCHEMA_VERSION, nodes, edges, knowledge: defaultKnowledgeConfig() };
}

export function buildFullstackPreset(): GraphData {
  const nodes: GraphNode[] = [
    makePresetNode("turn-fullstack-intake", "turn", 120, 120, {
      model: "GPT-5.3-Codex-Spark",
      role: "PRODUCT SPEC AGENT",
      cwd: ".",
      promptTemplate:
        "요청을 풀스택 제품 명세로 구조화하라.\n" +
        "형식: personas / features / nonFunctional / mvpScope.\n" +
        "입력: {{input}}",
    }),
    makePresetNode("turn-fullstack-backend", "turn", 420, 40, {
      model: "GPT-5.2-Codex",
      role: "BACKEND AGENT",
      cwd: ".",
      promptTemplate:
        "백엔드 설계안을 작성하라.\n" +
        "필수: API 계약, DB 스키마, 인증/권한, 오류 처리, 관측성.\n" +
        "입력: {{input}}",
    }),
    makePresetNode("turn-fullstack-frontend", "turn", 420, 220, {
      model: "GPT-5.2-Codex",
      role: "FRONTEND AGENT",
      cwd: ".",
      promptTemplate:
        "프론트엔드 구현 계획을 작성하라.\n" +
        "필수: 정보구조, 화면 흐름, 상태관리, 접근성, 테스트 포인트.\n" +
        "입력: {{input}}",
    }),
    makePresetNode("turn-fullstack-ops", "turn", 720, 120, {
      model: "GPT-5.2",
      role: "OPS & SECURITY AGENT",
      cwd: ".",
      promptTemplate:
        "운영/보안 리뷰 결과를 JSON으로 출력하라.\n" +
        '{ "DECISION":"PASS|REJECT", "securityRisks":["..."], "deployChecklist":["..."], "finalDraft":"..." }\n' +
        "입력: {{input}}",
    }),
    makePresetNode("gate-fullstack", "gate", 1020, 120, {
      decisionPath: "DECISION",
      passNodeId: "turn-fullstack-final",
      rejectNodeId: "transform-fullstack-rework",
      schemaJson: "{\"type\":\"object\",\"required\":[\"DECISION\"]}",
    }),
    makePresetNode("turn-fullstack-final", "turn", 1320, 40, {
      model: "GPT-5.3-Codex",
      role: "FULLSTACK DELIVERY AGENT",
      cwd: ".",
      promptTemplate:
        "풀스택 실행 가이드를 최종 작성하라.\n" +
        "구성: 개발 순서, 마일스톤, 테스트 전략, 배포 전략, 운영 가드레일.\n" +
        "입력: {{input}}",
    }),
    makePresetNode("transform-fullstack-rework", "transform", 1320, 220, {
      mode: "template",
      template:
        "REJECT. 풀스택 계획 재작업 필요.\n핵심 보완: 보안, 장애복구, 테스트 커버리지.\n원문: {{input}}",
    }),
  ];

  const edges: GraphEdge[] = [
    {
      from: { nodeId: "turn-fullstack-intake", port: "out" },
      to: { nodeId: "turn-fullstack-backend", port: "in" },
    },
    {
      from: { nodeId: "turn-fullstack-intake", port: "out" },
      to: { nodeId: "turn-fullstack-frontend", port: "in" },
    },
    {
      from: { nodeId: "turn-fullstack-backend", port: "out" },
      to: { nodeId: "turn-fullstack-ops", port: "in" },
    },
    {
      from: { nodeId: "turn-fullstack-frontend", port: "out" },
      to: { nodeId: "turn-fullstack-ops", port: "in" },
    },
    {
      from: { nodeId: "turn-fullstack-ops", port: "out" },
      to: { nodeId: "gate-fullstack", port: "in" },
    },
    {
      from: { nodeId: "gate-fullstack", port: "out" },
      to: { nodeId: "turn-fullstack-final", port: "in" },
    },
    {
      from: { nodeId: "gate-fullstack", port: "out" },
      to: { nodeId: "transform-fullstack-rework", port: "in" },
    },
  ];

  return { version: GRAPH_SCHEMA_VERSION, nodes, edges, knowledge: defaultKnowledgeConfig() };
}

export function buildCreativePreset(): GraphData {
  const nodes: GraphNode[] = [
    makePresetNode("turn-creative-intake", "turn", 120, 120, {
      model: "GPT-5.3-Codex-Spark",
      role: "PROBLEM REFRAME AGENT",
      cwd: ".",
      promptTemplate:
        "입력 문제를 창의 탐색용으로 재정의하라.\n" +
        "형식: coreProblem / hiddenConstraints / challengeStatement.\n" +
        "입력: {{input}}",
    }),
    makePresetNode("turn-creative-diverge", "turn", 420, 40, {
      model: "GPT-5.2",
      role: "IDEA DIVERGENCE AGENT",
      cwd: ".",
      promptTemplate:
        "상호 성격이 다른 아이디어 8개를 제시하라.\n" +
        "조건: 서로 중복 금지, 평범한 해법 금지, 실행 가능성도 함께 표기.\n" +
        "입력: {{input}}",
    }),
    makePresetNode("turn-creative-critic", "turn", 420, 220, {
      model: "GPT-5.2-Codex",
      role: "IDEA CRITIC AGENT",
      cwd: ".",
      promptTemplate:
        "아이디어를 냉정하게 평가해 최상위 후보 3개를 선정하라.\n" +
        "형식:\n" +
        "1) 후보명\n2) 왜 강력한지\n3) 실제 구현 리스크\n4) 차별화 포인트\n" +
        "입력: {{input}}",
    }),
    makePresetNode("turn-creative-final", "turn", 1020, 40, {
      model: "GPT-5.3-Codex",
      role: "CREATIVE SYNTHESIS AGENT",
      cwd: ".",
      promptTemplate:
        "선정된 아이디어를 실전용 제안서로 작성하라.\n" +
        "주의: 내부 파서/분기/스키마 같은 시스템 구현 설명은 금지하고, 사용자 제품/기능 전략에만 집중하라.\n" +
        "구성: 컨셉, 차별점, 실행 단계, 리스크 대응, 성공 지표.\n" +
        "입력: {{input}}",
    }),
  ];

  const edges: GraphEdge[] = [
    {
      from: { nodeId: "turn-creative-intake", port: "out" },
      to: { nodeId: "turn-creative-diverge", port: "in" },
    },
    {
      from: { nodeId: "turn-creative-diverge", port: "out" },
      to: { nodeId: "turn-creative-critic", port: "in" },
    },
    {
      from: { nodeId: "turn-creative-critic", port: "out" },
      to: { nodeId: "turn-creative-final", port: "in" },
    },
  ];

  return { version: GRAPH_SCHEMA_VERSION, nodes, edges, knowledge: defaultKnowledgeConfig() };
}

export function buildNewsTrendPreset(): GraphData {
  const nodes: GraphNode[] = [
    makePresetNode("turn-news-intake", "turn", 120, 120, {
      model: "GPT-5.3-Codex-Spark",
      role: "NEWS BRIEF AGENT",
      cwd: ".",
      promptTemplate:
        "질문을 최신 뉴스/트렌드 조사 쿼리로 분해하라.\n" +
        "형식: timeWindow(최근 7일/30일) / queries / mustVerify.\n" +
        "입력: {{input}}",
    }),
    makePresetNode("turn-news-scan-a", "turn", 420, 40, {
      executor: "web_gemini",
      webResultMode: "bridgeAssisted",
      webTimeoutMs: 180000,
      model: "GPT-5.2",
      role: "WEB NEWS SCAN AGENT A",
      cwd: ".",
      promptTemplate:
        "최신 뉴스 관점으로 핵심 이슈 5개를 수집하고 날짜/출처/핵심포인트를 요약해줘.\n입력: {{input}}",
    }),
    makePresetNode("turn-news-scan-b", "turn", 420, 220, {
      executor: "web_gemini",
      webResultMode: "bridgeAssisted",
      webTimeoutMs: 180000,
      model: "GPT-5.2-Codex",
      role: "WEB TREND SCAN AGENT B",
      cwd: ".",
      promptTemplate:
        "트렌드 관점으로 신호(증가/감소/변곡점)를 찾아 요약해줘.\n입력: {{input}}",
    }),
    makePresetNode("turn-news-check", "turn", 720, 120, {
      model: "GPT-5.2-Codex",
      role: "NEWS FACT CHECK AGENT",
      cwd: ".",
      promptTemplate:
        "두 수집 결과를 교차검증해 JSON으로 출력하라.\n" +
        '{ "DECISION":"PASS|REJECT", "confirmed":["..."], "conflicts":["..."], "finalDraft":"..." }\n' +
        "입력: {{input}}",
    }),
    makePresetNode("gate-news", "gate", 1020, 120, {
      decisionPath: "DECISION",
      passNodeId: "turn-news-final",
      rejectNodeId: "transform-news-rework",
      schemaJson: "{\"type\":\"object\",\"required\":[\"DECISION\"]}",
    }),
    makePresetNode("turn-news-final", "turn", 1320, 40, {
      model: "GPT-5.3-Codex",
      role: "NEWS SYNTHESIS AGENT",
      cwd: ".",
      promptTemplate:
        "최신 뉴스/트렌드 브리핑을 작성하라.\n" +
        "구성: 핵심 변화, 영향 분석, 향후 2주 시나리오, 확인 필요 항목.\n" +
        "입력: {{input}}",
    }),
    makePresetNode("transform-news-rework", "transform", 1320, 220, {
      mode: "template",
      template:
        "REJECT. 최신성/출처 신뢰성 검증이 부족합니다.\n추가 확인 항목을 먼저 보강하세요.\n원문: {{input}}",
    }),
  ];

  const edges: GraphEdge[] = [
    { from: { nodeId: "turn-news-intake", port: "out" }, to: { nodeId: "turn-news-scan-a", port: "in" } },
    { from: { nodeId: "turn-news-intake", port: "out" }, to: { nodeId: "turn-news-scan-b", port: "in" } },
    { from: { nodeId: "turn-news-scan-a", port: "out" }, to: { nodeId: "turn-news-check", port: "in" } },
    { from: { nodeId: "turn-news-scan-b", port: "out" }, to: { nodeId: "turn-news-check", port: "in" } },
    { from: { nodeId: "turn-news-check", port: "out" }, to: { nodeId: "gate-news", port: "in" } },
    { from: { nodeId: "gate-news", port: "out" }, to: { nodeId: "turn-news-final", port: "in" } },
    { from: { nodeId: "gate-news", port: "out" }, to: { nodeId: "transform-news-rework", port: "in" } },
  ];

  return { version: GRAPH_SCHEMA_VERSION, nodes, edges, knowledge: defaultKnowledgeConfig() };
}

export function buildStockPreset(): GraphData {
  const nodes: GraphNode[] = [
    makePresetNode("turn-stock-intake", "turn", 120, 120, {
      model: "GPT-5.3-Codex-Spark",
      role: "STOCK INTAKE AGENT",
      cwd: ".",
      promptTemplate:
        "사용자 질문을 주식 분석 실행 브리프로 구조화하라.\n" +
        "형식: target(지수/종목) / timeHorizon(단기·중기·장기) / market(KR·US) / mustAnswer / constraints.\n" +
        "입력: {{input}}",
    }),
    makePresetNode("turn-stock-macro", "turn", 420, 20, {
      executor: "web_perplexity",
      webResultMode: "bridgeAssisted",
      webTimeoutMs: 180000,
      model: "GPT-5.2",
      role: "MARKET MACRO AGENT",
      cwd: ".",
      promptTemplate:
        "거시 변수(금리, 환율, 유가, 정책, 경기지표)가 목표 자산에 주는 영향을 최신 정보 중심으로 요약하라.\n" +
        "핵심: 상승/하락 요인을 분리하고, 근거 날짜를 함께 제시.\n" +
        "입력: {{input}}",
    }),
    makePresetNode("turn-stock-company", "turn", 420, 220, {
      executor: "web_gpt",
      webResultMode: "bridgeAssisted",
      webTimeoutMs: 180000,
      model: "GPT-5.2-Codex",
      role: "COMPANY & VALUATION AGENT",
      cwd: ".",
      promptTemplate:
        "목표 종목/지수의 펀더멘털/밸류에이션/실적 모멘텀 관점 요약을 작성하라.\n" +
        "필수: 강점, 약점, 밸류 부담, 관찰 포인트.\n" +
        "입력: {{input}}",
    }),
    makePresetNode("turn-stock-risk", "turn", 720, 120, {
      model: "GPT-5.3-Codex-Spark",
      role: "RISK & ACCURACY AGENT",
      cwd: ".",
      promptTemplate:
        "입력을 바탕으로 리스크와 예측 신뢰도를 점검해 JSON으로 출력하라.\n" +
        "출력 형식:\n" +
        '{ "upsideFactors":["..."], "downsideRisks":["..."], "accuracyNotes":["..."], "dataIssues":["수치 충돌/출처 누락/검증 필요 항목"] }\n' +
        "반드시 위 JSON 객체만 출력하고, 코드펜스/서론/부가설명은 금지.\n" +
        "주의: 투자 조언 단정 금지, 불확실성 명시.\n" +
        "입력: {{input}}",
    }),
    makePresetNode("turn-stock-final", "turn", 1320, 40, {
      model: "GPT-5.3-Codex",
      role: "STOCK SYNTHESIS AGENT",
      cwd: ".",
      promptTemplate:
        "사용자 질문에 직접 답하는 최종 주식/시장 전망 문서를 작성하라.\n" +
        "반드시 사용자 관점의 답변만 작성하고, 하위 에이전트 평가/점수/판정 보고는 금지한다.\n" +
        "구성:\n" +
        "1) 결론 요약(3~6문장)\n" +
        "2) 기간별 시나리오(1개월/3개월/6개월/12개월)\n" +
        "3) 핵심 근거(자금 흐름/정책/국제정세/심리/커뮤니티)\n" +
        "4) 신뢰도와 한계(불확실성, 충돌 데이터, 재검증 필요 항목)\n" +
        "5) 다음 체크포인트(관찰 지표와 트리거)\n" +
        "입력: {{input}}",
    }),
  ];

  const edges: GraphEdge[] = [
    { from: { nodeId: "turn-stock-intake", port: "out" }, to: { nodeId: "turn-stock-macro", port: "in" } },
    { from: { nodeId: "turn-stock-intake", port: "out" }, to: { nodeId: "turn-stock-company", port: "in" } },
    { from: { nodeId: "turn-stock-macro", port: "out" }, to: { nodeId: "turn-stock-risk", port: "in" } },
    { from: { nodeId: "turn-stock-company", port: "out" }, to: { nodeId: "turn-stock-risk", port: "in" } },
    { from: { nodeId: "turn-stock-intake", port: "out" }, to: { nodeId: "turn-stock-final", port: "in" } },
    { from: { nodeId: "turn-stock-macro", port: "out" }, to: { nodeId: "turn-stock-final", port: "in" } },
    { from: { nodeId: "turn-stock-company", port: "out" }, to: { nodeId: "turn-stock-final", port: "in" } },
    { from: { nodeId: "turn-stock-risk", port: "out" }, to: { nodeId: "turn-stock-final", port: "in" } },
  ];

  return { version: GRAPH_SCHEMA_VERSION, nodes, edges, knowledge: defaultKnowledgeConfig() };
}
