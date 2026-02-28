import { useMemo } from "react";
import { type DashboardTopicId, type DashboardTopicSnapshot } from "../../features/dashboard/intelligence";
import { useI18n } from "../../i18n";

export type DashboardDetailTopic =
  | "globalHeadlines"
  | "marketSummary"
  | "industryTrendRadar"
  | "communityHotTopics"
  | "devCommunityHotTopics"
  | "paperResearch"
  | "reliabilityPanel"
  | "eventCalendar"
  | "riskAlertBoard"
  | "devEcosystem";

type DashboardDetailPageProps = {
  topic: DashboardDetailTopic;
  snapshot?: DashboardTopicSnapshot;
  onBack: () => void;
  onOpenFeed: () => void;
};

function asDashboardTopicId(topic: DashboardDetailTopic): DashboardTopicId | null {
  if (
    topic === "marketSummary" ||
    topic === "globalHeadlines" ||
    topic === "industryTrendRadar" ||
    topic === "communityHotTopics" ||
    topic === "devCommunityHotTopics" ||
    topic === "paperResearch" ||
    topic === "eventCalendar" ||
    topic === "riskAlertBoard" ||
    topic === "devEcosystem"
  ) {
    return topic;
  }
  return null;
}

export default function DashboardDetailPage(props: DashboardDetailPageProps) {
  const { t } = useI18n();
  const topicAsSnapshot = asDashboardTopicId(props.topic);
  const snapshot = topicAsSnapshot ? props.snapshot : undefined;

  const fallbackSections = useMemo<string[]>(() => {
    const key = props.topic;
    return [
      t(`dashboard.detail.${key}.section1`),
      t(`dashboard.detail.${key}.section2`),
      t(`dashboard.detail.${key}.section3`),
    ];
  }, [props.topic, t]);

  const fallbackSummaryItems = useMemo<string[]>(() => {
    const key = props.topic;
    const itemKeys = [
      `dashboard.widget.${key}.item1`,
      `dashboard.widget.${key}.item2`,
      `dashboard.widget.${key}.item3`,
      `dashboard.widget.${key}.item4`,
      `dashboard.widget.${key}.item5`,
    ];
    return itemKeys
      .map((itemKey) => ({ key: itemKey, value: t(itemKey) }))
      .filter((item) => item.value !== item.key)
      .map((item) => item.value);
  }, [props.topic, t]);

  const summaryItems = snapshot?.highlights.length ? snapshot.highlights : fallbackSummaryItems;
  const riskItems = snapshot?.risks.length ? snapshot.risks : [];
  const eventItems = snapshot?.events.length ? snapshot.events : [];
  const referenceItems = snapshot?.references.length ? snapshot.references : [];

  return (
    <section className="dashboard-layout dashboard-detail-layout workspace-tab-panel">
      <article className="panel-card dashboard-detail-shell">
        <div className="dashboard-detail-main">
          <header className="dashboard-detail-head">
            <button className="dashboard-back-button" onClick={props.onBack} type="button">
              {t("dashboard.detail.back")}
            </button>
            <div>
              <h2>{t(`dashboard.widget.${props.topic}.title`)}</h2>
              <p>{t(`dashboard.detail.${props.topic}.subtitle`)}</p>
            </div>
          </header>

          <section className="dashboard-detail-related-grid">
            {referenceItems.length > 0
              ? referenceItems.map((item, index) => (
                  <article className="dashboard-detail-related-card" key={`${item.url}-${index}`}>
                    <span>{`0${index + 1}`}</span>
                    <p>
                      <strong>{item.title}</strong>
                      <br />
                      {item.source}
                      {item.publishedAt ? ` · ${item.publishedAt}` : ""}
                      <br />
                      <a href={item.url} onClick={(event) => event.stopPropagation()} target="_blank" rel="noreferrer">
                        {item.url}
                      </a>
                    </p>
                  </article>
                ))
              : fallbackSections.map((item, index) => (
                  <article className="dashboard-detail-related-card" key={item}>
                    <span>{`0${index + 1}`}</span>
                    <p>{item}</p>
                  </article>
                ))}
          </section>
        </div>

        <aside className="dashboard-detail-summary">
          <div className="dashboard-detail-summary-head">
            <h3>{t(`dashboard.widget.${props.topic}.title`)}</h3>
            <p>{snapshot?.status === "degraded" ? "DEGRADED" : t("dashboard.detail.cta.label")}</p>
          </div>
          {snapshot?.summary ? <p className="dashboard-detail-summary-text">{snapshot.summary}</p> : null}
          <h4 className="dashboard-detail-subhead">Highlights</h4>
          <ul>
            {summaryItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          {riskItems.length > 0 ? (
            <>
              <h4 className="dashboard-detail-subhead">Risks</h4>
              <ul>
                {riskItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </>
          ) : null}
          {eventItems.length > 0 ? (
            <>
              <h4 className="dashboard-detail-subhead">Events</h4>
              <ul>
                {eventItems.map((item, index) => (
                  <li key={`${item.title}-${index}`}>
                    {item.title}
                    {item.date ? ` (${item.date})` : ""}
                    {item.note ? ` - ${item.note}` : ""}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <div className="dashboard-actions">
            <button onClick={props.onOpenFeed} type="button">
              {t("dashboard.cta.feed")}
            </button>
          </div>
        </aside>
      </article>
    </section>
  );
}
