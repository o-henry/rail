import { useMemo } from "react";
import { useI18n } from "../../i18n";
import StockWidgetChart from "./StockWidgetChart";
import { buildDashboardStockChartData, type DashboardStockDocumentPost } from "./stockWidgetChartData";
import type { DashboardDetailTopic } from "./DashboardDetailPage";

type DashboardPageProps = {
  cwd: string;
  isGraphRunning: boolean;
  pendingApprovalsCount: number;
  webBridgeRunning: boolean;
  connectedProviderCount: number;
  scheduleCount: number;
  enabledScheduleCount: number;
  onOpenDetail: (topic: DashboardDetailTopic) => void;
  stockDocumentPosts: DashboardStockDocumentPost[];
};

type DashboardCard = {
  title: string;
  value: string;
  caption: string;
};

type DashboardWidget = {
  topic: DashboardDetailTopic;
  badgeKey: string;
  itemKeys: [string, string, string];
};

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
        itemKeys: [
          "dashboard.widget.globalHeadlines.item1",
          "dashboard.widget.globalHeadlines.item2",
          "dashboard.widget.globalHeadlines.item3",
        ],
      },
      {
        topic: "industryTrendRadar",
        badgeKey: "dashboard.widget.badge.radar",
        itemKeys: [
          "dashboard.widget.industryTrendRadar.item1",
          "dashboard.widget.industryTrendRadar.item2",
          "dashboard.widget.industryTrendRadar.item3",
        ],
      },
      {
        topic: "marketSummary",
        badgeKey: "dashboard.widget.badge.market",
        itemKeys: [
          "dashboard.widget.marketSummary.item1",
          "dashboard.widget.marketSummary.item2",
          "dashboard.widget.marketSummary.item3",
        ],
      },
      {
        topic: "communityHotTopics",
        badgeKey: "dashboard.widget.badge.community",
        itemKeys: [
          "dashboard.widget.communityHotTopics.item1",
          "dashboard.widget.communityHotTopics.item2",
          "dashboard.widget.communityHotTopics.item3",
        ],
      },
      {
        topic: "reliabilityPanel",
        badgeKey: "dashboard.widget.badge.trust",
        itemKeys: [
          "dashboard.widget.reliabilityPanel.item1",
          "dashboard.widget.reliabilityPanel.item2",
          "dashboard.widget.reliabilityPanel.item3",
        ],
      },
      {
        topic: "eventCalendar",
        badgeKey: "dashboard.widget.badge.events",
        itemKeys: [
          "dashboard.widget.eventCalendar.item1",
          "dashboard.widget.eventCalendar.item2",
          "dashboard.widget.eventCalendar.item3",
        ],
      },
      {
        topic: "riskAlertBoard",
        badgeKey: "dashboard.widget.badge.risk",
        itemKeys: [
          "dashboard.widget.riskAlertBoard.item1",
          "dashboard.widget.riskAlertBoard.item2",
          "dashboard.widget.riskAlertBoard.item3",
        ],
      },
      {
        topic: "devEcosystem",
        badgeKey: "dashboard.widget.badge.dev",
        itemKeys: [
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
        title: t("dashboard.card.workflow"),
        value: props.isGraphRunning ? t("dashboard.status.running") : t("dashboard.status.idle"),
        caption: props.cwd || t("dashboard.value.none"),
      },
      {
        title: t("dashboard.card.approvals"),
        value: String(props.pendingApprovalsCount),
        caption:
          props.pendingApprovalsCount > 0
            ? t("modal.approvalRequired")
            : t("label.status.done"),
      },
      {
        title: t("dashboard.card.webConnect"),
        value: props.webBridgeRunning ? t("dashboard.status.connected") : t("dashboard.status.disconnected"),
        caption: `${props.connectedProviderCount} providers`,
      },
      {
        title: t("dashboard.card.schedules"),
        value: `${props.enabledScheduleCount}/${props.scheduleCount}`,
        caption: t("dashboard.card.lastBatch"),
      },
    ],
    [
      props.connectedProviderCount,
      props.cwd,
      props.enabledScheduleCount,
      props.isGraphRunning,
      props.pendingApprovalsCount,
      props.scheduleCount,
      props.webBridgeRunning,
      t,
    ],
  );

  return (
    <section className="dashboard-layout workspace-tab-panel">
      <section className="dashboard-grid">
        {cards.map((card) => (
          <article className="panel-card dashboard-card" key={card.title}>
            <h2>{card.title}</h2>
            <strong>{card.value}</strong>
            <p>{card.caption}</p>
          </article>
        ))}
      </section>

      <section className="dashboard-widget-grid">
        {widgets.map((widget) => (
          <button
            className="panel-card dashboard-widget-card dashboard-widget-button"
            key={widget.topic}
            onClick={() => props.onOpenDetail(widget.topic)}
            type="button"
          >
            <div className="dashboard-widget-head">
              <h3>{t(`dashboard.widget.${widget.topic}.title`)}</h3>
              <span>{t(widget.badgeKey)}</span>
            </div>
            {widget.topic === "marketSummary" ? (
              <StockWidgetChart data={stockChartData} />
            ) : (
              <ul>
                {widget.itemKeys.map((key) => (
                  <li key={key}>{t(key)}</li>
                ))}
              </ul>
            )}
          </button>
        ))}
      </section>
    </section>
  );
}
