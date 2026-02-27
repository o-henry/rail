import { useMemo } from "react";
import { useI18n } from "../../i18n";

export type DashboardDetailTopic = "news" | "trend" | "stock";

type DashboardDetailPageProps = {
  topic: DashboardDetailTopic;
  onBack: () => void;
  onOpenFeed: () => void;
};

export default function DashboardDetailPage(props: DashboardDetailPageProps) {
  const { t } = useI18n();

  const sections = useMemo(() => {
    const key = props.topic;
    return [
      t(`dashboard.detail.${key}.section1`),
      t(`dashboard.detail.${key}.section2`),
      t(`dashboard.detail.${key}.section3`),
    ];
  }, [props.topic, t]);

  return (
    <section className="dashboard-layout workspace-tab-panel">
      <article className="panel-card dashboard-detail-head">
        <button className="dashboard-back-button" onClick={props.onBack} type="button">
          {t("dashboard.detail.back")}
        </button>
        <div>
          <h2>{t(`dashboard.widget.${props.topic}.title`)}</h2>
          <p>{t(`dashboard.detail.${props.topic}.subtitle`)}</p>
        </div>
      </article>

      <article className="panel-card dashboard-detail-body">
        <ol>
          {sections.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </article>

      <article className="panel-card dashboard-footer">
        <div className="dashboard-last-batch">
          <span>{t("dashboard.detail.cta.label")}</span>
          <strong>{t("dashboard.detail.cta.desc")}</strong>
        </div>
        <div className="dashboard-actions">
          <button onClick={props.onOpenFeed} type="button">
            {t("dashboard.cta.feed")}
          </button>
        </div>
      </article>
    </section>
  );
}
