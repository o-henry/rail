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
  const activeTopic: DashboardDetailTopic = props.focusTopic ?? "marketSummary";
  const activeTopicId = asDashboardTopicId(activeTopic);
  const activeSnapshot = activeTopicId ? props.topicSnapshots[activeTopicId] : undefined;
  const activeWidget = widgets.find((widget) => widget.topic === activeTopic);
  const activeFallbackHighlights = activeWidget
    ? activeWidget.fallbackItemKeys.map((key) => t(key))
    : [];
  const activeHighlights = activeSnapshot?.highlights.length
    ? activeSnapshot.highlights
    : activeFallbackHighlights;
  const activeSections = [
    t(`dashboard.detail.${activeTopic}.section1`),
    t(`dashboard.detail.${activeTopic}.section2`),
    t(`dashboard.detail.${activeTopic}.section3`),
  ].filter((line) => !line.includes(`dashboard.detail.${activeTopic}.section`));

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
              <h3>{t(`dashboard.widget.${activeTopic}.title`)}</h3>
              <p>
                {activeSnapshot?.status === "degraded"
                  ? "DEGRADED SNAPSHOT"
                  : t(`dashboard.detail.${activeTopic}.subtitle`)}
              </p>
            </div>
            {activeTopic !== "marketSummary" ? (
              <button className="dashboard-hero-reset" onClick={() => props.onFocusTopic("marketSummary")} type="button">
                {t("dashboard.widget.marketSummary.title")}
              </button>
            ) : null}
          </div>
          <div className="dashboard-hero-body">
            <section className="dashboard-hero-related">
              {activeSnapshot?.summary ? <p className="dashboard-widget-summary">{activeSnapshot.summary}</p> : null}
              {activeTopic === "marketSummary" && stockChartData ? (
                <StockWidgetChart data={stockChartData} />
              ) : (
                <div className="dashboard-hero-list-wrap">
                  <ul>
                    {(activeSnapshot?.references.length ? activeSnapshot.references : activeSections).map((item, index) => {
                      if (typeof item === "string") {
                        return <li key={`section-${index}`}>{item}</li>;
                      }
                      return (
                        <li key={item.url}>
                          <strong>{item.title}</strong> · {item.source}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </section>
            <aside className="dashboard-hero-summary">
              <h4>{t("dashboard.detail.cta.label")}</h4>
              <ul>
                {activeHighlights.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              {activeSnapshot?.risks.length ? (
                <>
                  <h4>Risks</h4>
                  <ul>
                    {activeSnapshot.risks.map((risk) => (
                      <li key={risk}>{risk}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </aside>
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
            <span>{widgets.filter((widget) => widget.topic !== "marketSummary").length}</span>
          </header>
          <div className="dashboard-topic-hub-list">
          {widgets
            .filter((widget) => widget.topic !== "marketSummary")
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
