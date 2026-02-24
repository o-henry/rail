import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { useI18n } from "../../i18n";

type PendingWebTurnModalProps = {
  open: boolean;
  nodeId: string;
  providerLabel: string;
  modeLabel: string;
  prompt: string;
  responseDraft: string;
  dragging: boolean;
  position: { x: number; y: number };
  panelRef: RefObject<HTMLElement | null>;
  onDragStart: (event: ReactPointerEvent<HTMLElement>) => void;
  onChangeResponseDraft: (next: string) => void;
  onOpenProviderWindow: () => void;
  onCopyPrompt: () => void;
  onSubmit: () => void;
  onDismiss: () => void;
  onCancelRun: () => void;
};

export default function PendingWebTurnModal({
  open,
  nodeId,
  providerLabel,
  modeLabel,
  prompt,
  responseDraft,
  dragging,
  position,
  panelRef,
  onDragStart,
  onChangeResponseDraft,
  onOpenProviderWindow,
  onCopyPrompt,
  onSubmit,
  onDismiss,
  onCancelRun,
}: PendingWebTurnModalProps) {
  const { t } = useI18n();
  if (!open) {
    return null;
  }

  return (
    <section
      className={`approval-modal web-turn-modal web-turn-floating${dragging ? " is-dragging" : ""}`}
      ref={panelRef}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      <div className="web-turn-drag-handle" onPointerDown={onDragStart}>
        <h4>{t("modal.webInput.title")}</h4>
        <span>➠</span>
      </div>
      <div>{t("modal.node")}: {nodeId}</div>
      <div>{t("modal.service")}: {providerLabel}</div>
      <div>{t("modal.collectMode")}: {modeLabel}</div>
      <div className="button-row">
        <button onClick={onOpenProviderWindow} type="button">
          {t("modal.openServiceWindow")}
        </button>
        <button onClick={onCopyPrompt} type="button">
          {t("modal.copyPrompt")}
        </button>
      </div>
      <div className="web-turn-prompt">{prompt}</div>
      <label>
        {t("modal.paste")}
        <textarea onChange={(e) => onChangeResponseDraft(e.currentTarget.value)} rows={8} value={responseDraft} />
      </label>
      <div className="button-row">
        <button onClick={onSubmit} type="button">
          {t("modal.inputDone")}
        </button>
        <button onClick={onDismiss} type="button">
          {t("common.cancel")}
        </button>
        <button onClick={onCancelRun} type="button">
          {t("modal.cancelRun")}
        </button>
      </div>
    </section>
  );
}
