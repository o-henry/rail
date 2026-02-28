import { useMemo } from "react";
import { type DashboardTopicId, type DashboardTopicSnapshot } from "../../features/dashboard/intelligence";
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
};

type DashboardCard = {
  id: "workflow" | "approvals" | "webConnect" | "schedules";
  title: string;
  value: string;
  caption: string;
};

type DashboardWidget = {
  topic: DashboardDetailTopic;
  badgeKey: string;
  fallbackItemKeys: string[];
};

function asDashboardTopicId(topic: DashboardDetailTopic): DashboardTopicId | null {
  if (
    topic === "marketSummary" ||
    topic === "globalHeadlines" ||
    topic === "industryTrendRadar" ||
    topic === "communityHotTopics" ||
    topic === "eventCalendar" ||
    topic === "riskAlertBoard" ||
    topic === "devEcosystem"
  ) {
    return topic;
  }
  return null;
}

export default function DashboardPage(props: DashboardPageProps) {
  const { t } = useI18n();
  const widgets = useMemo<DashboardWidget[]>(
    () => [
      {
        topic: "globalHeadlines",
        badgeKey: "dashboard.widget.badge.global",
        fallbackItemKeys: [
          "dashboard.widget.globalHeadlines.item1",
          "dashboard.widget.globalHeadlines.item2",
          "dashboard.widget.globalHeadlines.item3",
        ],
      },
      {
        topic: "industryTrendRadar",
        badgeKey: "dashboard.widget.badge.radar",
        fallbackItemKeys: [
          "dashboard.widget.industryTrendRadar.item1",
          "dashboard.widget.industryTrendRadar.item2",
          "dashboard.widget.industryTrendRadar.item3",
        ],
      },
      {
        topic: "marketSummary",
        badgeKey: "dashboard.widget.badge.market",
        fallbackItemKeys: [
          "dashboard.widget.marketSummary.item1",
          "dashboard.widget.marketSummary.item2",
          "dashboard.widget.marketSummary.item3",
        ],
      },
      {
        topic: "communityHotTopics",
        badgeKey: "dashboard.widget.badge.community",
        fallbackItemKeys: [
          "dashboard.widget.communityHotTopics.item1",
          "dashboard.widget.communityHotTopics.item2",
          "dashboard.widget.communityHotTopics.item3",
          "dashboard.widget.communityHotTopics.item4",
          "dashboard.widget.communityHotTopics.item5",
        ],
      },
      {
        topic: "eventCalendar",
        badgeKey: "dashboard.widget.badge.events",
        fallbackItemKeys: [
          "dashboard.widget.eventCalendar.item1",
          "dashboard.widget.eventCalendar.item2",
          "dashboard.widget.eventCalendar.item3",
        ],
      },
      {
        topic: "riskAlertBoard",
        badgeKey: "dashboard.widget.badge.risk",
        fallbackItemKeys: [
          "dashboard.widget.riskAlertBoard.item1",
          "dashboard.widget.riskAlertBoard.item2",
          "dashboard.widget.riskAlertBoard.item3",
        ],
      },
      {
        topic: "devEcosystem",
        badgeKey: "dashboard.widget.badge.dev",
        fallbackItemKeys: [
          "dashboard.widget.devEcosystem.item1",
          "dashboard.widget.devEcosystem.item2",
          "dashboard.widget.devEcosystem.item3",
        ],
      },
    ],
    [],
  );
  const activeTopic: DashboardDetailTopic = props.focusTopic ?? "marketSummary";
  const recentWorkSummaries = useMemo(
    () =>
      [...props.stockDocumentPosts]
        .filter((post) => (post.summary ?? "").trim().length > 0)
        .sort((left, right) => new Date(right.createdAt ?? 0).getTime() - new Date(left.createdAt ?? 0).getTime())
        .slice(0, 6)
        .map((post) => String(post.summary ?? "").trim()),
    [props.stockDocumentPosts],
  );

  const cards = useMemo<DashboardCard[]>(
    () => [
      {
        id: "workflow",
        title: t("dashboard.card.workflow"),
        value: props.isGraphRunning ? t("dashboard.status.running") : t("dashboard.status.idle"),
        caption: "",
      },
      {
        id: "approvals",
        title: t("dashboard.card.approvals"),
        value: String(props.pendingApprovalsCount),
        caption:
          props.pendingApprovalsCount > 0
            ? t("modal.approvalRequired")
            : t("label.status.done"),
      },
      {
        id: "webConnect",
        title: t("dashboard.card.webConnect"),
        value: props.webBridgeRunning ? t("dashboard.status.connected") : t("dashboard.status.disconnected"),
        caption: `${props.connectedProviderCount} providers`,
      },
      {
        id: "schedules",
        title: t("dashboard.card.schedules"),
        value: `${props.enabledScheduleCount}/${props.scheduleCount}`,
        caption: t("dashboard.card.lastBatch"),
      },
    ],
    [
      props.connectedProviderCount,
      props.enabledScheduleCount,
      props.isGraphRunning,
      props.pendingApprovalsCount,
      props.scheduleCount,
      props.webBridgeRunning,
      t,
    ],
  );

  return (
    <section className="dashboard-layout dashboard-overview-layout workspace-tab-panel">
      <section className="dashboard-mosaic">
        <article className="panel-card dashboard-tile dashboard-widget-card dashboard-area-marketSummary">
          <div className="dashboard-hero-head">
            <div>
              <h3>작업 요약</h3>
              <p>최근 수행한 작업 결과를 요약합니다.</p>
            </div>
          </div>
          <div className="dashboard-hero-body">
            <section className="dashboard-hero-related">
              <p className="dashboard-widget-summary">
                최근 요약 {recentWorkSummaries.length}건
              </p>
              <div className="dashboard-hero-list-wrap">
                <ul>
                  {recentWorkSummaries.length > 0 ? (
                    recentWorkSummaries.map((summary, index) => (
                      <li key={`${summary}-${index}`}>{summary}</li>
                    ))
                  ) : (
                    <li>{t("dashboard.value.none")}</li>
                  )}
                </ul>
              </div>
            </section>
          </div>
        </article>
        {cards.map((card) => (
          <article className={`panel-card dashboard-tile dashboard-card dashboard-area-${card.id}`} key={card.id}>
            <h2>{card.title}</h2>
            <strong>{card.value}</strong>
            <p>{card.caption}</p>
          </article>
        ))}
        <aside className="panel-card dashboard-tile dashboard-area-topicGrid dashboard-topic-hub">
          <header className="dashboard-topic-hub-head">
            <h3>TOPIC HUB</h3>
            <span>{widgets.length}</span>
          </header>
          <div className="dashboard-topic-hub-list">
          {widgets
            .map((widget) =>
              (() => {
                const snapshotTopic = asDashboardTopicId(widget.topic);
                const snapshot = snapshotTopic ? props.topicSnapshots[snapshotTopic] : undefined;
                const listItems =
                  snapshot && snapshot.highlights.length > 0
                    ? snapshot.highlights
                    : widget.fallbackItemKeys.map((key) => t(key));
                return (
                  <button
                    className={`dashboard-topic-hub-item ${activeTopic === widget.topic ? "is-focus" : ""}`}
                    key={widget.topic}
                    onClick={() => props.onFocusTopic(widget.topic)}
                    type="button"
                  >
                    <div className="dashboard-widget-head">
                      <h3>{t(`dashboard.widget.${widget.topic}.title`)}</h3>
                      <span>{snapshot?.status === "degraded" ? "DEGRADED" : t(widget.badgeKey)}</span>
                    </div>
                    {snapshot?.summary ? <p className="dashboard-widget-summary">{snapshot.summary}</p> : null}
                    {listItems[0] ? <p className="dashboard-topic-hub-preview">{listItems[0]}</p> : null}
                  </button>
                );
              })(),
            )}
          </div>
        </aside>
      </section>
    </section>
  );
}
