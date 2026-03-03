import type { HandoffRecord, StudioRoleId } from "../../features/studio/handoffTypes";
import type { StudioRoleTemplate } from "../../features/studio/roleTemplates";

export type RoleDockStatus = "IDLE" | "RUNNING" | "VERIFY" | "DONE";

export type RoleDockRuntimeState = {
  status: RoleDockStatus;
  taskId?: string;
  runId?: string;
  message?: string;
};

export function buildRoleDockStatusByRole(params: {
  roles: StudioRoleTemplate[];
  runtimeByRole: Partial<Record<StudioRoleId, RoleDockRuntimeState>>;
  handoffRecords: HandoffRecord[];
}): Partial<Record<StudioRoleId, RoleDockRuntimeState>> {
  const statusByRole: Partial<Record<StudioRoleId, RoleDockRuntimeState>> = {};
  for (const role of params.roles) {
    statusByRole[role.id] = params.runtimeByRole[role.id] ?? { status: "IDLE" };
  }
  for (const row of params.handoffRecords) {
    const toRoleState = statusByRole[row.toRole] ?? { status: "IDLE" };
    if (row.status === "requested" || row.status === "accepted") {
      if (toRoleState.status !== "RUNNING") {
        statusByRole[row.toRole] = {
          status: "VERIFY",
          taskId: row.taskId,
          runId: row.runId,
          message: "INBOX_HANDOFF",
        };
      }
    }

    const fromRoleState = statusByRole[row.fromRole] ?? { status: "IDLE" };
    if (row.status === "completed" && fromRoleState.status !== "RUNNING") {
      statusByRole[row.fromRole] = {
        status: "DONE",
        taskId: row.taskId,
        runId: row.runId,
        message: "HANDOFF_COMPLETED",
      };
    }
    if (row.status === "rejected" && fromRoleState.status !== "RUNNING") {
      statusByRole[row.fromRole] = {
        status: "VERIFY",
        taskId: row.taskId,
        runId: row.runId,
        message: row.rejectReason || "BLOCKED",
      };
    }
  }
  return statusByRole;
}
