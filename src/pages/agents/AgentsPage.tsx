import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import type { DashboardTopicSnapshot } from "../../features/dashboard/intelligence";
import { useI18n } from "../../i18n";
import { AGENT_MODEL_OPTIONS, AGENT_REASON_LEVEL_OPTIONS } from "./agentOptions";
import { AgentSetIndexView } from "./AgentSetIndexView";
import { AgentsWorkspaceView } from "./AgentsWorkspaceView";
import { buildAgentDispatchPayload } from "./agentPrompt";
import {
  AGENT_SET_DASHBOARD_DATA_STORAGE_KEY,
  buildGroupedSetOptions,
  buildPresetSnapshot,
  buildSetOptions,
  buildSetOrderIndexById,
  createCustomThread,
  createFallbackSetState,
  createInitialSetStateMap,
  createStateFromPresetSnapshot,
} from "./agentSetState";
import type { AgentSetPresetSnapshot, AgentSetState, AgentsPageProps, AttachedFile } from "./agentTypes";

export default function AgentsPage({ onQuickAction, topicSnapshots, codexMultiAgentMode }: AgentsPageProps) {
  const { t } = useI18n();
  const setOptions = useMemo(() => buildSetOptions((key) => t(key)), [t]);
  const setPresetById = useMemo<Record<string, AgentSetPresetSnapshot>>(
    () =>
      setOptions.reduce<Record<string, AgentSetPresetSnapshot>>((acc, option) => {
        acc[option.id] = buildPresetSnapshot(option);
        return acc;
      }, {}),
    [setOptions],
  );

  const [activeSetId, setActiveSetId] = useState<string | null>(null);
  const [setStateMap, setSetStateMap] = useState<Record<string, AgentSetState>>(() =>
    createInitialSetStateMap(setOptions, setPresetById),
  );
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [isReasonMenuOpen, setIsReasonMenuOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState("5.3-Codex");
  const [selectedReasonLevel, setSelectedReasonLevel] = useState("보통");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const reasonMenuRef = useRef<HTMLDivElement | null>(null);

  const modelOptions = useMemo(() => AGENT_MODEL_OPTIONS, []);
  const reasonLevelOptions = useMemo(() => AGENT_REASON_LEVEL_OPTIONS, []);
  const selectedModelOption = useMemo(
    () => modelOptions.find((option) => option.value === selectedModel) ?? modelOptions[0],
    [modelOptions, selectedModel],
  );
  const isReasonLevelSelectable = selectedModelOption?.allowsReasonLevel !== false;

  const setOrderIndexById = useMemo(() => buildSetOrderIndexById(setOptions), [setOptions]);
  const groupedSetOptions = useMemo(() => buildGroupedSetOptions(setOptions), [setOptions]);

  useEffect(() => {
    setSetStateMap((prev) => {
      const next = { ...prev };
      for (const setOption of setOptions) {
        if (!next[setOption.id]) {
          const preset = setPresetById[setOption.id];
          next[setOption.id] = preset ? createStateFromPresetSnapshot(preset) : createFallbackSetState();
        }
      }
      return next;
    });
  }, [setOptions, setPresetById]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const raw = window.localStorage.getItem(AGENT_SET_DASHBOARD_DATA_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as Record<string, string[]>;
      setSetStateMap((prev) => {
        const next = { ...prev };
        for (const setOption of setOptions) {
          const saved = parsed[setOption.id];
          if (Array.isArray(saved)) {
            const current = next[setOption.id] ?? createFallbackSetState();
            next[setOption.id] = {
              ...current,
              dashboardInsights: saved
                .map((item) => String(item ?? "").trim())
                .filter((item) => item.length > 0)
                .slice(0, 7),
            };
          }
        }
        return next;
      });
    } catch {
      // ignore invalid local storage
    }
  }, [setOptions]);

  useEffect(() => {
    const snapshots = Object.values(topicSnapshots)
      .filter((snapshot): snapshot is DashboardTopicSnapshot => Boolean(snapshot))
      .sort((left, right) => new Date(right.generatedAt).getTime() - new Date(left.generatedAt).getTime())
      .slice(0, 7)
      .map((snapshot) => `${snapshot.topic}: ${snapshot.summary}`);
    if (snapshots.length === 0) {
      return;
    }

    setSetStateMap((prev) => {
      const next = { ...prev };
      for (const setOption of setOptions) {
        const current = next[setOption.id] ?? createFallbackSetState();
        next[setOption.id] = {
          ...current,
          dashboardInsights: snapshots,
        };
      }
      if (typeof window !== "undefined") {
        try {
          const toStore: Record<string, string[]> = {};
          for (const setOption of setOptions) {
            toStore[setOption.id] = next[setOption.id]?.dashboardInsights ?? [];
          }
          window.localStorage.setItem(AGENT_SET_DASHBOARD_DATA_STORAGE_KEY, JSON.stringify(toStore));
        } catch {
          // ignore local storage failures
        }
      }
      return next;
    });
  }, [setOptions, topicSnapshots]);

  const currentSetState = useMemo(() => {
    if (!activeSetId) {
      return null;
    }
    return setStateMap[activeSetId] ?? createFallbackSetState();
  }, [activeSetId, setStateMap]);

  const activeSetOption = useMemo(
    () => (activeSetId ? setOptions.find((option) => option.id === activeSetId) ?? null : null),
    [activeSetId, setOptions],
  );

  const threads = currentSetState?.threads ?? [];
  const activeThreadId = currentSetState?.activeThreadId ?? "";
  const draft = currentSetState?.draft ?? "";
  const attachedFiles = currentSetState?.attachedFiles ?? [];
  const setMission = currentSetState?.setMission ?? "";
  const dashboardInsights = currentSetState?.dashboardInsights ?? [];

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) ?? threads[0] ?? null,
    [activeThreadId, threads],
  );

  const updateActiveSetState = (updater: (current: AgentSetState) => AgentSetState) => {
    if (!activeSetId) {
      return;
    }
    setSetStateMap((prev) => {
      const current = prev[activeSetId] ?? createFallbackSetState();
      return {
        ...prev,
        [activeSetId]: updater(current),
      };
    });
  };

  useEffect(() => {
    if (!modelOptions.some((option) => option.value === selectedModel)) {
      setSelectedModel(modelOptions[0].value);
    }
  }, [modelOptions, selectedModel]);

  useEffect(() => {
    if (isReasonLevelSelectable) {
      return;
    }
    setIsReasonMenuOpen(false);
  }, [isReasonLevelSelectable]);

  useEffect(() => {
    if (!isModelMenuOpen && !isReasonMenuOpen) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!modelMenuRef.current?.contains(event.target as Node)) {
        setIsModelMenuOpen(false);
      }
      if (!reasonMenuRef.current?.contains(event.target as Node)) {
        setIsReasonMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [isModelMenuOpen, isReasonMenuOpen]);

  const onSelectSet = (setId: string) => {
    setActiveSetId(setId);
    setIsModelMenuOpen(false);
    setIsReasonMenuOpen(false);
  };

  const onBackToSetList = () => {
    setActiveSetId(null);
    setIsModelMenuOpen(false);
    setIsReasonMenuOpen(false);
  };

  const onAddThread = () => {
    updateActiveSetState((current) => {
      const nextIndex =
        current.threads.reduce((max, thread) => {
          const byName = /^agent-(\d+)$/.exec(thread.name)?.[1];
          const byId = /^agent-(\d+)$/.exec(thread.id)?.[1];
          const parsed = Number(byName ?? byId ?? 0);
          return Number.isFinite(parsed) ? Math.max(max, parsed) : max;
        }, 0) + 1;
      const nextLabel = `agent-${nextIndex}`;
      const nextThread = createCustomThread(nextLabel);
      return {
        ...current,
        threads: [...current.threads, nextThread],
        activeThreadId: nextThread.id,
      };
    });
  };

  const onCloseThread = (threadId: string) => {
    updateActiveSetState((current) => {
      const filtered = current.threads.filter((thread) => thread.id !== threadId);
      const nextThreads = filtered.length > 0 ? filtered : [createCustomThread("agent-1")];
      const nextActive = nextThreads.some((thread) => thread.id === current.activeThreadId)
        ? current.activeThreadId
        : nextThreads[0].id;
      return {
        ...current,
        threads: nextThreads,
        activeThreadId: nextActive,
      };
    });
  };

  const onSetActiveThreadId = (threadId: string) => {
    updateActiveSetState((current) => ({
      ...current,
      activeThreadId: threadId,
    }));
  };

  const onSetDraft = (value: string) => {
    updateActiveSetState((current) => ({
      ...current,
      draft: value,
    }));
  };

  const onQueuePrompt = (prompt: string) => {
    const next = String(prompt ?? "").trim();
    if (!next) {
      return;
    }
    updateActiveSetState((current) => ({
      ...current,
      draft: current.draft.trim().length > 0 ? `${current.draft.trim()}\n${next}` : next,
    }));
  };

  const onSend = () => {
    const text = draft.trim();
    if (!text && attachedFiles.length === 0) {
      return;
    }
    const payload = buildAgentDispatchPayload({
      threadName: activeThread?.name,
      threadRole: activeThread?.role,
      threadGuidance: activeThread?.guidance ?? [],
      threadStarterPrompt: activeThread?.starterPrompt,
      selectedModel,
      selectedReasonLevel,
      isReasonLevelSelectable,
      text,
      attachedFileNames: attachedFiles.map((file) => file.name),
      codexMultiAgentMode,
    });
    onQuickAction(payload);
    updateActiveSetState((current) => ({
      ...current,
      draft: "",
      attachedFiles: [],
    }));
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const onOpenFilePicker = () => {
    fileInputRef.current?.click();
  };

  const onAttachFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }
    const nextFiles: AttachedFile[] = Array.from(files).map((file, index) => ({
      id: `${file.name}-${index}-${Date.now()}`,
      name: file.name,
    }));

    updateActiveSetState((current) => {
      const seen = new Set(current.attachedFiles.map((file) => file.name));
      const merged = [...current.attachedFiles];
      nextFiles.forEach((file) => {
        if (!seen.has(file.name)) {
          seen.add(file.name);
          merged.push(file);
        }
      });
      return {
        ...current,
        attachedFiles: merged,
      };
    });

    event.target.value = "";
  };

  if (!activeSetId) {
    return (
      <AgentSetIndexView
        groupedSetOptions={groupedSetOptions}
        onSelectSet={onSelectSet}
        setOrderIndexById={setOrderIndexById}
        setStateMap={setStateMap}
      />
    );
  }

  return (
    <AgentsWorkspaceView
      activeSetOption={activeSetOption}
      activeThread={activeThread}
      activeThreadId={activeThreadId}
      attachedFiles={attachedFiles}
      codexMultiAgentMode={codexMultiAgentMode}
      dashboardInsights={dashboardInsights}
      draft={draft}
      fileInputRef={fileInputRef}
      isModelMenuOpen={isModelMenuOpen}
      isReasonLevelSelectable={isReasonLevelSelectable}
      isReasonMenuOpen={isReasonMenuOpen}
      modelMenuRef={modelMenuRef}
      modelOptions={modelOptions}
      onAddThread={onAddThread}
      onAttachFiles={onAttachFiles}
      onBackToSetList={onBackToSetList}
      onCloseThread={onCloseThread}
      onOpenFilePicker={onOpenFilePicker}
      onQueuePrompt={onQueuePrompt}
      onSelectModel={setSelectedModel}
      onSelectReasonLevel={setSelectedReasonLevel}
      onSend={onSend}
      onSetActiveThreadId={onSetActiveThreadId}
      onSetDraft={onSetDraft}
      reasonLevelOptions={reasonLevelOptions}
      reasonMenuRef={reasonMenuRef}
      selectedModel={selectedModel}
      selectedModelOptionLabel={selectedModelOption?.label ?? selectedModel}
      selectedReasonLevel={selectedReasonLevel}
      sendDisabled={!draft.trim() && attachedFiles.length === 0}
      setIsModelMenuOpen={setIsModelMenuOpen}
      setIsReasonMenuOpen={setIsReasonMenuOpen}
      setMission={setMission}
      t={(key) => t(key)}
      threads={threads}
    />
  );
}
