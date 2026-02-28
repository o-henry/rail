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

function topicTitleKey(topic: DashboardTopicId): string {
  return `dashboard.widget.${topic}.title`;
}

export default function DashboardPage(props: DashboardPageProps) {
  const { t } = useI18n();

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

  const snapshotSummaries = useMemo(() => {
    const snapshots = Object.values(props.topicSnapshots)
      .filter((snapshot): snapshot is DashboardTopicSnapshot => Boolean(snapshot))
      .sort((left, right) => new Date(right.generatedAt).getTime() - new Date(left.generatedAt).getTime())
      .slice(0, 8);
    return snapshots.map((snapshot) => `${t(topicTitleKey(snapshot.topic))}: ${snapshot.summary}`);
  }, [props.topicSnapshots, t]);

  const fallbackFeedSummaries = useMemo(
    () =>
      [...props.stockDocumentPosts]
        .filter((post) => (post.summary ?? "").trim().length > 0)
        .sort((left, right) => new Date(right.createdAt ?? 0).getTime() - new Date(left.createdAt ?? 0).getTime())
        .slice(0, 8)
        .map((post) => String(post.summary ?? "").trim()),
    [props.stockDocumentPosts],
  );

  const workSummaryItems = snapshotSummaries.length > 0 ? snapshotSummaries : fallbackFeedSummaries;
  const terminalLines = workSummaryItems.length > 0 ? workSummaryItems : [t("dashboard.value.none")];

  const latestSnapshotText = useMemo(() => {
    const snapshots = Object.values(props.topicSnapshots).filter(
      (snapshot): snapshot is DashboardTopicSnapshot => Boolean(snapshot),
    );
    if (snapshots.length === 0) {
      return t("dashboard.value.none");
    }
    const latest = snapshots.sort((left, right) => new Date(right.generatedAt).getTime() - new Date(left.generatedAt).getTime())[0];
    const timestamp = new Date(latest.generatedAt);
    if (Number.isNaN(timestamp.getTime())) {
      return latest.generatedAt;
    }
    return timestamp.toLocaleString();
  }, [props.topicSnapshots, t]);

  return (
    <section className="dashboard-layout dashboard-terminal-layout workspace-tab-panel">
      <section className="dashboard-terminal-shell">
        <aside className="panel-card dashboard-terminal-sidebar">
          <header className="dashboard-terminal-sidebar-head">
            <strong>DASHBOARD LOG</strong>
            <span>LIVE</span>
          </header>
          <div className="dashboard-terminal-sidebar-meta">
            <p>latest sync</p>
            <b>{latestSnapshotText}</b>
          </div>
          <ul className="dashboard-terminal-log-list">
            {terminalLines.map((line, index) => (
              <li key={`${line}-${index}`}>
                <span aria-hidden="true">$</span>
                <p>{line}</p>
              </li>
            ))}
          </ul>
        </aside>

        <section className="panel-card dashboard-terminal-workspace">
          <header className="dashboard-terminal-workspace-head">
            <strong>OPERATIONS CONSOLE</strong>
            <div className="dashboard-terminal-head-meta">
              <span>{terminalLines.length} ENTRIES</span>
              <div className="dashboard-terminal-head-metrics">
                {cards.map((card) => (
                  <article className="dashboard-terminal-head-metric" key={card.id}>
                    <b>{card.title}</b>
                    <strong>{card.value}</strong>
                  </article>
                ))}
              </div>
            </div>
          </header>

          <section className="dashboard-terminal-editor">
            <div className="dashboard-terminal-filebar">
              <span>summary.log</span>
              <span>read-only</span>
            </div>
            <pre>{terminalLines.map((line, index) => `[${String(index + 1).padStart(2, "0")}] ${line}`).join("\n")}</pre>
          </section>
        </section>
      </section>
    </section>
  );
}
