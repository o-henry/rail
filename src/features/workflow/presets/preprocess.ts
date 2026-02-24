import type { PresetKind } from "../domain";
import type { GraphData, GraphEdge } from "../types";
import { PREPROCESS_NODE_SHIFT_X, PREPROCESS_NODE_X, makePresetNode } from "./shared";

export function presetIntentByKind(kind: PresetKind): string {
  if (kind === "validation") return "검증 가능한 결론 도출";
  if (kind === "development") return "개발 실행 가능한 계획/구현";
  if (kind === "research") return "근거 중심 조사/분석";
  if (kind === "expert") return "전문가 수준 의사결정";
  if (kind === "unityGame") return "유니티 게임 개발 실행";
  if (kind === "fullstack") return "풀스택 제품 구현";
  if (kind === "creative") return "창의 아이디어를 실행 가능한 제안으로 전환";
  if (kind === "stock") return "주식/시장 분석 기반 투자 판단 지원";
  return "뉴스/트렌드 기반 판단";
}

export function buildPreprocessPrompt(kind: PresetKind): string {
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

export function prependPreprocessAgent(kind: PresetKind, graphData: GraphData): GraphData {
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

