import type {
  ArtifactType,
  PresetKind,
  QualityProfileId,
  TurnConfig,
} from "./domain";
import type { GraphData, GraphEdge, GraphNode, KnowledgeConfig, NodeType } from "./types";

const GRAPH_SCHEMA_VERSION = 3;
const KNOWLEDGE_DEFAULT_TOP_K = 0;
const KNOWLEDGE_DEFAULT_MAX_CHARS = 2800;
const QUALITY_DEFAULT_THRESHOLD = 70;
const QUALITY_THRESHOLD_MIN = 10;
const QUALITY_THRESHOLD_MAX = 100;
const QUALITY_THRESHOLD_STEP = 10;
const PREPROCESS_NODE_SHIFT_X = 300;
const PREPROCESS_NODE_X = 120;

function defaultKnowledgeConfig(): KnowledgeConfig {
  return {
    files: [],
    topK: KNOWLEDGE_DEFAULT_TOP_K,
    maxChars: KNOWLEDGE_DEFAULT_MAX_CHARS,
  };
}

function normalizeQualityThreshold(value: unknown): number {
  const parsed = Number(value);
  const fallback = QUALITY_DEFAULT_THRESHOLD;
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  const clamped = Math.max(QUALITY_THRESHOLD_MIN, Math.min(QUALITY_THRESHOLD_MAX, safe));
  return Math.round(clamped / QUALITY_THRESHOLD_STEP) * QUALITY_THRESHOLD_STEP;
}
function makePresetNode(
  id: string,
  type: NodeType,
  x: number,
  y: number,
  config: Record<string, unknown>,
): GraphNode {
  return {
    id,
    type,
    position: { x, y },
    config,
  };
}

type PresetTurnPolicy = {
  profile: QualityProfileId;
  threshold: number;
  qualityCommandEnabled: boolean;
  qualityCommands: string;
  artifactType: ArtifactType;
};

const DEFAULT_PRESET_TURN_POLICY: PresetTurnPolicy = {
  profile: "generic",
  threshold: QUALITY_DEFAULT_THRESHOLD,
  qualityCommandEnabled: false,
  qualityCommands: "npm run build",
  artifactType: "none",
};

function resolvePresetTurnPolicy(kind: PresetKind, nodeId: string): PresetTurnPolicy {
  const key = nodeId.toLowerCase();
  if (key.includes("preprocess")) {
    return {
      ...DEFAULT_PRESET_TURN_POLICY,
      profile: "design_planning",
      threshold: 76,
      artifactType: "RequirementArtifact",
    };
  }

  if (kind === "validation") {
    if (key.includes("intake")) {
      return { ...DEFAULT_PRESET_TURN_POLICY, profile: "design_planning", threshold: 68 };
    }
    if (key.includes("search")) {
      return {
        ...DEFAULT_PRESET_TURN_POLICY,
        profile: "research_evidence",
        threshold: key.includes("-a") ? 80 : 82,
        artifactType: "EvidenceArtifact",
      };
    }
    if (key.includes("judge")) {
      return { ...DEFAULT_PRESET_TURN_POLICY, profile: "research_evidence", threshold: 87 };
    }
    if (key.includes("final")) {
      return {
        ...DEFAULT_PRESET_TURN_POLICY,
        profile: "synthesis_final",
        threshold: 79,
        artifactType: "EvidenceArtifact",
      };
    }
  }

  if (kind === "development") {
    if (key.includes("requirements")) {
      return {
        ...DEFAULT_PRESET_TURN_POLICY,
        profile: "design_planning",
        threshold: 72,
        artifactType: "RequirementArtifact",
      };
    }
    if (key.includes("architecture")) {
      return {
        ...DEFAULT_PRESET_TURN_POLICY,
        profile: "design_planning",
        threshold: 79,
        artifactType: "DesignArtifact",
      };
    }
    if (key.includes("implementation")) {
      return {
        ...DEFAULT_PRESET_TURN_POLICY,
        profile: "code_implementation",
        threshold: 84,
        qualityCommandEnabled: true,
        qualityCommands: "npm run lint\nnpm run build",
        artifactType: "TaskPlanArtifact",
      };
    }
    if (key.includes("evaluator")) {
      return { ...DEFAULT_PRESET_TURN_POLICY, profile: "synthesis_final", threshold: 86 };
    }
    if (key.includes("final")) {
      return {
        ...DEFAULT_PRESET_TURN_POLICY,
        profile: "synthesis_final",
        threshold: 82,
        artifactType: "ChangePlanArtifact",
      };
    }
  }

  if (kind === "research") {
    if (key.includes("intake")) {
      return { ...DEFAULT_PRESET_TURN_POLICY, profile: "design_planning", threshold: 70 };
    }
    if (key.includes("collector")) {
      return {
        ...DEFAULT_PRESET_TURN_POLICY,
        profile: "research_evidence",
        threshold: 80,
        artifactType: "EvidenceArtifact",
      };
    }
    if (key.includes("factcheck")) {
      return {
        ...DEFAULT_PRESET_TURN_POLICY,
        profile: "research_evidence",
        threshold: 90,
        artifactType: "EvidenceArtifact",
      };
    }
    if (key.includes("final")) {
      return {
        ...DEFAULT_PRESET_TURN_POLICY,
        profile: "synthesis_final",
        threshold: 84,
        artifactType: "EvidenceArtifact",
      };
    }
  }

  if (kind === "expert") {
    if (key.includes("intake")) {
      return { ...DEFAULT_PRESET_TURN_POLICY, profile: "design_planning", threshold: 72 };
    }
    if (key.includes("analysis")) {
      return {
        ...DEFAULT_PRESET_TURN_POLICY,
        profile: "design_planning",
        threshold: 82,
        artifactType: "DesignArtifact",
      };
    }
    if (key.includes("review")) {
      return { ...DEFAULT_PRESET_TURN_POLICY, profile: "synthesis_final", threshold: 86 };
    }
    if (key.includes("final")) {
      return {
        ...DEFAULT_PRESET_TURN_POLICY,
        profile: "synthesis_final",
        threshold: 85,
        artifactType: "ChangePlanArtifact",
      };
    }
  }

  if (kind === "unityGame") {
    if (key.includes("intake")) {
      return {
        ...DEFAULT_PRESET_TURN_POLICY,
        profile: "design_planning",
        threshold: 68,
        artifactType: "RequirementArtifact",
      };
    }
    if (key.includes("system")) {
      return {
        ...DEFAULT_PRESET_TURN_POLICY,
        profile: "design_planning",
        threshold: 81,
        artifactType: "DesignArtifact",
      };
    }
    if (key.includes("implementation")) {
      return {
        ...DEFAULT_PRESET_TURN_POLICY,
        profile: "code_implementation",
        threshold: 83,
        qualityCommandEnabled: true,
        qualityCommands: "npm run lint\nnpm run typecheck\nnpm run build",
        artifactType: "TaskPlanArtifact",
      };
    }
    if (key.includes("qa")) {
      return { ...DEFAULT_PRESET_TURN_POLICY, profile: "synthesis_final", threshold: 88 };
    }
    if (key.includes("final")) {
      return {
        ...DEFAULT_PRESET_TURN_POLICY,
        profile: "synthesis_final",
        threshold: 84,
        artifactType: "TaskPlanArtifact",
      };
    }
  }

  if (kind === "fullstack") {
    if (key.includes("intake")) {
      return {
        ...DEFAULT_PRESET_TURN_POLICY,
        profile: "design_planning",
        threshold: 72,
        artifactType: "RequirementArtifact",
      };
    }
    if (key.includes("backend")) {
      return {
        ...DEFAULT_PRESET_TURN_POLICY,
        profile: "code_implementation",
        threshold: 85,
        qualityCommandEnabled: true,
        qualityCommands: "npm run lint\nnpm run test\nnpm run build",
        artifactType: "TaskPlanArtifact",
      };
    }
    if (key.includes("frontend")) {
      return {
        ...DEFAULT_PRESET_TURN_POLICY,
        profile: "code_implementation",
        threshold: 83,
        qualityCommandEnabled: true,
        qualityCommands: "npm run lint\nnpm run test -- --runInBand\nnpm run build",
        artifactType: "TaskPlanArtifact",
      };
    }
    if (key.includes("ops")) {
      return { ...DEFAULT_PRESET_TURN_POLICY, profile: "synthesis_final", threshold: 89 };
    }
    if (key.includes("final")) {
      return {
        ...DEFAULT_PRESET_TURN_POLICY,
        profile: "synthesis_final",
        threshold: 85,
        artifactType: "ChangePlanArtifact",
      };
    }
  }

  if (kind === "creative") {
    if (key.includes("intake")) {
      return { ...DEFAULT_PRESET_TURN_POLICY, profile: "design_planning", threshold: 66 };
    }
    if (key.includes("diverge")) {
      return { ...DEFAULT_PRESET_TURN_POLICY, profile: "generic", threshold: 58 };
    }
    if (key.includes("critic")) {
      return { ...DEFAULT_PRESET_TURN_POLICY, profile: "synthesis_final", threshold: 80 };
    }
    if (key.includes("final")) {
      return {
        ...DEFAULT_PRESET_TURN_POLICY,
        profile: "synthesis_final",
        threshold: 74,
        artifactType: "TaskPlanArtifact",
      };
    }
  }

  if (kind === "newsTrend") {
    if (key.includes("intake")) {
      return { ...DEFAULT_PRESET_TURN_POLICY, profile: "design_planning", threshold: 70 };
    }
    if (key.includes("scan")) {
      return {
        ...DEFAULT_PRESET_TURN_POLICY,
        profile: "research_evidence",
        threshold: 80,
        artifactType: "EvidenceArtifact",
      };
    }
    if (key.includes("check")) {
      return {
        ...DEFAULT_PRESET_TURN_POLICY,
        profile: "research_evidence",
        threshold: 91,
        artifactType: "EvidenceArtifact",
      };
    }
    if (key.includes("final")) {
      return {
        ...DEFAULT_PRESET_TURN_POLICY,
        profile: "synthesis_final",
        threshold: 84,
        artifactType: "EvidenceArtifact",
      };
    }
  }

  return DEFAULT_PRESET_TURN_POLICY;
}

export function applyPresetTurnPolicies(kind: PresetKind, nodes: GraphNode[]): GraphNode[] {
  return nodes.map((node) => {
    if (node.type !== "turn") {
      return node;
    }
    const policy = resolvePresetTurnPolicy(kind, node.id);
    const current = node.config as TurnConfig;
    return {
      ...node,
      config: {
        ...current,
        qualityProfile: policy.profile,
        qualityThreshold: normalizeQualityThreshold(policy.threshold),
        qualityCommandEnabled: policy.qualityCommandEnabled,
        qualityCommands: policy.qualityCommands,
        artifactType: policy.artifactType,
      },
    };
  });
}

export function simplifyPresetForSimpleWorkflow(graphData: GraphData, simpleWorkflowUi: boolean): GraphData {
  if (!simpleWorkflowUi) {
    return graphData;
  }

  const turnNodes = graphData.nodes.filter((node) => node.type === "turn");
  const nodeMap = new Map(graphData.nodes.map((node) => [node.id, node] as const));
  const outgoingMap = new Map<string, string[]>();

  for (const edge of graphData.edges) {
    const fromId = edge.from.nodeId;
    const toId = edge.to.nodeId;
    const rows = outgoingMap.get(fromId) ?? [];
    rows.push(toId);
    outgoingMap.set(fromId, rows);
  }

  const edgeSet = new Set<string>();
  const nextEdges: GraphEdge[] = [];
  const pushEdge = (fromId: string, toId: string) => {
    if (fromId === toId) {
      return;
    }
    const key = `${fromId}->${toId}`;
    if (edgeSet.has(key)) {
      return;
    }
    edgeSet.add(key);
    nextEdges.push({
      from: { nodeId: fromId, port: "out" },
      to: { nodeId: toId, port: "in" },
    });
  };

  for (const source of turnNodes) {
    const queue = [...(outgoingMap.get(source.id) ?? [])];
    const visitedInternal = new Set<string>();
    while (queue.length > 0) {
      const currentId = queue.shift();
      if (!currentId || currentId === source.id) {
        continue;
      }
      const currentNode = nodeMap.get(currentId);
      if (!currentNode) {
        continue;
      }
      if (currentNode.type === "turn") {
        pushEdge(source.id, currentId);
        continue;
      }
      if (visitedInternal.has(currentId)) {
        continue;
      }
      visitedInternal.add(currentId);
      for (const nextId of outgoingMap.get(currentId) ?? []) {
        queue.push(nextId);
      }
    }
  }

  return {
    ...graphData,
    nodes: turnNodes,
    edges: nextEdges,
  };
}

function presetIntentByKind(kind: PresetKind): string {
  if (kind === "validation") return "검증 가능한 결론 도출";
  if (kind === "development") return "개발 실행 가능한 계획/구현";
  if (kind === "research") return "근거 중심 조사/분석";
  if (kind === "expert") return "전문가 수준 의사결정";
  if (kind === "unityGame") return "유니티 게임 개발 실행";
  if (kind === "fullstack") return "풀스택 제품 구현";
  if (kind === "creative") return "창의 아이디어를 실행 가능한 제안으로 전환";
  return "뉴스/트렌드 기반 판단";
}

function buildPreprocessPrompt(kind: PresetKind): string {
  const intent = presetIntentByKind(kind);
  return (
    "당신은 사용자 요구사항 전처리 전담 에이전트다.\n" +
    "목표: 사용자의 모호한 요청을 실행 가능한 브리프로 정제하고, 이후 멀티에이전트가 놓치기 쉬운 필수 요소를 강제한다.\n" +
    "중요: 원문 의도를 왜곡하지 말고, 필요한 경우 보수적 가정을 명시하라.\n" +
    "반드시 아래 JSON만 출력하라:\n" +
    "{\n" +
    '  "intent":"...",\n' +
    '  "userGoal":"...",\n' +
    '  "requiredOutputs":["..."],\n' +
    '  "constraints":["..."],\n' +
    '  "assumptions":["..."],\n' +
    '  "acceptanceCriteria":["..."],\n' +
    '  "riskChecklist":["..."],\n' +
    '  "selfValidationPlan":["정확성","완전성","실행가능성","누락여부"],\n' +
    `  "templateIntent":"${intent}"\n` +
    "}\n" +
    "질문: {{input}}"
  );
}

function prependPreprocessAgent(kind: PresetKind, graphData: GraphData): GraphData {
  const preprocessNodeId = `turn-${kind}-preprocess`;
  if (graphData.nodes.some((node) => node.id === preprocessNodeId)) {
    return graphData;
  }

  const incomingIds = new Set(graphData.edges.map((edge) => edge.to.nodeId));
  let rootNodes = graphData.nodes.filter((node) => !incomingIds.has(node.id));
  if (rootNodes.length === 0 && graphData.nodes.length > 0) {
    rootNodes = [graphData.nodes[0]];
  }

  const avgRootY =
    rootNodes.length > 0
      ? Math.round(rootNodes.reduce((sum, node) => sum + node.position.y, 0) / rootNodes.length)
      : 120;

  const preprocessNode = makePresetNode(preprocessNodeId, "turn", PREPROCESS_NODE_X, avgRootY, {
    model: "GPT-5.3-Codex",
    role: "REQUEST PREPROCESS AGENT",
    cwd: ".",
    promptTemplate: buildPreprocessPrompt(kind),
  });

  const shiftedNodes = graphData.nodes.map((node) => ({
    ...node,
    position: {
      ...node.position,
      x: node.position.x + PREPROCESS_NODE_SHIFT_X,
    },
  }));

  const preprocessEdges: GraphEdge[] = rootNodes.map((node) => ({
    from: { nodeId: preprocessNodeId, port: "out" },
    to: { nodeId: node.id, port: "in" },
  }));

  return {
    ...graphData,
    nodes: [preprocessNode, ...shiftedNodes],
    edges: [...preprocessEdges, ...graphData.edges],
  };
}

function applyRoleDisciplinePrompt(graphData: GraphData): GraphData {
  return {
    ...graphData,
    nodes: graphData.nodes.map((node) => {
      if (node.type !== "turn") {
        return node;
      }
      const config = node.config as TurnConfig;
      const role = String(config.role ?? "SPECIALIST AGENT").trim() || "SPECIALIST AGENT";
      const body = String(config.promptTemplate ?? "{{input}}").trim() || "{{input}}";
      if (body.includes("__ROLE_DISCIPLINE__")) {
        return node;
      }

      const discipline =
        "__ROLE_DISCIPLINE__\n" +
        `당신은 ${role} 역할이다.\n` +
        "역할 규율:\n" +
        "1) 담당 범위 외 결론/판정/구현을 임의 확정하지 않는다.\n" +
        "2) 입력이 불완전하면 치명적 누락 항목을 먼저 드러내고 보수적 가정을 명시한다.\n" +
        "3) 산출 전 자기검증(정확성/완전성/실행가능성/근거충분성)을 수행한다.\n" +
        "4) 출력은 다음 에이전트가 재사용 가능한 구조로 작성한다.\n";

      return {
        ...node,
        config: {
          ...config,
          promptTemplate: `${discipline}\n${body}`,
        },
      };
    }),
  };
}

function buildValidationPreset(): GraphData {
  const nodes: GraphNode[] = [
    makePresetNode("turn-intake", "turn", 120, 120, {
      model: "GPT-5.1-Codex-Mini",
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

function buildDevelopmentPreset(): GraphData {
  const nodes: GraphNode[] = [
    makePresetNode("turn-requirements", "turn", 120, 120, {
      model: "GPT-5.1-Codex-Mini",
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

function buildResearchPreset(): GraphData {
  const nodes: GraphNode[] = [
    makePresetNode("turn-research-intake", "turn", 120, 120, {
      model: "GPT-5.1-Codex-Mini",
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

function buildExpertPreset(): GraphData {
  const nodes: GraphNode[] = [
    makePresetNode("turn-expert-intake", "turn", 120, 120, {
      model: "GPT-5.1-Codex-Mini",
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

function buildUnityGamePreset(): GraphData {
  const nodes: GraphNode[] = [
    makePresetNode("turn-unity-intake", "turn", 120, 120, {
      model: "GPT-5.1-Codex-Mini",
      role: "UNITY CONCEPT AGENT",
      cwd: ".",
      promptTemplate:
        "입력 요청을 유니티 게임 기획 브리프로 구조화하라.\n" +
        '{ "genre":"...", "coreLoop":"...", "targetPlatform":["..."], "scope":"MVP", "mustHave":["..."] }\n' +
        "입력: {{input}}",
    }),
    makePresetNode("turn-unity-system", "turn", 420, 40, {
      model: "GPT-5.2-Codex",
      role: "UNITY SYSTEM DESIGN AGENT",
      cwd: ".",
      promptTemplate:
        "유니티 시스템 설계안을 작성하라.\n" +
        "필수: 씬 구조, 게임 상태 관리, 입력 시스템, 데이터 저장 전략.\n" +
        "출력은 JSON 우선.\n" +
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

function buildFullstackPreset(): GraphData {
  const nodes: GraphNode[] = [
    makePresetNode("turn-fullstack-intake", "turn", 120, 120, {
      model: "GPT-5.1-Codex-Mini",
      role: "PRODUCT SPEC AGENT",
      cwd: ".",
      promptTemplate:
        "요청을 풀스택 제품 명세로 구조화하라.\n" +
        '{ "personas":["..."], "features":["..."], "nonFunctional":["..."], "mvpScope":["..."] }\n' +
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

function buildCreativePreset(): GraphData {
  const nodes: GraphNode[] = [
    makePresetNode("turn-creative-intake", "turn", 120, 120, {
      model: "GPT-5.1-Codex-Mini",
      role: "PROBLEM REFRAME AGENT",
      cwd: ".",
      promptTemplate:
        "입력 문제를 창의 탐색용으로 재정의하라.\n" +
        '{ "coreProblem":"...", "hiddenConstraints":["..."], "challengeStatement":"..." }\n' +
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

function buildNewsTrendPreset(): GraphData {
  const nodes: GraphNode[] = [
    makePresetNode("turn-news-intake", "turn", 120, 120, {
      model: "GPT-5.1-Codex-Mini",
      role: "NEWS BRIEF AGENT",
      cwd: ".",
      promptTemplate:
        "질문을 최신 뉴스/트렌드 조사 쿼리로 분해하라.\n" +
        '{ "timeWindow":"최근 7일 또는 30일", "queries":["..."], "mustVerify":["..."] }\n' +
        "입력: {{input}}",
    }),
    makePresetNode("turn-news-scan-a", "turn", 420, 40, {
      executor: "web_gemini",
      webResultMode: "bridgeAssisted",
      webTimeoutMs: 120000,
      model: "GPT-5.2",
      role: "WEB NEWS SCAN AGENT A",
      cwd: ".",
      promptTemplate:
        "최신 뉴스 관점으로 핵심 이슈 5개를 수집하고 날짜/출처/핵심포인트를 요약해줘.\n입력: {{input}}",
    }),
    makePresetNode("turn-news-scan-b", "turn", 420, 220, {
      executor: "web_gemini",
      webResultMode: "bridgeAssisted",
      webTimeoutMs: 120000,
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

export function buildPresetGraphByKind(kind: PresetKind): GraphData {
  let base: GraphData;
  if (kind === "validation") {
    base = buildValidationPreset();
  } else if (kind === "development") {
    base = buildDevelopmentPreset();
  } else if (kind === "research") {
    base = buildResearchPreset();
  } else if (kind === "unityGame") {
    base = buildUnityGamePreset();
  } else if (kind === "fullstack") {
    base = buildFullstackPreset();
  } else if (kind === "creative") {
    base = buildCreativePreset();
  } else if (kind === "newsTrend") {
    base = buildNewsTrendPreset();
  } else {
    base = buildExpertPreset();
  }
  const withPreprocess = prependPreprocessAgent(kind, base);
  return applyRoleDisciplinePrompt(withPreprocess);
}
