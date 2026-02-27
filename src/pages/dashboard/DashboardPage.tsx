import { useMemo } from "react";
import { useI18n } from "../../i18n";

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
};

type DashboardCard = {
  title: string;
  value: string;
  caption: string;
};

export default function DashboardPage(props: DashboardPageProps) {
  const { t } = useI18n();

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
      <article className="panel-card dashboard-hero">
        <h1>{t("dashboard.title")}</h1>
        <p>{t("dashboard.subtitle")}</p>
      </article>

      <section className="dashboard-grid">
        {cards.map((card) => (
          <article className="panel-card dashboard-card" key={card.title}>
            <h2>{card.title}</h2>
            <strong>{card.value}</strong>
            <p>{card.caption}</p>
          </article>
        ))}
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
