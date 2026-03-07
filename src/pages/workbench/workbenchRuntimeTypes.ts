export type WorkbenchWorkspaceEvent = {
  id: string;
  source: string;
  message: string;
  level?: string;
};

export type WorkbenchNodeState = {
  status: string;
  logs?: string[];
};
