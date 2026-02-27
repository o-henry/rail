import type { MutableRefObject } from "react";
import type { PendingWebTurn } from "../types";
import type { WebProvider, WebResultMode } from "../../../features/workflow/domain";

type WebTurnRequest = {
  turn: PendingWebTurn;
  resolve: (result: { ok: boolean; output?: unknown; error?: string }) => void;
};

type ResolveWebTurnResult = { ok: boolean; output?: unknown; error?: string };

export function clearQueuedWebTurnRequestsAction(
  reason: string,
  webTurnQueueRef: MutableRefObject<WebTurnRequest[]>,
) {
  const queued = [...webTurnQueueRef.current];
  webTurnQueueRef.current = [];
  for (const request of queued) {
    request.resolve({ ok: false, error: reason });
  }
}

export function resolvePendingWebTurnAction(params: {
  result: ResolveWebTurnResult;
  pendingWebTurn: PendingWebTurn | null;
  webTurnResolverRef: MutableRefObject<((result: ResolveWebTurnResult) => void) | null>;
  webTurnQueueRef: MutableRefObject<WebTurnRequest[]>;
  webTurnPanel: {
    clearDragging: () => void;
    setPosition: (position: { x: number; y: number }) => void;
  };
  manualInputWaitNoticeByNodeRef: MutableRefObject<Record<string, boolean>>;
  setPendingWebTurn: (next: PendingWebTurn | null) => void;
  setSuspendedWebTurn: (next: PendingWebTurn | null) => void;
  setSuspendedWebResponseDraft: (next: string) => void;
  setWebResponseDraft: (next: string) => void;
  setStatus: (next: string) => void;
  webProviderLabelFn: (provider: WebProvider) => string;
  webTurnFloatingDefaultX: number;
  webTurnFloatingDefaultY: number;
}) {
  if (params.pendingWebTurn?.nodeId) {
    delete params.manualInputWaitNoticeByNodeRef.current[params.pendingWebTurn.nodeId];
  }
  const resolver = params.webTurnResolverRef.current;
  params.webTurnResolverRef.current = null;
  params.webTurnPanel.clearDragging();
  const nextQueued = params.webTurnQueueRef.current.shift() ?? null;
  if (nextQueued) {
    params.setPendingWebTurn(nextQueued.turn);
    params.setSuspendedWebTurn(null);
    params.setSuspendedWebResponseDraft("");
    params.setWebResponseDraft("");
    params.webTurnResolverRef.current = nextQueued.resolve;
    params.webTurnPanel.setPosition({
      x: params.webTurnFloatingDefaultX,
      y: params.webTurnFloatingDefaultY,
    });
    params.setStatus(`${params.webProviderLabelFn(nextQueued.turn.provider)} 웹 응답 입력 창을 상단에 표시했습니다.`);
  } else {
    params.setPendingWebTurn(null);
    params.setSuspendedWebTurn(null);
    params.setSuspendedWebResponseDraft("");
    params.setWebResponseDraft("");
  }
  if (resolver) {
    resolver(params.result);
  }
}

export function clearDetachedWebTurnResolverAction(params: {
  reason: string;
  pendingWebTurn: PendingWebTurn | null;
  suspendedWebTurn: PendingWebTurn | null;
  webTurnResolverRef: MutableRefObject<((result: ResolveWebTurnResult) => void) | null>;
}) {
  if (params.pendingWebTurn || params.suspendedWebTurn) {
    return;
  }
  const resolver = params.webTurnResolverRef.current;
  if (!resolver) {
    return;
  }
  params.webTurnResolverRef.current = null;
  resolver({ ok: false, error: params.reason });
}

export async function requestWebTurnResponseAction(params: {
  nodeId: string;
  provider: WebProvider;
  prompt: string;
  mode: WebResultMode;
  pendingWebTurn: PendingWebTurn | null;
  suspendedWebTurn: PendingWebTurn | null;
  suspendedWebResponseDraft: string;
  webTurnResolverRef: MutableRefObject<((result: ResolveWebTurnResult) => void) | null>;
  webTurnQueueRef: MutableRefObject<WebTurnRequest[]>;
  webTurnPanel: {
    setPosition: (position: { x: number; y: number }) => void;
  };
  manualInputWaitNoticeByNodeRef: MutableRefObject<Record<string, boolean>>;
  setPendingWebTurn: (next: PendingWebTurn | null) => void;
  setWebResponseDraft: (next: string) => void;
  setSuspendedWebTurn: (next: PendingWebTurn | null) => void;
  setSuspendedWebResponseDraft: (next: string) => void;
  setStatus: (next: string) => void;
  addNodeLog: (nodeId: string, message: string) => void;
  webProviderLabelFn: (provider: WebProvider) => string;
  clearDetachedWebTurnResolver: (reason: string) => void;
  webTurnFloatingDefaultX: number;
  webTurnFloatingDefaultY: number;
}): Promise<ResolveWebTurnResult> {
  const turn: PendingWebTurn = {
    nodeId: params.nodeId,
    provider: params.provider,
    prompt: params.prompt,
    mode: params.mode,
  };
  return new Promise((resolve) => {
    params.clearDetachedWebTurnResolver("이전 웹 입력 세션을 정리하고 새 요청으로 교체했습니다.");
    if (
      params.pendingWebTurn &&
      !params.webTurnResolverRef.current &&
      (params.pendingWebTurn.nodeId !== params.nodeId || params.pendingWebTurn.provider !== params.provider)
    ) {
      params.setPendingWebTurn(null);
      params.setWebResponseDraft("");
    }
    if (
      params.pendingWebTurn?.nodeId === params.nodeId &&
      params.pendingWebTurn.provider === params.provider &&
      !params.webTurnResolverRef.current
    ) {
      params.webTurnResolverRef.current = resolve;
      delete params.manualInputWaitNoticeByNodeRef.current[params.nodeId];
      params.setStatus(`${params.webProviderLabelFn(params.provider)} 수동 입력 창이 실행 흐름에 연결되었습니다.`);
      return;
    }
    if (
      params.suspendedWebTurn?.nodeId === params.nodeId &&
      params.suspendedWebTurn.provider === params.provider &&
      !params.webTurnResolverRef.current
    ) {
      params.setPendingWebTurn(params.suspendedWebTurn);
      params.setWebResponseDraft(params.suspendedWebResponseDraft);
      params.setSuspendedWebTurn(null);
      params.setSuspendedWebResponseDraft("");
      params.webTurnResolverRef.current = resolve;
      delete params.manualInputWaitNoticeByNodeRef.current[params.nodeId];
      params.webTurnPanel.setPosition({
        x: params.webTurnFloatingDefaultX,
        y: params.webTurnFloatingDefaultY,
      });
      params.setStatus(`${params.webProviderLabelFn(params.provider)} 수동 입력 창이 실행 흐름에 연결되었습니다.`);
      return;
    }
    if (!params.pendingWebTurn && !params.webTurnResolverRef.current) {
      params.setWebResponseDraft("");
      params.setSuspendedWebTurn(null);
      params.setSuspendedWebResponseDraft("");
      params.setPendingWebTurn(turn);
      params.webTurnResolverRef.current = resolve;
      params.webTurnPanel.setPosition({
        x: params.webTurnFloatingDefaultX,
        y: params.webTurnFloatingDefaultY,
      });
      return;
    }
    params.webTurnQueueRef.current.push({ turn, resolve });
    params.addNodeLog(params.nodeId, `[WEB] 수동 입력 대기열 등록 (${params.webTurnQueueRef.current.length})`);
  });
}
