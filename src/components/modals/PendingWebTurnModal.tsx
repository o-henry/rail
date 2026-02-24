import type { PointerEvent as ReactPointerEvent, RefObject } from "react";

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
        <h4>웹 응답 입력 필요</h4>
        <span>➠</span>
      </div>
      <div>노드: {nodeId}</div>
      <div>서비스: {providerLabel}</div>
      <div>수집 모드: {modeLabel}</div>
      <div className="button-row">
        <button onClick={onOpenProviderWindow} type="button">
          서비스 창 열기
        </button>
        <button onClick={onCopyPrompt} type="button">
          프롬프트 복사
        </button>
      </div>
      <div className="web-turn-prompt">{prompt}</div>
      <label>
        붙여넣기
        <textarea onChange={(e) => onChangeResponseDraft(e.currentTarget.value)} rows={8} value={responseDraft} />
      </label>
      <div className="button-row">
        <button onClick={onSubmit} type="button">
          입력 완료
        </button>
        <button onClick={onDismiss} type="button">
          취소
        </button>
        <button onClick={onCancelRun} type="button">
          실행 취소
        </button>
      </div>
    </section>
  );
}
