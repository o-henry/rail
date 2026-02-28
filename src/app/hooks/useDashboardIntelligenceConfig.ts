import { useEffect, useMemo, useState } from "react";
import {
  DASHBOARD_TOPIC_IDS,
  loadDashboardAgentConfigFromStorage,
  saveDashboardAgentConfigToStorage,
  type DashboardAgentConfigMap,
  type DashboardTopicAgentConfig,
  type DashboardTopicId,
  type DashboardTopicRunState,
} from "../../features/dashboard/intelligence";
import { TURN_MODEL_CANONICAL_PAIRS } from "../../features/workflow/domain";

function createDefaultRunStateByTopic(): Record<DashboardTopicId, DashboardTopicRunState> {
  const out = {} as Record<DashboardTopicId, DashboardTopicRunState>;
  for (const topic of DASHBOARD_TOPIC_IDS) {
    out[topic] = { running: false };
  }
  return out;
}

export function useDashboardIntelligenceConfig() {
  const [config, setConfig] = useState<DashboardAgentConfigMap>(() => loadDashboardAgentConfigFromStorage());
  const [runStateByTopic, setRunStateByTopic] = useState<Record<DashboardTopicId, DashboardTopicRunState>>(
    () => createDefaultRunStateByTopic(),
  );

  useEffect(() => {
    saveDashboardAgentConfigToStorage(config);
  }, [config]);

  const modelOptions = useMemo(
    () =>
      TURN_MODEL_CANONICAL_PAIRS.map((item) => ({
        value: item.engine,
        label: item.display,
      })),
    [],
  );

  const updateTopicConfig = (topic: DashboardTopicId, patch: Partial<DashboardTopicAgentConfig>) => {
    setConfig((prev) => ({
      ...prev,
      [topic]: {
        ...prev[topic],
        ...patch,
      },
    }));
  };

  return {
    config,
    setConfig,
    runStateByTopic,
    setRunStateByTopic,
    updateTopicConfig,
    modelOptions,
  };
}
