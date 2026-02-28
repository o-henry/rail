import FancySelect from "../../components/FancySelect";
import { useI18n } from "../../i18n";
import { DASHBOARD_TOPIC_IDS, type DashboardAgentConfigMap, type DashboardTopicId, type DashboardTopicRunState } from "../../features/dashboard/intelligence";

type DashboardIntelligenceSettingsProps = {
  config: DashboardAgentConfigMap;
  runStateByTopic: Record<DashboardTopicId, DashboardTopicRunState>;
  modelOptions: ReadonlyArray<{ value: string; label: string }>;
  disabled?: boolean;
  onToggleTopic: (topic: DashboardTopicId, enabled: boolean) => void;
  onSetTopicModel: (topic: DashboardTopicId, model: string) => void;
  onSetTopicCadence: (topic: DashboardTopicId, cadenceHours: number) => void;
  onRunTopic: (topic: DashboardTopicId) => void;
  onRunAll: () => void;
  onRunCrawlerOnly: () => void;
};

export default function DashboardIntelligenceSettings(props: DashboardIntelligenceSettingsProps) {
  const { t } = useI18n();

  return (
    <section className="settings-dashboard-intelligence">
      <header className="settings-dashboard-intelligence-head">
        <div>
          <p>{t("settings.dashboardIntelligence.description")}</p>
        </div>
        <div className="settings-dashboard-intelligence-actions">
          <button disabled={props.disabled} onClick={props.onRunCrawlerOnly} type="button">
            {t("settings.dashboardIntelligence.runCrawlerOnly")}
          </button>
          <button disabled={props.disabled} onClick={props.onRunAll} type="button">
            {t("settings.dashboardIntelligence.runAll")}
          </button>
        </div>
      </header>
      <div className="settings-dashboard-intelligence-list">
        {DASHBOARD_TOPIC_IDS.map((topic) => {
          const row = props.config[topic];
          const runState = props.runStateByTopic[topic];
          return (
            <article className="settings-dashboard-topic-row" key={topic}>
              <div className="settings-dashboard-topic-title">
                <strong>{t(`dashboard.widget.${topic}.title`)}</strong>
                {runState?.lastError ? <p>{runState.lastError}</p> : null}
              </div>

              <label className="settings-dashboard-topic-toggle">
                <input
                  checked={row.enabled}
                  disabled={props.disabled}
                  onChange={(event) => props.onToggleTopic(topic, event.currentTarget.checked)}
                  type="checkbox"
                />
                <span
                  aria-hidden="true"
                  className={`settings-dashboard-toggle-box ${row.enabled ? "is-on" : ""}`}
                />
              </label>

              <FancySelect
                ariaLabel={`${t("dashboard.widget." + topic + ".title")} model`}
                className="modern-select settings-dashboard-topic-select"
                onChange={(next) => props.onSetTopicModel(topic, next)}
                options={[...props.modelOptions]}
                value={row.model}
              />

              <label className="settings-dashboard-topic-cadence">
                <span>{t("settings.dashboardIntelligence.cadence")}</span>
                <input
                  disabled={props.disabled}
                  min={1}
                  max={168}
                  onChange={(event) => props.onSetTopicCadence(topic, Number(event.currentTarget.value))}
                  type="number"
                  value={row.cadenceHours}
                />
              </label>

              <button
                disabled={props.disabled || runState?.running}
                onClick={() => props.onRunTopic(topic)}
                type="button"
              >
                {runState?.running
                  ? t("settings.dashboardIntelligence.running")
                  : t("settings.dashboardIntelligence.runTopic")}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
