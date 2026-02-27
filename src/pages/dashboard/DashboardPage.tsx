import { useMemo } from "react";
import { useI18n } from "../../i18n";
import StockWidgetChart from "./StockWidgetChart";
import { buildDashboardStockChartData, type DashboardStockDocumentPost } from "./stockWidgetChartData";

type DashboardPageProps = {
  cwd: string;
  isGraphRunning: boolean;
  pendingApprovalsCount: number;
  webBridgeRunning: boolean;
  connectedProviderCount: number;
  scheduleCount: number;
  enabledScheduleCount: number;
  lastBatchSummary: string;
  onOpenWorkflow: () => void;
  onOpenFeed: () => void;
  onOpenBridge: () => void;
  onOpenSettings: () => void;
  onOpenDetail: (topic: "news" | "trend" | "stock") => void;
  stockDocumentPosts: DashboardStockDocumentPost[];
};

type DashboardCard = {
  title: string;
  value: string;
  caption: string;
};

export default function DashboardPage(props: DashboardPageProps) {
  const { t } = useI18n();
  const stockChartData = useMemo(
    () => buildDashboardStockChartData(props.stockDocumentPosts),
    [props.stockDocumentPosts],
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
        <button
          className="panel-card dashboard-widget-card dashboard-widget-button"
          onClick={() => props.onOpenDetail("news")}
          type="button"
        >
          <div className="dashboard-widget-head">
            <h3>{t("dashboard.widget.news.title")}</h3>
            <span>{t("dashboard.widget.badge.live")}</span>
          </div>
          <ul>
            <li>{t("dashboard.widget.news.item1")}</li>
            <li>{t("dashboard.widget.news.item2")}</li>
            <li>{t("dashboard.widget.news.item3")}</li>
          </ul>
        </button>
        <button
          className="panel-card dashboard-widget-card dashboard-widget-button"
          onClick={() => props.onOpenDetail("trend")}
          type="button"
        >
          <div className="dashboard-widget-head">
            <h3>{t("dashboard.widget.trend.title")}</h3>
            <span>{t("dashboard.widget.badge.signal")}</span>
          </div>
          <ul>
            <li>{t("dashboard.widget.trend.item1")}</li>
            <li>{t("dashboard.widget.trend.item2")}</li>
            <li>{t("dashboard.widget.trend.item3")}</li>
          </ul>
        </button>
        <button
          className="panel-card dashboard-widget-card dashboard-widget-button"
          onClick={() => props.onOpenDetail("stock")}
          type="button"
        >
          <div className="dashboard-widget-head">
            <h3>{t("dashboard.widget.stock.title")}</h3>
            <span>{t("dashboard.widget.badge.market")}</span>
          </div>
          <StockWidgetChart data={stockChartData} />
        </button>
      </section>

      <article className="panel-card dashboard-footer">
        <div className="dashboard-last-batch">
          <span>{t("dashboard.card.lastBatch")}</span>
          <strong>{props.lastBatchSummary}</strong>
        </div>
        <div className="dashboard-actions">
          <button onClick={props.onOpenWorkflow} type="button">{t("dashboard.cta.workflow")}</button>
          <button onClick={props.onOpenFeed} type="button">{t("dashboard.cta.feed")}</button>
          <button onClick={props.onOpenBridge} type="button">{t("dashboard.cta.bridge")}</button>
          <button onClick={props.onOpenSettings} type="button">{t("dashboard.cta.settings")}</button>
        </div>
      </article>
    </section>
  );
}
