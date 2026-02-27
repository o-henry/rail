import FancySelect from "../../components/FancySelect";
import { useI18n } from "../../i18n";

type SettingsPageProps = {
  compact?: boolean;
  engineStarted: boolean;
  loginCompleted: boolean;
  authModeText: string;
  cwd: string;
  model: string;
  modelOptions: readonly string[];
  codexMultiAgentMode: string;
  codexMultiAgentModeOptions: ReadonlyArray<{ value: string; label: string }>;
  themeMode: string;
  themeModeOptions: ReadonlyArray<{ value: string; label: string }>;
  status: string;
  usageInfoText: string;
  usageResultClosed: boolean;
  running: boolean;
  isGraphRunning: boolean;
  codexAuthBusy: boolean;
  onSelectCwdDirectory: () => void;
  onSetModel: (next: string) => void;
  onSetCodexMultiAgentMode: (next: string) => void;
  onSetThemeMode: (next: string) => void;
  onStartEngine: () => void;
  onStopEngine: () => void;
  onCheckUsage: () => void;
  onToggleCodexLogin: () => void;
  onCloseUsageResult: () => void;
  onOpenRunsFolder: () => void;
};

const SHOW_THEME_MODE_SETTING = false;

export default function SettingsPage({
  compact = false,
  engineStarted,
  loginCompleted,
  authModeText,
  cwd,
  model,
  modelOptions,
  codexMultiAgentMode,
  codexMultiAgentModeOptions,
  themeMode,
  themeModeOptions,
  status,
  usageInfoText,
  usageResultClosed,
  running,
  isGraphRunning,
  codexAuthBusy,
  onSelectCwdDirectory,
  onSetModel,
  onSetCodexMultiAgentMode,
  onSetThemeMode,
  onStartEngine,
  onStopEngine,
  onCheckUsage,
  onToggleCodexLogin,
  onCloseUsageResult,
  onOpenRunsFolder,
}: SettingsPageProps) {
  const { t } = useI18n();
  return (
    <section className={`controls ${compact ? "settings-compact" : ""}`}>
      <h3>{t("settings.title")}</h3>
      {!compact && (
        <div className="settings-badges">
          <span className={`status-tag ${engineStarted ? "on" : "off"}`}>
            {engineStarted ? t("settings.engine.connected") : t("settings.engine.waiting")}
          </span>
          <span className={`status-tag ${loginCompleted ? "on" : "off"}`}>
            {loginCompleted ? t("settings.login.done") : t("settings.login.required")}
          </span>
          <span className="status-tag neutral">{t("settings.auth.prefix")}: {authModeText}</span>
        </div>
      )}
      <label>
        {t("settings.cwd")}
        <div className="settings-cwd-row">
          <input className="lowercase-path-input" readOnly value={cwd} />
          <button className="settings-cwd-picker" onClick={onSelectCwdDirectory} type="button">
            {t("settings.pickFolder")}
          </button>
        </div>
      </label>
      <label>
        {t("settings.defaultModel")}
        <FancySelect
          ariaLabel={t("settings.defaultModel")}
          className="modern-select"
          onChange={onSetModel}
          options={modelOptions.map((option) => ({ value: option, label: option }))}
          value={model}
        />
      </label>
      <label>
        {t("settings.multiAgentMode")}
        <FancySelect
          ariaLabel={t("settings.multiAgentMode")}
          className="modern-select"
          onChange={onSetCodexMultiAgentMode}
          options={[...codexMultiAgentModeOptions]}
          value={codexMultiAgentMode}
        />
      </label>
      {SHOW_THEME_MODE_SETTING && (
        <label>
          {t("settings.themeMode")}
          <FancySelect
            ariaLabel={t("settings.themeMode")}
            className="modern-select"
            onChange={onSetThemeMode}
            options={[...themeModeOptions]}
            value={themeMode}
          />
        </label>
      )}
      {!compact && (
        <div className="button-row">
          <button
            className="settings-engine-button settings-account-button"
            disabled={running || isGraphRunning}
            onClick={engineStarted ? onStopEngine : onStartEngine}
            type="button"
          >
            <span className="settings-button-label">
              {engineStarted ? t("settings.engine.stop") : t("settings.engine.start")}
            </span>
          </button>
          <button
            className="settings-usage-button settings-account-button"
            disabled={running || isGraphRunning}
            onClick={onCheckUsage}
            type="button"
          >
            <span className="settings-button-label">{t("settings.usage.check")}</span>
          </button>
          <button
            className="settings-usage-button settings-account-button"
            disabled={running || isGraphRunning || codexAuthBusy}
            onClick={onToggleCodexLogin}
            type="button"
          >
            <span className="settings-button-label">
              {codexAuthBusy
                ? t("settings.processing")
                : loginCompleted
                  ? t("settings.codex.logout")
                  : t("settings.codex.login")}
            </span>
          </button>
        </div>
      )}
      <div className="usage-method usage-method-hidden">{t("settings.recentStatus")}: {status}</div>
      {usageInfoText && !usageResultClosed && (
        <div className="usage-result">
          <div className="usage-result-head">
            <button onClick={onCloseUsageResult} type="button">
              {t("common.close")}
            </button>
          </div>
          <pre>{usageInfoText}</pre>
        </div>
      )}
      {!compact && (
        <section className="settings-run-history settings-run-history-hidden">
          <div className="settings-run-history-head">
            <h3>LOG</h3>
            <button onClick={onOpenRunsFolder} type="button">
              {t("common.open")}
            </button>
          </div>
        </section>
      )}
    </section>
  );
}
