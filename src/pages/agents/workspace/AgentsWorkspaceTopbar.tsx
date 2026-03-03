import type { DashboardTopicId, DashboardTopicRunState } from "../../../features/dashboard/intelligence";
import type { AgentRequestHistoryItem, AgentSetOption } from "../agentTypes";
import { renderMixedLangText } from "./textUtils";

type AgentsWorkspaceTopbarProps = {
  t: (key: string) => string;
  activeSetOption: AgentSetOption | null;
  setMission: string;
  requestHistory: AgentRequestHistoryItem[];
  onRestoreTemplateSet: () => void;
  onBackToSetList: () => void;
  onAddThread: () => void;
  dataTopicId: DashboardTopicId | null;
  dataTopicRunState: DashboardTopicRunState | null;
  onOpenDataTab: () => void;
};

export function AgentsWorkspaceTopbar({
  t,
  activeSetOption,
  setMission,
  requestHistory,
  onRestoreTemplateSet,
  onBackToSetList,
  onAddThread,
  dataTopicId,
  dataTopicRunState,
  onOpenDataTab,
}: AgentsWorkspaceTopbarProps) {
  const dataTopicStatusLabel = dataTopicRunState?.running
    ? "RUNNING"
    : dataTopicRunState?.lastError
      ? "ERROR"
      : dataTopicRunState?.lastRunAt
        ? "DONE"
        : "IDLE";

  return (
    <div className="agents-topbar">
      <div className="agents-thread-list agents-thread-brief" aria-label="세트 브리핑">
        <strong lang="ko">{activeSetOption?.label ?? "세트 미선택"}</strong>
        <p lang="ko">{renderMixedLangText(setMission || activeSetOption?.description || "세트 설명이 없습니다.")}</p>
        {requestHistory[0] ? (
          <div className="agents-thread-last-request" aria-label="최근 전송 요구사항">
            <span>최근 전송 요구사항</span>
            <p lang="ko">{requestHistory[0].prompt}</p>
          </div>
        ) : null}
        {dataTopicId ? (
          <section className="agents-data-run-controls" aria-label="데이터 파이프라인 실행">
            <div className="agents-data-run-meta">
              <strong>{`topic · ${dataTopicId}`}</strong>
              <span>{`status · ${dataTopicStatusLabel}`}</span>
              {dataTopicRunState?.progressText ? <small>{dataTopicRunState.progressText}</small> : null}
              <small>메시지 전송 버튼으로 실행 요청이 전달됩니다.</small>
            </div>
            <div className="agents-data-run-actions">
              <button onClick={onOpenDataTab} type="button">
                데이터 보기
              </button>
            </div>
          </section>
        ) : null}
      </div>
      <div className="agents-topbar-actions">
        <button
          aria-label="템플릿 복원"
          className="agents-restore-template-button agents-topbar-icon-button"
          onClick={onRestoreTemplateSet}
          title="템플릿 복원"
          type="button"
        >
          <img alt="" aria-hidden="true" src="/reload.svg" />
        </button>
        <button
          aria-label="세트 목록"
          className="agents-back-button agents-topbar-icon-button"
          onClick={onBackToSetList}
          title="세트 목록"
          type="button"
        >
          <img alt="" aria-hidden="true" src="/home.svg" />
        </button>
        <button
          aria-label={t("agents.add")}
          className="agents-add-thread-button agents-topbar-icon-button"
          onClick={onAddThread}
          title={t("agents.add")}
          type="button"
        >
          <img alt="" aria-hidden="true" src="/plus-large-svgrepo-com.svg" />
        </button>
      </div>
    </div>
  );
}
