import { useMemo } from "react";
import { type DashboardTopicId, type DashboardTopicSnapshot } from "../../features/dashboard/intelligence";
import { useI18n } from "../../i18n";
import StockWidgetChart from "./StockWidgetChart";
import { buildDashboardStockChartData, type DashboardStockDocumentPost } from "./stockWidgetChartData";
import type { DashboardDetailTopic } from "./DashboardDetailPage";

type DashboardPageProps = {
  isGraphRunning: boolean;
  pendingApprovalsCount: number;
  webBridgeRunning: boolean;
  connectedProviderCount: number;
  scheduleCount: number;
  enabledScheduleCount: number;
  onOpenDetail: (topic: DashboardDetailTopic) => void;
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
  const stockChartData = useMemo(
    () => buildDashboardStockChartData(props.stockDocumentPosts),
    [props.stockDocumentPosts],
  );
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
        {cards.map((card) => (
          <article className={`panel-card dashboard-tile dashboard-card dashboard-area-${card.id}`} key={card.id}>
            <h2>{card.title}</h2>
            <strong>{card.value}</strong>
            <p>{card.caption}</p>
          </article>
        ))}
        {widgets.map((widget) => (
          (() => {
            const snapshotTopic = asDashboardTopicId(widget.topic);
            const snapshot = snapshotTopic ? props.topicSnapshots[snapshotTopic] : undefined;
            const listItems =
              snapshot && snapshot.highlights.length > 0
                ? snapshot.highlights
                : widget.fallbackItemKeys.map((key) => t(key));
            return (
              <button
                className={`panel-card dashboard-tile dashboard-widget-card dashboard-widget-button dashboard-area-${widget.topic}`}
                key={widget.topic}
                onClick={() => props.onOpenDetail(widget.topic)}
                type="button"
              >
                <div className="dashboard-widget-head">
                  <h3>{t(`dashboard.widget.${widget.topic}.title`)}</h3>
                  <span>{snapshot?.status === "degraded" ? "DEGRADED" : t(widget.badgeKey)}</span>
                </div>
                {snapshot?.summary ? <p className="dashboard-widget-summary">{snapshot.summary}</p> : null}
                {widget.topic === "marketSummary" && stockChartData ? (
                  <StockWidgetChart data={stockChartData} />
                ) : (
                  <ul>
                    {listItems.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </button>
            );
          })()
        ))}
      </section>
    </section>
  );
}
