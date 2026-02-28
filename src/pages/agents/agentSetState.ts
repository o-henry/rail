import { DASHBOARD_TOPIC_IDS } from "../../features/dashboard/intelligence";
import { BASE_AGENT_SET_OPTIONS } from "./agentOptions";
import { buildAgentSetPreset, type AgentThreadPreset } from "./agentSetPresets";
import type {
  AgentSetGroup,
  AgentSetOption,
  AgentSetPresetSnapshot,
  AgentSetState,
  AgentThread,
} from "./agentTypes";

export const AGENT_SET_DASHBOARD_DATA_STORAGE_KEY = "RAIL_AGENT_SET_DASHBOARD_DATA_V1";

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function toSeedThread(thread: AgentThreadPreset): AgentThread {
  return {
    ...thread,
    status: "preset",
  };
}

export function createCustomThread(name: string): AgentThread {
  return {
    id: name,
    name,
    role: "Custom Agent",
    guidance: ["사용자 정의 작업을 수행합니다.", "필요 시 세트 미션을 참고해 실행합니다."],
    starterPrompt: "현재 입력을 기준으로 작업을 수행합니다.",
    status: "custom",
  };
}

export function createFallbackSetState(): AgentSetState {
  const fallbackThread = createCustomThread("agent-1");
  return {
    setMission: "세트 미션이 아직 구성되지 않았습니다.",
    threads: [fallbackThread],
    activeThreadId: fallbackThread.id,
    draft: "",
    attachedFiles: [],
    dashboardInsights: [],
  };
}

export function buildPresetSnapshot(option: AgentSetOption): AgentSetPresetSnapshot {
  const preset = buildAgentSetPreset(option);
  const threads = preset.threads.map((thread) => toSeedThread(thread));
  const fallbackThread = threads[0] ?? createCustomThread("agent-1");
  return {
    mission: preset.mission,
    defaultDraft: preset.defaultDraft,
    threads: threads.length > 0 ? threads : [fallbackThread],
  };
}

export function createStateFromPresetSnapshot(snapshot: AgentSetPresetSnapshot): AgentSetState {
  return {
    setMission: snapshot.mission,
    threads: snapshot.threads,
    activeThreadId: snapshot.threads[0]?.id ?? "agent-1",
    draft: snapshot.defaultDraft,
    attachedFiles: [],
    dashboardInsights: [],
  };
}

export function restoreSetStateFromPreset(
  current: AgentSetState,
  snapshot: AgentSetPresetSnapshot,
): AgentSetState {
  const restored = createStateFromPresetSnapshot(snapshot);
  return {
    ...restored,
    dashboardInsights: current.dashboardInsights,
  };
}

export function createInitialSetStateMap(
  setOptions: AgentSetOption[],
  setPresetById: Record<string, AgentSetPresetSnapshot>,
): Record<string, AgentSetState> {
  return Object.fromEntries(
    setOptions.map((setOption) => {
      const preset = setPresetById[setOption.id];
      return [setOption.id, preset ? createStateFromPresetSnapshot(preset) : createFallbackSetState()];
    }),
  ) as Record<string, AgentSetState>;
}

export function buildSetOptions(t: (key: string) => string): AgentSetOption[] {
  const dataSetOptions = DASHBOARD_TOPIC_IDS.map((topic) => ({
    id: `data-${topic}`,
    label: `${t(`dashboard.widget.${topic}.title`)} 세트`,
    description: "데이터 주제 기반 분석/실행 에이전트 세트",
  }));
  const byId = new Map<string, AgentSetOption>();
  const byContentKey = new Set<string>();
  [...BASE_AGENT_SET_OPTIONS, ...dataSetOptions].forEach((option) => {
    const contentKey = `${normalizeText(option.label)}::${normalizeText(option.description)}`;
    if (byContentKey.has(contentKey)) {
      return;
    }
    if (!byId.has(option.id)) {
      byContentKey.add(contentKey);
      byId.set(option.id, option);
    }
  });
  return Array.from(byId.values());
}

export function buildSetOrderIndexById(setOptions: AgentSetOption[]): Record<string, number> {
  return setOptions.reduce<Record<string, number>>((acc, option, index) => {
    acc[option.id] = index;
    return acc;
  }, {});
}

export function isDevSetOption(option: AgentSetOption): boolean {
  const normalizedId = normalizeText(option.id);
  const normalizedLabel = normalizeText(option.label);
  return normalizedId.includes("dev") || normalizedLabel.includes("개발");
}

export function buildGroupedSetOptions(setOptions: AgentSetOption[]): AgentSetGroup[] {
  return [
    {
      id: "general",
      title: "일반",
      items: setOptions.filter((option) => !isDevSetOption(option)),
    },
    {
      id: "dev",
      title: "개발 전용",
      items: setOptions.filter((option) => isDevSetOption(option)),
    },
  ].filter((group) => group.items.length > 0);
}

export function mergeRowPreview(description: string, snapshotLine: string): string {
  const desc = String(description ?? "").trim();
  const snap = String(snapshotLine ?? "").trim();
  if (!desc && !snap) {
    return "no snapshot";
  }
  if (!desc) {
    return snap;
  }
  if (!snap) {
    return desc;
  }
  const normalizedDesc = normalizeText(desc);
  const normalizedSnap = normalizeText(snap);
  if (normalizedSnap.includes(normalizedDesc)) {
    return snap;
  }
  if (normalizedDesc.includes(normalizedSnap)) {
    return desc;
  }
  return `${desc} · ${snap}`;
}
