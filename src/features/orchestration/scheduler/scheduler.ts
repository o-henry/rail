import type { BatchRunResult, BatchSchedule, BatchTriggerType } from "../types";

type PlanBatchRunsParams = {
  schedules: BatchSchedule[];
  activePipelineIds: Set<string>;
  now: Date;
  trigger: BatchTriggerType;
  providerAvailable?: (provider: string) => boolean;
};

type PlanBatchRunsResult = {
  dueSchedules: BatchSchedule[];
  results: BatchRunResult[];
};

function normalizeCron(cron: string) {
  return String(cron).trim().replace(/\s+/g, " ");
}

function parseCron(cron: string) {
  const [minuteRaw, hourRaw] = normalizeCron(cron).split(" ");
  if (!minuteRaw || !hourRaw) {
    return null;
  }
  const minute = minuteRaw === "*" ? "*" : Number(minuteRaw);
  const hour = hourRaw === "*" ? "*" : Number(hourRaw);
  if (minute !== "*" && (!Number.isInteger(minute) || minute < 0 || minute > 59)) {
    return null;
  }
  if (hour !== "*" && (!Number.isInteger(hour) || hour < 0 || hour > 23)) {
    return null;
  }
  return { minute, hour };
}

function isCronDue(cron: string, now: Date) {
  const parsed = parseCron(cron);
  if (!parsed) {
    return false;
  }
  const hourMatches = parsed.hour === "*" || parsed.hour === now.getUTCHours();
  const minuteMatches = parsed.minute === "*" || parsed.minute === now.getUTCMinutes();
  return hourMatches && minuteMatches;
}

function toMinuteKey(iso: string) {
  return iso.slice(0, 16);
}

export function planBatchRuns(params: PlanBatchRunsParams): PlanBatchRunsResult {
  const dueSchedules: BatchSchedule[] = [];
  const results: BatchRunResult[] = [];
  const nowIso = params.now.toISOString();

  for (const schedule of params.schedules) {
    if (schedule.status !== "enabled") {
      results.push({
        id: `${schedule.id}:${nowIso}:disabled`,
        scheduleId: schedule.id,
        pipelineId: schedule.pipelineId,
        trigger: params.trigger,
        startedAt: nowIso,
        finishedAt: nowIso,
        status: "skipped",
        reason: "schedule disabled",
        provider: schedule.provider,
      });
      continue;
    }

    if (!isCronDue(schedule.cron, params.now)) {
      continue;
    }

    if (schedule.lastTriggeredAt && toMinuteKey(schedule.lastTriggeredAt) === toMinuteKey(nowIso)) {
      results.push({
        id: `${schedule.id}:${nowIso}:already-triggered`,
        scheduleId: schedule.id,
        pipelineId: schedule.pipelineId,
        trigger: params.trigger,
        startedAt: nowIso,
        finishedAt: nowIso,
        status: "skipped",
        reason: "already triggered on this tick",
        provider: schedule.provider,
      });
      continue;
    }

    if (params.activePipelineIds.has(schedule.pipelineId)) {
      results.push({
        id: `${schedule.id}:${nowIso}:overlap`,
        scheduleId: schedule.id,
        pipelineId: schedule.pipelineId,
        trigger: params.trigger,
        startedAt: nowIso,
        finishedAt: nowIso,
        status: "skipped",
        reason: "overlap skip",
        provider: schedule.provider,
      });
      continue;
    }

    if (params.providerAvailable && !params.providerAvailable(schedule.provider)) {
      results.push({
        id: `${schedule.id}:${nowIso}:provider-failed`,
        scheduleId: schedule.id,
        pipelineId: schedule.pipelineId,
        trigger: params.trigger,
        startedAt: nowIso,
        finishedAt: nowIso,
        status: "failed",
        reason: "provider unavailable",
        provider: schedule.provider,
      });
      continue;
    }

    dueSchedules.push(schedule);
    results.push({
      id: `${schedule.id}:${nowIso}:queued`,
      scheduleId: schedule.id,
      pipelineId: schedule.pipelineId,
      trigger: params.trigger,
      startedAt: nowIso,
      status: "queued",
      provider: schedule.provider,
    });
  }

  return { dueSchedules, results };
}
