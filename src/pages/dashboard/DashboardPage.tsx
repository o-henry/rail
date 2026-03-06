import { useMemo } from "react";
import MissionControlPanel from "../../components/MissionControlPanel";
import {
  DASHBOARD_TOPIC_IDS,
  type DashboardTopicId,
  type DashboardTopicRunState,
  type DashboardTopicSnapshot,
} from "../../features/dashboard/intelligence";
import type { MissionControlState } from "../../features/orchestration/agentic/missionControl";
import type { CompanionEventType } from "../../features/orchestration/types";
import { useI18n } from "../../i18n";
import { type DashboardStockDocumentPost } from "./stockWidgetChartData";
import type { DashboardDetailTopic } from "./DashboardDetailPage";

type DashboardPageProps = {
  isGraphRunning: boolean;
  pendingApprovalsCount: number;
  webBridgeRunning: boolean;
  connectedProviderCount: number;
  scheduleCount: number;
  enabledScheduleCount: number;
  focusTopic: DashboardDetailTopic | null;
  onFocusTopic: (topic: DashboardDetailTopic | null) => void;
  stockDocumentPosts: DashboardStockDocumentPost[];
  topicSnapshots: Partial<Record<DashboardTopicId, DashboardTopicSnapshot>>;
  runStateByTopic: Record<DashboardTopicId, DashboardTopicRunState>;
  workspaceEvents: Array<{
    id: string;
    at: string;
    source: string;
    actor: string;
    level: string;
    message: string;
    runId?: string;
    topic?: string;
  }>;
  mission: MissionControlState | null;
  onClearMission: () => void;
  onExecuteTaskCommand: (command: string) => void;
  onRecordCompanionEvent: (type: Exclude<CompanionEventType, "unity_verification_completed">, message?: string) => void;
  onRecordUnityVerification: (success: boolean, message: string) => void;
};

type OpsCard = {
  id: string;
  title: string;
  value: string;
  caption: string;
};

function formatSurface(surface: string | undefined): string {
  if (surface === "vscode") {
    return "VS Code";
  }
  if (surface === "unity") {
    return "Unity";
  }
  return "RAIL";
}

export default function DashboardPage(props: DashboardPageProps) {
  const { t } = useI18n();

  const cards = useMemo<OpsCard[]>(() => {
    const nextAction = props.mission?.parentEnvelope.record.nextAction;
    return [
      {
        id: "surface",
        title: "Current Surface",
        value: formatSurface(props.mission?.parentEnvelope.record.surface),
        caption: nextAction?.title ?? "활성 미션 없음",
      },
      {
        id: "nextAction",
        title: "Next Action",
        value: nextAction?.detail ?? "그래프 탭에서 역할 실행을 시작하세요.",
        caption: nextAction?.cta ?? "Workflow tab",
      },
      {
        id: "approvals",
        title: t("dashboard.card.approvals"),
        value: String(props.pendingApprovalsCount),
        caption: props.pendingApprovalsCount > 0 ? t("modal.approvalRequired") : t("label.status.done"),
      },
      {
        id: "ops",
        title: "Ops",
        value: `${props.enabledScheduleCount}/${props.scheduleCount}`,
        caption: props.webBridgeRunning
          ? `bridge on · ${props.connectedProviderCount} providers`
          : "bridge off",
      },
    ];
  }, [
    props.connectedProviderCount,
    props.enabledScheduleCount,
    props.mission,
    props.pendingApprovalsCount,
    props.scheduleCount,
    props.webBridgeRunning,
    t,
  ]);

  const pendingItems = useMemo(() => {
    const items: string[] = [];
    const verification = props.mission?.parentEnvelope.record.verificationStatus;
    if (props.mission?.parentEnvelope.record.nextAction?.detail) {
      items.push(props.mission.parentEnvelope.record.nextAction.detail);
    }
    if (verification && verification !== "verified") {
      items.push(`Unity verification: ${verification}`);
    }
    if (props.pendingApprovalsCount > 0) {
      items.push(`승인 대기 ${props.pendingApprovalsCount}건`);
    }
    DASHBOARD_TOPIC_IDS.forEach((topic) => {
      const runState = props.runStateByTopic[topic];
      if (runState.running || runState.lastError) {
        items.push(
          `${t(`dashboard.widget.${topic}.title`)} · ${runState.running ? "running" : runState.lastError ? "error" : "idle"}`,
        );
      }
    });
    return items.slice(0, 6);
  }, [props.mission, props.pendingApprovalsCount, props.runStateByTopic, t]);

  const recentEvents = useMemo(
    () =>
      [...props.workspaceEvents]
        .filter((entry) => entry.actor !== "user")
        .sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime())
        .slice(0, 8),
    [props.workspaceEvents],
  );

  const topicSummaries = useMemo(
    () =>
      DASHBOARD_TOPIC_IDS
        .map((topic) => {
          const snapshot = props.topicSnapshots[topic];
          if (!snapshot) {
            return null;
          }
          return {
            topic,
            title: t(`dashboard.widget.${topic}.title`),
            summary: String(snapshot.summary ?? "").trim() || "요약 없음",
            generatedAt: snapshot.generatedAt,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
        .slice(0, 6),
    [props.topicSnapshots, t],
  );

  const feedSummaries = useMemo(
    () =>
      [...props.stockDocumentPosts]
        .filter((post) => String(post.summary ?? "").trim().length > 0)
        .sort((left, right) => new Date(right.createdAt ?? 0).getTime() - new Date(left.createdAt ?? 0).getTime())
        .slice(0, 4)
        .map((post) => String(post.summary ?? "").trim()),
    [props.stockDocumentPosts],
  );

  return (
    <section className="dashboard-ops-layout workspace-tab-panel">
      <section className="dashboard-ops-hero panel-card">
        <div>
          <span className="dashboard-ops-kicker">PROJECT OPS</span>
          <h2>그래프 밖 운영 정보만 모아둔 관제 보드</h2>
          <p>실행은 그래프 탭에서 하고, 현재 미션 상태와 운영 대기열은 여기서 확인합니다.</p>
        </div>
        <div className="dashboard-ops-card-grid">
          {cards.map((card) => (
            <article className="dashboard-ops-card" key={card.id}>
              <span>{card.title}</span>
              <strong>{card.value}</strong>
              <p>{card.caption}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="dashboard-ops-main">
        <div className="dashboard-ops-primary">
          <MissionControlPanel
            emptyCopy="그래프 탭에서 역할 실행을 시작하면 현재 미션이 여기에 그대로 이어집니다."
            mission={props.mission}
            onClearMission={props.onClearMission}
            onExecuteTaskCommand={props.onExecuteTaskCommand}
            onRecordCompanionEvent={props.onRecordCompanionEvent}
            onRecordUnityVerification={props.onRecordUnityVerification}
          />
        </div>

        <aside className="dashboard-ops-sidebar">
          <section className="panel-card dashboard-ops-panel">
            <div className="dashboard-ops-panel-head">
              <strong>Pending Work</strong>
              <small>{props.isGraphRunning ? "graph running" : "graph idle"}</small>
            </div>
            {pendingItems.length > 0 ? (
              <ul className="dashboard-ops-list">
                {pendingItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="dashboard-ops-empty">현재 대기 중인 작업이 없습니다.</p>
            )}
          </section>

          <section className="panel-card dashboard-ops-panel">
            <div className="dashboard-ops-panel-head">
              <strong>Recent Events</strong>
              <small>{recentEvents.length} entries</small>
            </div>
            {recentEvents.length > 0 ? (
              <ul className="dashboard-ops-event-list">
                {recentEvents.map((entry) => (
                  <li key={entry.id}>
                    <span>{entry.source}</span>
                    <p>{entry.message}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="dashboard-ops-empty">최근 이벤트가 없습니다.</p>
            )}
          </section>

          <section className="panel-card dashboard-ops-panel">
            <div className="dashboard-ops-panel-head">
              <strong>Data Snapshots</strong>
              <small>{topicSummaries.length} topics</small>
            </div>
            {topicSummaries.length > 0 ? (
              <ul className="dashboard-ops-event-list">
                {topicSummaries.map((item) => (
                  <li key={`${item.topic}-${item.generatedAt}`}>
                    <span>{item.title}</span>
                    <p>{item.summary}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="dashboard-ops-empty">아직 데이터 스냅샷이 없습니다.</p>
            )}
          </section>

          <section className="panel-card dashboard-ops-panel">
            <div className="dashboard-ops-panel-head">
              <strong>Recent Briefs</strong>
              <small>{feedSummaries.length} docs</small>
            </div>
            {feedSummaries.length > 0 ? (
              <ul className="dashboard-ops-list">
                {feedSummaries.map((summary) => (
                  <li key={summary}>{summary}</li>
                ))}
              </ul>
            ) : (
              <p className="dashboard-ops-empty">브리핑 문서가 아직 없습니다.</p>
            )}
          </section>
        </aside>
      </section>
    </section>
  );
}
