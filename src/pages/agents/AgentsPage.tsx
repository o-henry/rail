import { useI18n } from "../../i18n";

type AgentsPageProps = {
  onQuickAction: (prompt: string) => void;
};

const QUICK_ACTION_KEYS = ["agents.quick.snake", "agents.quick.fixBug", "agents.quick.summary"] as const;

export default function AgentsPage({ onQuickAction }: AgentsPageProps) {
  const { t } = useI18n();

  return (
    <section className="agents-layout workspace-tab-panel">
      <header className="agents-header">
        <h2>{t("agents.thread.new")}</h2>
        <div className="agents-header-actions">
          <button type="button">{t("agents.action.open")}</button>
          <button type="button">{t("agents.action.commit")}</button>
        </div>
      </header>

      <article className="panel-card agents-hero">
        <div className="agents-hero-icon" aria-hidden="true">✺</div>
        <h1>{t("agents.hero.title")}</h1>
        <p>{t("agents.hero.project")}</p>
      </article>

      <section className="agents-quick-grid">
        {QUICK_ACTION_KEYS.map((key) => (
          <button
            key={key}
            className="agents-quick-card"
            onClick={() => onQuickAction(t(key))}
            type="button"
          >
            {t(key)}
          </button>
        ))}
      </section>

      <div className="agents-input-shell">
        <input
          aria-label={t("agents.input.placeholder")}
          placeholder={t("agents.input.placeholder")}
          readOnly
          value=""
        />
      </div>
    </section>
  );
}
