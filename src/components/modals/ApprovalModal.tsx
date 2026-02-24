import type { ReactNode } from "react";

type ApprovalDecision = "accept" | "acceptForSession" | "decline" | "cancel";

type ApprovalModalProps = {
  open: boolean;
  requestId: number;
  sourceLabel: string;
  method: string;
  params: ReactNode;
  decisions: ApprovalDecision[];
  submitting: boolean;
  decisionLabel: (decision: ApprovalDecision) => string;
  onRespond: (decision: ApprovalDecision) => void;
};

export default function ApprovalModal({
  open,
  requestId,
  sourceLabel,
  method,
  params,
  decisions,
  submitting,
  decisionLabel,
  onRespond,
}: ApprovalModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop">
      <section className="approval-modal">
        <h2>승인 필요</h2>
        <div>요청 출처: {sourceLabel}</div>
        <div>메서드: {method}</div>
        <div>요청 ID: {requestId}</div>
        <pre>{params}</pre>
        <div className="button-row">
          {decisions.map((decision) => (
            <button disabled={submitting} key={decision} onClick={() => onRespond(decision)} type="button">
              {decisionLabel(decision)}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
