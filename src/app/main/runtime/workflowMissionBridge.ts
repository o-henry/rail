import type { StudioRoleId } from "../../../features/studio/handoffTypes";

type WorkflowBridgeParams = {
  taskId: string;
  prompt: string;
  roleId?: StudioRoleId | null;
  setWorkflowRoleId: (value: StudioRoleId) => void;
  setWorkflowRoleTaskId: (value: string) => void;
  setWorkflowRolePrompt: (value: string) => void;
  setWorkflowQuestion: (value: string) => void;
  setWorkspaceTab: (value: "workflow") => void;
};

type KnowledgeHandlerParams = {
  setStatus: (value: string) => void;
  toStudioRoleId: (value: string) => StudioRoleId | null;
  setWorkflowRoleId: (value: StudioRoleId) => void;
  setWorkflowRoleTaskId: (value: string) => void;
  setWorkflowRolePrompt: (value: string) => void;
  setWorkflowQuestion: (value: string) => void;
  setWorkspaceTab: (value: "workflow") => void;
};

type HandoffPayload = { handoffId: string; toRole: string; taskId: string; request: string };

function applyWorkflowBridge(params: WorkflowBridgeParams): void {
  if (params.roleId) {
    params.setWorkflowRoleId(params.roleId);
  }
  params.setWorkflowRoleTaskId(params.taskId);
  params.setWorkflowRolePrompt(params.prompt);
  params.setWorkflowQuestion(params.prompt);
  params.setWorkspaceTab("workflow");
}

export function buildKnowledgeInjectionHandler(params: KnowledgeHandlerParams) {
  return (entries: Array<Record<string, unknown>>) => {
    const firstEntry = entries[0];
    if (!firstEntry) {
      return;
    }
    const taskId = String(firstEntry.taskId ?? "").trim() || "TASK-001";
    const prompt = [
      `[데이터베이스 컨텍스트 ${taskId}]`,
      String(firstEntry.summary ?? "").trim() || String(firstEntry.title ?? "").trim() || taskId,
      String(firstEntry.sourceUrl ?? "").trim() ? `출처: ${String(firstEntry.sourceUrl ?? "").trim()}` : "",
    ].filter(Boolean).join("\n");
    applyWorkflowBridge({
      roleId: params.toStudioRoleId(String(firstEntry.roleId ?? "")),
      taskId,
      prompt,
      setWorkflowQuestion: params.setWorkflowQuestion,
      setWorkflowRoleId: params.setWorkflowRoleId,
      setWorkflowRolePrompt: params.setWorkflowRolePrompt,
      setWorkflowRoleTaskId: params.setWorkflowRoleTaskId,
      setWorkspaceTab: params.setWorkspaceTab,
    });
    params.setStatus(`데이터베이스 컨텍스트를 그래프 작업면으로 가져왔습니다: ${taskId}`);
  };
}

export function buildConsumedHandoffHandler(params: {
  publishAction: (action: { type: "handoff_consume"; payload: { handoffId: string } }) => void;
  toStudioRoleId: (value: string) => StudioRoleId | null;
  setWorkflowRoleId: (value: StudioRoleId) => void;
  setWorkflowRoleTaskId: (value: string) => void;
  setWorkflowRolePrompt: (value: string) => void;
  setWorkflowQuestion: (value: string) => void;
  setWorkspaceTab: (value: "workflow") => void;
}) {
  return (payload: HandoffPayload) => {
    params.publishAction({ type: "handoff_consume", payload: { handoffId: payload.handoffId } });
    applyWorkflowBridge({
      roleId: params.toStudioRoleId(payload.toRole),
      taskId: payload.taskId,
      prompt: `[핸드오프 ${payload.taskId}] ${payload.request}`,
      setWorkflowQuestion: params.setWorkflowQuestion,
      setWorkflowRoleId: params.setWorkflowRoleId,
      setWorkflowRolePrompt: params.setWorkflowRolePrompt,
      setWorkflowRoleTaskId: params.setWorkflowRoleTaskId,
      setWorkspaceTab: params.setWorkspaceTab,
    });
  };
}
