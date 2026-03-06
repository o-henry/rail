import type { MutableRefObject } from "react";
import type { TurnConfig, TurnExecutor } from "../../../features/workflow/domain";
import type { GraphNode } from "../../../features/workflow/types";
import type { InternalMemoryTraceEntry, KnowledgeTraceEntry } from "../types";
import { viaGetRun, viaListArtifacts, viaRunFlow } from "./viaBridgeClient";
import { buildViaOutput } from "./viaTurnRunSummary";
import {
  formatViaStepLog,
  isTerminalStatus,
  normalizeRunStatus,
  parseCsvList,
  sleep,
  toRecord,
} from "./viaTurnRunUtils";

type InvokeFn = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export type ViaTurnResult = {
  ok: boolean;
  output?: unknown;
  error?: string;
  executor: TurnExecutor;
  provider: string;
  knowledgeTrace?: KnowledgeTraceEntry[];
  memoryTrace?: InternalMemoryTraceEntry[];
};

export async function runViaFlowTurn(params: {
  node: GraphNode;
  config: TurnConfig;
  cwd: string;
  invokeFn: InvokeFn;
  pauseRequestedRef: MutableRefObject<boolean>;
  cancelRequestedRef: MutableRefObject<boolean>;
  pauseErrorToken: string;
  addNodeLog: (nodeId: string, message: string) => void;
  t: (key: string) => string;
  executor: TurnExecutor;
  knowledgeTrace?: KnowledgeTraceEntry[];
  memoryTrace?: InternalMemoryTraceEntry[];
}): Promise<ViaTurnResult> {
  const normalizedFlowIdRaw = String(params.config.viaFlowId ?? "").trim();
  const flowId = Number(normalizedFlowIdRaw);
  if (!normalizedFlowIdRaw || !Number.isInteger(flowId) || flowId <= 0) {
    params.addNodeLog(params.node.id, "[VIA][오류] flow_id가 비어 있거나 올바르지 않습니다.");
    return {
      ok: false,
      error: "VIA flow_id를 올바르게 입력하세요. (양의 정수)",
      executor: params.executor,
      provider: "via",
      knowledgeTrace: params.knowledgeTrace,
      memoryTrace: params.memoryTrace,
    };
  }

  if (params.pauseRequestedRef.current) {
    params.addNodeLog(params.node.id, "[VIA] 일시정지 요청으로 실행을 중단했습니다.");
    return {
      ok: false,
      error: params.pauseErrorToken,
      executor: params.executor,
      provider: "via",
      knowledgeTrace: params.knowledgeTrace,
      memoryTrace: params.memoryTrace,
    };
  }

  if (params.cancelRequestedRef.current) {
    params.addNodeLog(params.node.id, "[VIA] 사용자 취소 요청으로 실행을 중단했습니다.");
    return {
      ok: false,
      error: params.t("run.cancelledByUserShort"),
      executor: params.executor,
      provider: "via",
      knowledgeTrace: params.knowledgeTrace,
      memoryTrace: params.memoryTrace,
    };
  }

  const timeoutMs = Math.max(10_000, Number(params.config.webTimeoutMs ?? 180_000) || 180_000);
  const pollIntervalMs = 1_200;
  const preferredSourceType = String((params.config as Record<string, unknown>)?.viaSourceTypeHint ?? "")
    .trim()
    .toLowerCase()
    || String((params.config as Record<string, unknown>)?.viaNodeType ?? "")
      .trim()
      .toLowerCase();
  const normalizedSourceType =
    preferredSourceType.startsWith("source.") ? preferredSourceType : "";
  const sourceOptions = (() => {
    const configRecord = params.config as Record<string, unknown>;
    const keywords = parseCsvList(configRecord?.viaCustomKeywords, 10);
    const countries = parseCsvList(configRecord?.viaCustomCountries, 8).map((row) => row.toUpperCase());
    const sites = parseCsvList(configRecord?.viaCustomSites, 20);
    const maxItemsRaw = Number(configRecord?.viaCustomMaxItems);
    const maxItems = Number.isFinite(maxItemsRaw) && maxItemsRaw > 0
      ? Math.max(1, Math.min(120, Math.floor(maxItemsRaw)))
      : undefined;
    if (keywords.length === 0 && countries.length === 0 && sites.length === 0 && maxItems === undefined) {
      return undefined;
    }
    return {
      keywords: keywords.length > 0 ? keywords : undefined,
      countries: countries.length > 0 ? countries : undefined,
      sites: sites.length > 0 ? sites : undefined,
      maxItems,
    };
  })();

  params.addNodeLog(params.node.id, `[VIA] flow_id=${flowId} 실행 요청`);

  try {
    const initial = await viaRunFlow({
      invokeFn: params.invokeFn,
      cwd: params.cwd,
      flowId,
      trigger: "manual",
      sourceType: normalizedSourceType || undefined,
      sourceOptions,
    });

    if (!initial.runId) {
      params.addNodeLog(params.node.id, "[VIA][오류] 실행 응답에 run_id가 없어 중단합니다.");
      return {
        ok: false,
        error: "VIA 실행 응답에 run_id가 없습니다.",
        executor: params.executor,
        provider: "via",
        knowledgeTrace: params.knowledgeTrace,
        memoryTrace: params.memoryTrace,
      };
    }

    const runId = initial.runId;
    let status = normalizeRunStatus(initial.status);
    let warnings = Array.isArray(initial.warnings) ? initial.warnings : [];
    let detail = initial.detail;
    let artifacts = Array.isArray(initial.artifacts) ? initial.artifacts : [];
    const seenStepLogs = new Set<string>();
    const seenWarnings = new Set<string>();
    let lastLoggedStatus = "";

    const appendViaProgressLogs = () => {
      if (status && status !== lastLoggedStatus) {
        params.addNodeLog(params.node.id, `[VIA] 상태=${status}`);
        lastLoggedStatus = status;
      }
      for (const warning of warnings) {
        const normalized = String(warning ?? "").trim();
        if (!normalized || seenWarnings.has(normalized)) {
          continue;
        }
        seenWarnings.add(normalized);
        params.addNodeLog(params.node.id, `[VIA][경고] ${normalized}`);
      }
      const detailRecord = toRecord(detail);
      const steps = Array.isArray(detailRecord?.steps) ? detailRecord?.steps : [];
      for (const step of steps) {
        const line = formatViaStepLog(step);
        if (!line || seenStepLogs.has(line)) {
          continue;
        }
        seenStepLogs.add(line);
        params.addNodeLog(params.node.id, line);
      }
    };

    appendViaProgressLogs();

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (params.pauseRequestedRef.current) {
        return {
          ok: false,
          error: params.pauseErrorToken,
          executor: params.executor,
          provider: "via",
          knowledgeTrace: params.knowledgeTrace,
          memoryTrace: params.memoryTrace,
        };
      }
      if (params.cancelRequestedRef.current) {
        return {
          ok: false,
          error: params.t("run.cancelledByUserShort"),
          executor: params.executor,
          provider: "via",
          knowledgeTrace: params.knowledgeTrace,
          memoryTrace: params.memoryTrace,
        };
      }

      if (isTerminalStatus(status) && (status !== "done" || artifacts.length > 0)) {
        break;
      }

      const run = await viaGetRun({
        invokeFn: params.invokeFn,
        cwd: params.cwd,
        runId,
      });
      status = normalizeRunStatus(run.status || status);
      detail = run.detail ?? detail;
      if (Array.isArray(run.warnings) && run.warnings.length > 0) {
        warnings = run.warnings;
      }
      appendViaProgressLogs();

      const listed = await viaListArtifacts({
        invokeFn: params.invokeFn,
        cwd: params.cwd,
        runId,
      });
      if (listed.length > 0) {
        artifacts = listed;
      }

      if (isTerminalStatus(status) && (status !== "done" || artifacts.length > 0)) {
        break;
      }

      await sleep(pollIntervalMs);
    }

    if (!isTerminalStatus(status)) {
      params.addNodeLog(params.node.id, `[VIA][오류] 타임아웃(${timeoutMs}ms) run_id=${runId}`);
      return {
        ok: false,
        error: `VIA 실행 타임아웃(${timeoutMs}ms): run_id=${runId}`,
        executor: params.executor,
        provider: "via",
        knowledgeTrace: params.knowledgeTrace,
        memoryTrace: params.memoryTrace,
      };
    }

    if (status !== "done") {
      params.addNodeLog(params.node.id, `[VIA][오류] 실패 status=${status}, run_id=${runId}`);
      return {
        ok: false,
        error: `VIA 실행 실패: status=${status}, run_id=${runId}`,
        executor: params.executor,
        provider: "via",
        knowledgeTrace: params.knowledgeTrace,
        memoryTrace: params.memoryTrace,
        output: buildViaOutput({
          flowId,
          runId,
          status,
          warnings,
          detail,
          artifacts,
          preferredSourceType,
        }),
      };
    }

    params.addNodeLog(params.node.id, `[VIA] 완료 run_id=${runId}, artifacts=${artifacts.length}`);

    return {
      ok: true,
      output: buildViaOutput({
        flowId,
        runId,
        status,
        warnings,
        detail,
        artifacts,
        preferredSourceType,
      }),
      executor: params.executor,
      provider: "via",
      knowledgeTrace: params.knowledgeTrace,
      memoryTrace: params.memoryTrace,
    };
  } catch (error) {
    params.addNodeLog(params.node.id, `[VIA][오류] ${String(error)}`);
    return {
      ok: false,
      error: `VIA 실행 실패: ${String(error)}`,
      executor: params.executor,
      provider: "via",
      knowledgeTrace: params.knowledgeTrace,
      memoryTrace: params.memoryTrace,
    };
  }
}
