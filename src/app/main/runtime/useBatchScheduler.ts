import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { planBatchRuns } from "../../../features/orchestration/scheduler/scheduler";
import type { BatchRunResult, BatchSchedule, BatchTriggerType } from "../../../features/orchestration/types";

const DEFAULT_STORAGE_KEY = "RAIL_BATCH_SCHEDULES_V1";
const TICK_MS = 30_000;

function loadSchedules(storageKey: string): BatchSchedule[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed as BatchSchedule[];
  } catch {
    return [];
  }
}

export function useBatchScheduler(params: {
  enabled: boolean;
  setStatus: (status: string) => void;
  runBatchSchedule: (schedule: BatchSchedule, trigger: BatchTriggerType) => Promise<{ ok: boolean; reason?: string }>;
  providerAvailable: (provider: string) => boolean;
  storageKey?: string;
}) {
  const storageKey = params.storageKey ?? DEFAULT_STORAGE_KEY;
  const activePipelineIdsRef = useRef<Set<string>>(new Set());
  const historyRef = useRef<BatchRunResult[]>([]);
  const [schedules, setSchedules] = useState<BatchSchedule[]>(() => loadSchedules(storageKey));

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(schedules));
  }, [schedules, storageKey]);

  const appendHistory = useCallback((entries: BatchRunResult[]) => {
    if (entries.length === 0) {
      return;
    }
    historyRef.current = [...historyRef.current, ...entries].slice(-200);
  }, []);

  const executeDueSchedules = useCallback(
    async (trigger: BatchTriggerType) => {
      const planned = planBatchRuns({
        schedules,
        activePipelineIds: activePipelineIdsRef.current,
        now: new Date(),
        trigger,
        providerAvailable: params.providerAvailable,
      });

      appendHistory(planned.results.filter((row) => row.status !== "queued"));

      if (planned.dueSchedules.length === 0) {
        return;
      }

      for (const schedule of planned.dueSchedules) {
        const startedAt = new Date().toISOString();
        activePipelineIdsRef.current.add(schedule.pipelineId);
        params.setStatus(`[Batch] ${schedule.label} 실행 시작 (${trigger})`);
        try {
          const result = await params.runBatchSchedule(schedule, trigger);
          const finishedAt = new Date().toISOString();
          appendHistory([
            {
              id: `${schedule.id}:${startedAt}:result`,
              scheduleId: schedule.id,
              pipelineId: schedule.pipelineId,
              trigger,
              startedAt,
              finishedAt,
              status: result.ok ? "done" : "failed",
              reason: result.reason,
              provider: schedule.provider,
            },
          ]);
          setSchedules((prev) =>
            prev.map((item) =>
              item.id !== schedule.id
                ? item
                : {
                    ...item,
                    lastTriggeredAt: finishedAt,
                  },
            ),
          );
          params.setStatus(
            result.ok
              ? `[Batch] ${schedule.label} 완료`
              : `[Batch] ${schedule.label} 실패${result.reason ? `: ${result.reason}` : ""}`,
          );
        } finally {
          activePipelineIdsRef.current.delete(schedule.pipelineId);
        }
      }
    },
    [appendHistory, params, schedules],
  );

  useEffect(() => {
    if (!params.enabled) {
      return;
    }
    const timerId = window.setInterval(() => {
      void executeDueSchedules("schedule");
    }, TICK_MS);
    return () => window.clearInterval(timerId);
  }, [params.enabled, executeDueSchedules]);

  const triggerByUserEvent = useCallback(() => {
    if (!params.enabled) {
      return;
    }
    void executeDueSchedules("user_event");
  }, [executeDueSchedules, params.enabled]);

  return useMemo(
    () => ({
      schedules,
      setSchedules,
      triggerByUserEvent,
      batchRunHistoryRef: historyRef,
    }),
    [schedules, triggerByUserEvent],
  );
}
