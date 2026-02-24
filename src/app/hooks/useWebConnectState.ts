import { useRef, useState } from "react";
import type { WebProvider } from "../../features/workflow/domain";
import type {
  PendingWebLogin,
  PendingWebTurn,
  WebWorkerHealth,
} from "../main";
import type { WebBridgeStatus } from "../mainAppGraphHelpers";

export function useWebConnectState() {
  const [pendingWebTurn, setPendingWebTurn] = useState<PendingWebTurn | null>(null);
  const [suspendedWebTurn, setSuspendedWebTurn] = useState<PendingWebTurn | null>(null);
  const [suspendedWebResponseDraft, setSuspendedWebResponseDraft] = useState("");
  const [pendingWebLogin, setPendingWebLogin] = useState<PendingWebLogin | null>(null);
  const [webResponseDraft, setWebResponseDraft] = useState("");
  const [, setWebWorkerHealth] = useState<WebWorkerHealth>({
    running: false,
  });
  const [webWorkerBusy, setWebWorkerBusy] = useState(false);
  const [webBridgeStatus, setWebBridgeStatus] = useState<WebBridgeStatus>({
    running: false,
    port: 38961,
    tokenMasked: "",
    extensionOriginAllowlistConfigured: false,
    allowedExtensionOriginCount: 0,
    connectedProviders: [],
    queuedTasks: 0,
    activeTasks: 0,
  });
  const [, setWebBridgeLogs] = useState<string[]>([]);
  const [webBridgeConnectCode, setWebBridgeConnectCode] = useState("");
  const [providerChildViewOpen, setProviderChildViewOpen] = useState<Record<WebProvider, boolean>>({
    gemini: false,
    gpt: false,
    grok: false,
    perplexity: false,
    claude: false,
  });

  const activeWebNodeIdRef = useRef<string>("");
  const activeWebProviderRef = useRef<WebProvider | null>(null);
  const webTurnResolverRef = useRef<((result: { ok: boolean; output?: unknown; error?: string }) => void) | null>(
    null,
  );
  const webLoginResolverRef = useRef<((retry: boolean) => void) | null>(null);
  const pendingWebTurnAutoOpenKeyRef = useRef("");
  const webTurnFloatingRef = useRef<HTMLElement | null>(null);
  const pendingWebLoginAutoOpenKeyRef = useRef("");
  const webBridgeStageWarnTimerRef = useRef<Record<string, number>>({});
  const activeWebPromptRef = useRef<Partial<Record<WebProvider, string>>>({});

  return {
    pendingWebTurn,
    setPendingWebTurn,
    suspendedWebTurn,
    setSuspendedWebTurn,
    suspendedWebResponseDraft,
    setSuspendedWebResponseDraft,
    pendingWebLogin,
    setPendingWebLogin,
    webResponseDraft,
    setWebResponseDraft,
    setWebWorkerHealth,
    webWorkerBusy,
    setWebWorkerBusy,
    webBridgeStatus,
    setWebBridgeStatus,
    setWebBridgeLogs,
    webBridgeConnectCode,
    setWebBridgeConnectCode,
    providerChildViewOpen,
    setProviderChildViewOpen,
    activeWebNodeIdRef,
    activeWebProviderRef,
    webTurnResolverRef,
    webLoginResolverRef,
    pendingWebTurnAutoOpenKeyRef,
    webTurnFloatingRef,
    pendingWebLoginAutoOpenKeyRef,
    webBridgeStageWarnTimerRef,
    activeWebPromptRef,
  };
}
