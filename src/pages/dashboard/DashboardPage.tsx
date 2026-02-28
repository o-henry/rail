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

  return (
    <section className="dashboard-layout dashboard-overview-layout workspace-tab-panel">
      <section className="dashboard-mosaic">
        <article className="panel-card dashboard-tile dashboard-widget-card dashboard-area-marketSummary">
          <div className="dashboard-hero-head">
            <div>
              <h3>작업 요약</h3>
              <p>데이터 수집 및 분석 결과를 최신 순으로 표시합니다.</p>
            </div>
          </div>
          <div className="dashboard-hero-body">
            <section className="dashboard-hero-related">
              <p className="dashboard-widget-summary">요약 항목 {workSummaryItems.length}건</p>
              <div className="dashboard-hero-list-wrap">
                <ul>
                  {workSummaryItems.length > 0 ? (
                    workSummaryItems.map((summary, index) => (
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
      </section>
    </section>
  );
}
