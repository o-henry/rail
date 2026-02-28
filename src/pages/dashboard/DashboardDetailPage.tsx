import { useMemo } from "react";
import { useI18n } from "../../i18n";

export type DashboardDetailTopic =
  | "globalHeadlines"
  | "marketSummary"
  | "industryTrendRadar"
  | "communityHotTopics"
  | "reliabilityPanel"
  | "eventCalendar"
  | "riskAlertBoard"
  | "devEcosystem";

type DashboardDetailPageProps = {
  topic: DashboardDetailTopic;
  onBack: () => void;
  onOpenFeed: () => void;
};

export default function DashboardDetailPage(props: DashboardDetailPageProps) {
  const { t } = useI18n();

  const sections = useMemo<string[]>(() => {
    const key = props.topic;
    return [
      t(`dashboard.detail.${key}.section1`),
      t(`dashboard.detail.${key}.section2`),
      t(`dashboard.detail.${key}.section3`),
    ];
  }, [props.topic, t]);

  const summaryItems = useMemo<string[]>(() => {
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
            {sections.map((item, index) => (
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
            <p>{t("dashboard.detail.cta.label")}</p>
          </div>
          <ul>
            {summaryItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
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
