import { type ChangeEvent, useRef } from "react";
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
  backgroundImageName: string;
  hasBackgroundImage: boolean;
  backgroundImageOpacity: number;
  onSelectCwdDirectory: () => void;
  onSetModel: (next: string) => void;
  onSetCodexMultiAgentMode: (next: string) => void;
  onSetThemeMode: (next: string) => void;
  onSelectBackgroundImage: (file: File | null) => void;
  onClearBackgroundImage: () => void;
  onSetBackgroundImageOpacity: (nextOpacity: number) => void;
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
  backgroundImageName,
  hasBackgroundImage,
  backgroundImageOpacity,
  onSelectCwdDirectory,
  onSetModel,
  onSetCodexMultiAgentMode,
  onSetThemeMode,
  onSelectBackgroundImage,
  onClearBackgroundImage,
  onSetBackgroundImageOpacity,
  onCheckUsage,
  onToggleCodexLogin,
  onCloseUsageResult,
  onOpenRunsFolder,
}: SettingsPageProps) {
  const { t } = useI18n();
  const backgroundFileInputRef = useRef<HTMLInputElement | null>(null);

  const onBackgroundFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    onSelectBackgroundImage(nextFile);
    event.currentTarget.value = "";
  };

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
      <label>
        배경 이미지
        <div className="settings-background-row">
          <input
            className="settings-background-name"
            readOnly
            value={
              hasBackgroundImage
                ? backgroundImageName || "사용자 이미지 적용됨"
                : "선택된 이미지 없음"
            }
          />
          <button
            className="settings-cwd-picker"
            onClick={() => backgroundFileInputRef.current?.click()}
            type="button"
          >
            {hasBackgroundImage ? "이미지 변경" : "이미지 선택"}
          </button>
          <button
            className="settings-cwd-picker"
            disabled={!hasBackgroundImage}
            onClick={onClearBackgroundImage}
            type="button"
          >
            배경 제거
          </button>
        </div>
        <input
          accept="image/*"
          className="settings-background-file-input"
          onChange={onBackgroundFileChange}
          ref={backgroundFileInputRef}
          type="file"
        />
      </label>
      <label>
        배경 불투명도 ({Math.round(backgroundImageOpacity * 100)}%)
        <input
          className="settings-opacity-slider"
          disabled={!hasBackgroundImage}
          max="1"
          min="0"
          onChange={(event) => onSetBackgroundImageOpacity(Number(event.currentTarget.value))}
          step="0.05"
          type="range"
          value={backgroundImageOpacity}
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
