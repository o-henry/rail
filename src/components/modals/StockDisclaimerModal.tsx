import { useI18n } from "../../i18n";

type StockDisclaimerModalProps = {
  open: boolean;
  checked: boolean;
  onChangeChecked: (next: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function StockDisclaimerModal({
  open,
  checked,
  onChangeChecked,
  onConfirm,
  onCancel,
}: StockDisclaimerModalProps) {
  const { t } = useI18n();
  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop">
      <section className="approval-modal web-turn-modal stock-disclaimer-modal">
        <h2>{t("modal.stockDisclaimer.title")}</h2>
        <ul>
          <li>{t("modal.stockDisclaimer.notAdvice")}</li>
          <li>{t("modal.stockDisclaimer.infoOnly")}</li>
          <li>{t("modal.stockDisclaimer.userResponsibility")}</li>
        </ul>
        <label className="stock-disclaimer-agree">
          <input checked={checked} onChange={(e) => onChangeChecked(e.currentTarget.checked)} type="checkbox" />
          <span>{t("modal.stockDisclaimer.agree")}</span>
        </label>
        <div className="button-row">
          <button disabled={!checked} onClick={onConfirm} type="button">
            {t("modal.stockDisclaimer.confirm")}
          </button>
          <button onClick={onCancel} type="button">
            {t("common.cancel")}
          </button>
        </div>
      </section>
    </div>
  );
}
