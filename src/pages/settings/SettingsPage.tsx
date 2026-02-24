import FancySelect from "../../components/FancySelect";

type SettingsPageProps = {
  compact?: boolean;
  engineStarted: boolean;
  loginCompleted: boolean;
  authModeText: string;
  cwd: string;
  model: string;
  modelOptions: readonly string[];
  status: string;
  usageInfoText: string;
  usageResultClosed: boolean;
  running: boolean;
  isGraphRunning: boolean;
  codexAuthBusy: boolean;
  onSelectCwdDirectory: () => void;
  onSetModel: (next: string) => void;
  onStartEngine: () => void;
  onStopEngine: () => void;
  onCheckUsage: () => void;
  onToggleCodexLogin: () => void;
  onCloseUsageResult: () => void;
  onOpenRunsFolder: () => void;
};

export default function SettingsPage({
  compact = false,
  engineStarted,
  loginCompleted,
  authModeText,
  cwd,
  model,
  modelOptions,
  status,
  usageInfoText,
  usageResultClosed,
  running,
  isGraphRunning,
  codexAuthBusy,
  onSelectCwdDirectory,
  onSetModel,
  onStartEngine,
  onStopEngine,
  onCheckUsage,
  onToggleCodexLogin,
  onCloseUsageResult,
  onOpenRunsFolder,
}: SettingsPageProps) {
  return (
    <section className={`controls ${compact ? "settings-compact" : ""}`}>
      <h3>엔진 및 계정</h3>
      {!compact && (
        <div className="settings-badges">
          <span className={`status-tag ${engineStarted ? "on" : "off"}`}>
            {engineStarted ? "엔진 연결됨" : "엔진 대기"}
          </span>
          <span className={`status-tag ${loginCompleted ? "on" : "off"}`}>
            {loginCompleted ? "로그인 완료" : "로그인 필요"}
          </span>
          <span className="status-tag neutral">인증: {authModeText}</span>
        </div>
      )}
      <label>
        작업 경로(CWD)
        <div className="settings-cwd-row">
          <input className="lowercase-path-input" readOnly value={cwd} />
          <button className="settings-cwd-picker" onClick={onSelectCwdDirectory} type="button">
            폴더 선택
          </button>
        </div>
      </label>
      <label>
        기본 모델
        <FancySelect
          ariaLabel="기본 모델"
          className="modern-select"
          onChange={onSetModel}
          options={modelOptions.map((option) => ({ value: option, label: option }))}
          value={model}
        />
      </label>
      {!compact && (
        <div className="button-row">
          <button
            className="settings-engine-button settings-account-button"
            disabled={running || isGraphRunning}
            onClick={engineStarted ? onStopEngine : onStartEngine}
            type="button"
          >
            <span className="settings-button-label">{engineStarted ? "엔진 중지" : "엔진 시작"}</span>
          </button>
          <button
            className="settings-usage-button settings-account-button"
            disabled={running || isGraphRunning}
            onClick={onCheckUsage}
            type="button"
          >
            <span className="settings-button-label">사용량 확인</span>
          </button>
          <button
            className="settings-usage-button settings-account-button"
            disabled={running || isGraphRunning || codexAuthBusy}
            onClick={onToggleCodexLogin}
            type="button"
          >
            <span className="settings-button-label">
              {codexAuthBusy ? "처리 중..." : loginCompleted ? "CODEX 로그아웃" : "CODEX 로그인"}
            </span>
          </button>
        </div>
      )}
      <div className="usage-method usage-method-hidden">최근 상태: {status}</div>
      {usageInfoText && !usageResultClosed && (
        <div className="usage-result">
          <div className="usage-result-head">
            <button onClick={onCloseUsageResult} type="button">
              닫기
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
              열기
            </button>
          </div>
        </section>
      )}
    </section>
  );
}
