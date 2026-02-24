type WebBridgeProviderSeen = {
  provider: string;
  pageUrl?: string | null;
  lastSeenAt?: string | null;
};

type WebBridgeStatus = {
  running: boolean;
  port: number;
  tokenMasked: string;
  tokenStorage?: string;
  extensionOriginAllowlistConfigured?: boolean;
  allowedExtensionOriginCount?: number;
  connectedProviders: WebBridgeProviderSeen[];
  queuedTasks: number;
  activeTasks: number;
};

type BridgePanelProps = {
  status: WebBridgeStatus;
  connectCode: string;
  busy: boolean;
  onRefreshStatus: () => void;
  onCopyConnectCode: () => void;
  onRestartBridge: () => void;
  onRotateToken: () => void;
};

function BridgePanel({
  status,
  connectCode,
  busy,
  onRefreshStatus,
  onCopyConnectCode,
  onRestartBridge,
  onRotateToken,
}: BridgePanelProps) {
  const bridgeUrl = `http://127.0.0.1:${status.port}`;

  return (
    <section className="panel-card settings-view bridge-view workspace-tab-panel">
      <section className="controls bridge-head-panel">
        <div className="web-automation-head">
          <div className="bridge-head-title-row">
            <h2>웹 연결</h2>
            <div className="bridge-help-wrap">
              <button
                aria-label="웹 연결 안내"
                className="bridge-help-trigger"
                type="button"
              >
                ?
              </button>
              <div className="bridge-help-panel">
                <div>확장과의 통신은 127.0.0.1 로컬 루프백 + Bearer 토큰으로만 허용됩니다.</div>
                <div>
                  토큰 저장 위치: {" "}
                  {status.tokenStorage === "memory" ? "메모리 세션(앱 종료 시 폐기)" : "확인 필요"}
                </div>
                <div>
                  실행 시 프롬프트 자동 주입/전송을 먼저 시도하며, 자동 전송 실패 시에만 웹 탭에서 전송 1회가
                  필요합니다.
                </div>
                <div>고급 보안(선택): `RAIL_WEB_BRIDGE_ALLOWED_EXTENSION_IDS` 설정 시 등록한 확장 ID만 허용합니다.</div>
              </div>
            </div>
          </div>
          <button
            aria-label="웹 연결 상태 동기화"
            className="settings-refresh-button settings-refresh-icon-button"
            disabled={busy}
            onClick={onRefreshStatus}
            title="웹 연결 상태 동기화"
            type="button"
          >
            <img alt="" aria-hidden="true" className="settings-refresh-icon" src="/reload.svg" />
          </button>
        </div>
        <div className="settings-badges">
          <span className={`status-tag ${status.running ? "on" : "off"}`}>
            {status.running ? "웹 연결 준비됨" : "웹 연결 중지됨"}
          </span>
          <span className="status-tag neutral">엔드포인트: {bridgeUrl}</span>
          <span
            className={`status-tag ${
              status.extensionOriginAllowlistConfigured ? "on" : "off"
            }`}
          >
            {status.extensionOriginAllowlistConfigured
              ? `확장 ID 허용 목록 ${status.allowedExtensionOriginCount ?? 0}개`
              : "토큰 보호 모드"}
          </span>
        </div>
        <div className="button-row bridge-action-row">
          <button
            className="settings-account-button"
            disabled={busy}
            onClick={onCopyConnectCode}
            type="button"
          >
            <span className="settings-button-label">연결 코드 복사</span>
          </button>
          <button
            className="settings-account-button"
            disabled={busy}
            onClick={onRestartBridge}
            type="button"
          >
            <span className="settings-button-label">웹 연결 재시작</span>
          </button>
          <button
            className="settings-account-button"
            disabled={busy}
            onClick={onRotateToken}
            type="button"
          >
            <span className="settings-button-label">토큰 재발급</span>
          </button>
        </div>
        {connectCode && (
          <div className="bridge-code-card">
            <div className="bridge-code-head">
              <span>연결 코드</span>
              <button
                className="settings-account-button"
                disabled={busy}
                onClick={onCopyConnectCode}
                type="button"
              >
                <span className="settings-button-label">다시 복사</span>
              </button>
            </div>
            <textarea
              className="bridge-code-textarea"
              onFocus={(event) => event.currentTarget.select()}
              readOnly
              rows={6}
              value={connectCode}
            />
          </div>
        )}
      </section>

      {/* <section className="controls bridge-provider-panel">
        <h2>서비스 감지 상태</h2>
        <div className="provider-hub-list">
          {WEB_PROVIDER_OPTIONS.map((provider) => {
            const row = providerSeenMap.get(provider);
            const seenLabel = row?.lastSeenAt ? formatRunDateTime(row.lastSeenAt) : "";
            return (
              <div className="provider-hub-row" key={`bridge-provider-${provider}`}>
                <div className="provider-hub-meta">
                  <span className={`provider-session-pill ${row ? "connected" : "unknown"}`}>
                    <span className="provider-session-label">{row ? "연결됨" : "대기"}</span>
                  </span>
                  <span className="provider-hub-name">{webProviderLabel(provider)}</span>
                </div>
                <div className="bridge-provider-meta">
                  {seenLabel ? <span>{seenLabel}</span> : null}
                </div>
              </div>
            );
          })}
        </div>
        <div className="bridge-provider-queue-meta">
          큐: {status.queuedTasks} · 진행 중: {status.activeTasks}
        </div>
      </section> */}

      {/* <section className="controls bridge-log-panel">
        <h2>최근 수집 이벤트</h2>
        <div className="bridge-log-list">
          {logs.length === 0 && <div className="log-empty">최근 이벤트 없음</div>}
          {logs.map((line, index) => (
            <div className="bridge-log-line" key={`bridge-log-${index}`}>
              {line}
            </div>
          ))}
        </div>
      </section> */}
    </section>
  );
}

export default BridgePanel;
