import type { GraphData, GraphEdge, GraphNode } from "../types";
import { GRAPH_SCHEMA_VERSION, defaultKnowledgeConfig, makePresetNode } from "./shared";

export function buildValidationPreset(): GraphData {
  const nodes: GraphNode[] = [
    makePresetNode("turn-intake", "turn", 120, 120, {
      model: "GPT-5.3-Codex-Spark",
      role: "PLANNING AGENT",
      cwd: ".",
      promptTemplate:
        "당신은 검증 설계 에이전트다. 아래 질문을 분석해 검증 계획 JSON만 출력하라.\n" +
        "출력 형식:\n" +
        "{\n" +
        '  "question":"...",\n' +
        '  "goal":"...",\n' +
        '  "checkpoints":["...","...","..."],\n' +
        '  "searchQueries":["...","...","..."]\n' +
        "}\n" +
        "질문: {{input}}",
    }),
    makePresetNode("turn-search-a", "turn", 420, 40, {
      model: "GPT-5.2",
      role: "SEARCH AGENT A",
      cwd: ".",
      promptTemplate:
        "아래 입력에서 주장에 유리한 근거를 찾아 JSON으로 정리하라.\n" +
        "출력 형식:\n" +
        '{ "evidences":[{"claim":"...","evidence":"...","sourceHint":"...","confidence":0.0}] }\n' +
        "조건: 근거가 약하면 confidence를 낮게 주고 추정이라고 표시.\n" +
        "입력: {{input}}",
    }),
    makePresetNode("turn-search-b", "turn", 420, 220, {
      model: "GPT-5.2-Codex",
      role: "SEARCH AGENT B",
      cwd: ".",
      promptTemplate:
        "아래 입력에서 반례/한계/위험요인을 찾아 JSON으로 정리하라.\n" +
        "출력 형식:\n" +
        '{ "risks":[{"point":"...","why":"...","confidence":0.0,"mitigation":"..."}] }\n' +
        "조건: 모호하면 모호하다고 명시.\n" +
        "입력: {{input}}",
    }),
    makePresetNode("turn-judge", "turn", 720, 120, {
      model: "GPT-5.3-Codex",
      role: "EVALUATION AGENT",
      cwd: ".",
      promptTemplate:
        "입력을 종합 평가해 JSON만 출력하라.\n" +
        "출력 형식:\n" +
        '{ "DECISION":"PASS|REJECT", "finalDraft":"...", "why":["...","..."], "gaps":["..."], "confidence":0.0 }\n' +
        "판정 기준: 근거 일관성, 반례 대응 가능성, 불확실성 명시 여부.\n" +
        "입력: {{input}}",
    }),
    makePresetNode("gate-decision", "gate", 1020, 120, {
      decisionPath: "DECISION",
      passNodeId: "turn-final",
      rejectNodeId: "transform-reject",
      schemaJson: "{\"type\":\"object\",\"required\":[\"DECISION\"]}",
    }),
    makePresetNode("turn-final", "turn", 1320, 40, {
      model: "GPT-5.3-Codex",
      role: "SYNTHESIS AGENT",
      cwd: ".",
      promptTemplate:
        "아래 입력을 바탕으로 최종 답변을 한국어로 작성하라.\n" +
        "규칙:\n" +
        "1) 핵심 결론 먼저\n" +
        "2) 근거 3~5개\n" +
        "3) 한계/불확실성 분리\n" +
        "4) 바로 실행 가능한 다음 단계 제시\n" +
        "입력: {{input}}",
    }),
    makePresetNode("transform-reject", "transform", 1320, 220, {
      mode: "template",
      template: "검증 결과 REJECT. 추가 조사 필요. 원본: {{input}}",
    }),
  ];

  const edges: GraphEdge[] = [
    { from: { nodeId: "turn-intake", port: "out" }, to: { nodeId: "turn-search-a", port: "in" } },
    { from: { nodeId: "turn-intake", port: "out" }, to: { nodeId: "turn-search-b", port: "in" } },
    { from: { nodeId: "turn-search-a", port: "out" }, to: { nodeId: "turn-judge", port: "in" } },
    { from: { nodeId: "turn-search-b", port: "out" }, to: { nodeId: "turn-judge", port: "in" } },
    { from: { nodeId: "turn-judge", port: "out" }, to: { nodeId: "gate-decision", port: "in" } },
    { from: { nodeId: "gate-decision", port: "out" }, to: { nodeId: "turn-final", port: "in" } },
    { from: { nodeId: "gate-decision", port: "out" }, to: { nodeId: "transform-reject", port: "in" } },
  ];

  return { version: GRAPH_SCHEMA_VERSION, nodes, edges, knowledge: defaultKnowledgeConfig() };
}

export function buildDevelopmentPreset(): GraphData {
  const nodes: GraphNode[] = [
    makePresetNode("turn-requirements", "turn", 120, 120, {
      model: "GPT-5.3-Codex-Spark",
      role: "REQUIREMENTS AGENT",
      cwd: ".",
      promptTemplate:
        "아래 요청을 분석해 요구사항 JSON만 출력하라.\n" +
        '{ "functional":["..."], "nonFunctional":["..."], "constraints":["..."], "priority":["P0","P1","P2"] }\n' +
        "질문: {{input}}",
    }),
    makePresetNode("turn-architecture", "turn", 420, 40, {
      model: "GPT-5.2",
      role: "ARCHITECTURE AGENT",
      cwd: ".",
      promptTemplate:
        "입력을 바탕으로 현실적인 시스템 설계를 JSON으로 제안하라.\n" +
        '{ "architecture":"...", "components":[...], "tradeoffs":[...], "risks":[...], "decisionLog":[...] }\n' +
        "과설계 금지, MVP 우선.\n" +
        "입력: {{input}}",
    }),
    makePresetNode("turn-implementation", "turn", 420, 220, {
      model: "GPT-5.2-Codex",
      role: "IMPLEMENTATION AGENT",
      cwd: ".",
      promptTemplate:
        "입력을 기반으로 구현 계획을 단계별로 작성하라.\n" +
        "필수: 파일 단위 변경 목록, 테스트 계획, 실패 시 롤백 포인트.\n" +
        "입력: {{input}}",
    }),
    makePresetNode("turn-evaluator", "turn", 720, 120, {
      model: "GPT-5.3-Codex",
      role: "QUALITY AGENT",
      cwd: ".",
      promptTemplate:
        "입력을 리뷰해 품질 판정을 JSON으로 출력하라.\n" +
        '{ "DECISION":"PASS|REJECT", "finalDraft":"...", "risk":["..."], "blockingIssues":["..."] }\n' +
        "입력: {{input}}",
    }),
    makePresetNode("gate-quality", "gate", 1020, 120, {
      decisionPath: "DECISION",
      passNodeId: "turn-final-dev",
      rejectNodeId: "transform-rework",
      schemaJson: "{\"type\":\"object\",\"required\":[\"DECISION\"]}",
    }),
    makePresetNode("turn-final-dev", "turn", 1320, 40, {
      model: "GPT-5.3-Codex",
      role: "DEV SYNTHESIS AGENT",
      cwd: ".",
      promptTemplate:
        "아래 입력으로 최종 개발 가이드를 작성하라.\n" +
        "구성: 구현 순서, 코드 품질 기준, 테스트 명세, 배포 체크리스트, 운영 리스크 대응.\n" +
        "입력: {{input}}",
    }),
    makePresetNode("transform-rework", "transform", 1320, 220, {
      mode: "template",
      template: "REJECT - requirements/architecture 재검토 필요. 입력: {{input}}",
    }),
  ];

  const edges: GraphEdge[] = [
    {
      from: { nodeId: "turn-requirements", port: "out" },
      to: { nodeId: "turn-architecture", port: "in" },
    },
    {
      from: { nodeId: "turn-requirements", port: "out" },
      to: { nodeId: "turn-implementation", port: "in" },
    },
    {
      from: { nodeId: "turn-architecture", port: "out" },
      to: { nodeId: "turn-evaluator", port: "in" },
    },
    {
      from: { nodeId: "turn-implementation", port: "out" },
      to: { nodeId: "turn-evaluator", port: "in" },
    },
    {
      from: { nodeId: "turn-evaluator", port: "out" },
      to: { nodeId: "gate-quality", port: "in" },
    },
    {
      from: { nodeId: "gate-quality", port: "out" },
      to: { nodeId: "turn-final-dev", port: "in" },
    },
    {
      from: { nodeId: "gate-quality", port: "out" },
      to: { nodeId: "transform-rework", port: "in" },
    },
  ];

  return { version: GRAPH_SCHEMA_VERSION, nodes, edges, knowledge: defaultKnowledgeConfig() };
}

export function buildResearchPreset(): GraphData {
  const nodes: GraphNode[] = [
    makePresetNode("turn-research-intake", "turn", 120, 120, {
      model: "GPT-5.3-Codex-Spark",
      role: "RESEARCH PLANNING AGENT",
      cwd: ".",
      promptTemplate:
        "질문을 조사 계획으로 분해해 JSON만 출력하라.\n" +
        '{ "researchGoal":"...", "questions":["..."], "evidenceCriteria":["..."], "riskChecks":["..."] }\n' +
        "질문: {{input}}",
    }),
    makePresetNode("turn-research-collector", "turn", 420, 120, {
      model: "GPT-5.2",
      role: "SOURCE COLLECTION AGENT",
      cwd: ".",
      promptTemplate:
        "입력 기준으로 핵심 근거 후보를 수집해 JSON으로 정리하라.\n" +
        '{ "evidences":[{"id":"E1","statement":"...","whyRelevant":"...","confidence":0.0}] }\n' +
        "입력: {{input}}",
    }),
    makePresetNode("turn-research-factcheck", "turn", 720, 120, {
      model: "GPT-5.2-Codex",
      role: "FACT CHECK AGENT",
      cwd: ".",
      promptTemplate:
        "수집 근거를 검증하고 JSON으로 출력하라.\n" +
        '{ "verified":["E1"], "contested":["E2"], "missing":["..."], "notes":["..."] }\n' +
        "입력: {{input}}",
    }),
    makePresetNode("transform-research-brief", "transform", 1020, 120, {
      mode: "template",
      template:
        "자료조사 요약\n- 핵심 사실: {{input}}\n- 검증 포인트: 신뢰도, 최신성, 반례 존재 여부\n- 최종 답변 작성 전 누락 항목 점검",
    }),
    makePresetNode("turn-research-final", "turn", 1320, 120, {
      model: "GPT-5.3-Codex",
      role: "RESEARCH SYNTHESIS AGENT",
      cwd: ".",
      promptTemplate:
        "근거 중심 최종 답변을 한국어로 작성하라.\n" +
        "규칙: 주장 옆에 근거 ID(E1, E2) 표시, 불확실성 분리, 과장 금지.\n" +
        "입력: {{input}}",
    }),
  ];

  const edges: GraphEdge[] = [
    {
      from: { nodeId: "turn-research-intake", port: "out" },
      to: { nodeId: "turn-research-collector", port: "in" },
    },
    {
      from: { nodeId: "turn-research-collector", port: "out" },
      to: { nodeId: "turn-research-factcheck", port: "in" },
    },
    {
      from: { nodeId: "turn-research-factcheck", port: "out" },
      to: { nodeId: "transform-research-brief", port: "in" },
    },
    {
      from: { nodeId: "transform-research-brief", port: "out" },
      to: { nodeId: "turn-research-final", port: "in" },
    },
  ];

  return { version: GRAPH_SCHEMA_VERSION, nodes, edges, knowledge: defaultKnowledgeConfig() };
}

export function buildExpertPreset(): GraphData {
  const nodes: GraphNode[] = [
    makePresetNode("turn-expert-intake", "turn", 120, 120, {
      model: "GPT-5.3-Codex-Spark",
      role: "DOMAIN INTAKE AGENT",
      cwd: ".",
      promptTemplate:
        "질문을 전문가 분석용 브리프로 구조화하라.\n" +
        '{ "domain":"...", "objective":"...", "constraints":["..."], "successCriteria":["..."] }\n' +
        "입력: {{input}}",
    }),
    makePresetNode("turn-expert-analysis", "turn", 420, 40, {
      model: "GPT-5.2-Codex",
      role: "DOMAIN EXPERT AGENT",
      cwd: ".",
      promptTemplate:
        "도메인 전문가 관점의 해결 전략을 작성하라.\n" +
        "필수: 핵심 원리, 실제 적용 절차, 실패 조건, 대안 전략.\n" +
        "입력: {{input}}",
    }),
    makePresetNode("turn-expert-review", "turn", 420, 220, {
      model: "GPT-5.2",
      role: "PEER REVIEW AGENT",
      cwd: ".",
      promptTemplate:
        "전략의 취약점과 반례를 엄격히 리뷰해 JSON으로 출력하라.\n" +
        '{ "DECISION":"PASS|REJECT", "criticalIssues":["..."], "improvements":["..."] }\n' +
        "입력: {{input}}",
    }),
    makePresetNode("gate-expert", "gate", 720, 120, {
      decisionPath: "DECISION",
      passNodeId: "turn-expert-final",
      rejectNodeId: "transform-expert-rework",
      schemaJson: "{\"type\":\"object\",\"required\":[\"DECISION\"]}",
    }),
    makePresetNode("turn-expert-final", "turn", 1020, 40, {
      model: "GPT-5.3-Codex",
      role: "EXPERT SYNTHESIS AGENT",
      cwd: ".",
      promptTemplate:
        "최종 전문가 답변을 작성하라.\n" +
        "구성: 핵심 결론, 단계별 실행안, 검증 체크리스트, 실패 시 대체안.\n" +
        "입력: {{input}}",
    }),
    makePresetNode("transform-expert-rework", "transform", 1020, 220, {
      mode: "template",
      template: "REJECT. 전문가 전략을 보완해야 합니다. 보완 항목 목록을 작성하세요. 원문: {{input}}",
    }),
  ];

  const edges: GraphEdge[] = [
    { from: { nodeId: "turn-expert-intake", port: "out" }, to: { nodeId: "turn-expert-analysis", port: "in" } },
    { from: { nodeId: "turn-expert-intake", port: "out" }, to: { nodeId: "turn-expert-review", port: "in" } },
    { from: { nodeId: "turn-expert-analysis", port: "out" }, to: { nodeId: "gate-expert", port: "in" } },
    { from: { nodeId: "turn-expert-review", port: "out" }, to: { nodeId: "gate-expert", port: "in" } },
    { from: { nodeId: "gate-expert", port: "out" }, to: { nodeId: "turn-expert-final", port: "in" } },
    { from: { nodeId: "gate-expert", port: "out" }, to: { nodeId: "transform-expert-rework", port: "in" } },
  ];

  return { version: GRAPH_SCHEMA_VERSION, nodes, edges, knowledge: defaultKnowledgeConfig() };
}
