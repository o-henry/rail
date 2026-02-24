import { useI18n } from "../../i18n";

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
  const { t } = useI18n();
  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop">
      <section className="approval-modal web-turn-modal">
        <h2>{t("modal.loginRequired")}</h2>
        <div>{t("modal.node")}: {nodeId}</div>
        <div>{t("modal.service")}: {providerLabel}</div>
        <div>{reason}</div>
        <div className="button-row">
          <button onClick={onOpenProviderSession} type="button">
            {t("modal.openLoginSession")}
          </button>
          <button onClick={onContinueAfterLogin} type="button">
            {t("modal.continueAfterLogin")}
          </button>
          <button onClick={onCancel} type="button">
            {t("common.cancel")}
          </button>
        </div>
      </section>
    </div>
  );
}
