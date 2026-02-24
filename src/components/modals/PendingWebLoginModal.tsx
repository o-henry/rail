type PendingWebLoginModalProps = {
  open: boolean;
  nodeId: string;
  providerLabel: string;
  reason: string;
  onOpenProviderSession: () => void;
  onContinueAfterLogin: () => void;
  onCancel: () => void;
};

export default function PendingWebLoginModal({
  open,
  nodeId,
  providerLabel,
  reason,
  onOpenProviderSession,
  onContinueAfterLogin,
  onCancel,
}: PendingWebLoginModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop">
      <section className="approval-modal web-turn-modal">
        <h2>로그인이 필요합니다</h2>
        <div>노드: {nodeId}</div>
        <div>서비스: {providerLabel}</div>
        <div>{reason}</div>
        <div className="button-row">
          <button onClick={onOpenProviderSession} type="button">
            로그인 세션 열기
          </button>
          <button onClick={onContinueAfterLogin} type="button">
            로그인 완료 후 계속
          </button>
          <button onClick={onCancel} type="button">
            취소
          </button>
        </div>
      </section>
    </div>
  );
}
