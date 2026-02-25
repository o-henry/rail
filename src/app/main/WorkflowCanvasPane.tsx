import type { Dispatch, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, RefObject, SetStateAction, WheelEvent as ReactWheelEvent } from "react";
import { useI18n } from "../../i18n";
import type { MarqueeSelection, NodeRunState, PendingWebTurn } from "./types";
import type { GraphNode, NodeAnchorSide, NodeExecutionStatus } from "../../features/workflow/types";

type EdgeLine = {
  key: string;
  edgeKey: string;
  readOnly?: boolean;
  path: string;
  controlPoint: { x: number; y: number };
};

type WorkflowCanvasPaneProps = {
  panMode: boolean;
  onCanvasKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  onCanvasMouseDown: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onCanvasMouseMove: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onCanvasMouseUp: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onCanvasWheel: (event: ReactWheelEvent<HTMLDivElement>) => void;
  graphCanvasRef: RefObject<HTMLDivElement | null>;
  boundedStageWidth: number;
  boundedStageHeight: number;
  canvasZoom: number;
  stageInsetX: number;
  stageInsetY: number;
  edgeLines: EdgeLine[];
  selectedEdgeKey: string;
  setNodeSelection: (nodeIds: string[], focusedNodeId?: string) => void;
  setSelectedEdgeKey: (edgeKey: string) => void;
  onEdgeDragStart: (event: ReactMouseEvent<SVGPathElement>, edgeKey: string, controlPoint: { x: number; y: number }) => void;
  connectPreviewLine: string | null;
  canvasNodes: GraphNode[];
  nodeStates: Record<string, NodeRunState>;
  selectedNodeIds: string[];
  draggingNodeIds: string[];
  isConnectingDrag: boolean;
  questionDirectInputNodeIds: Set<string>;
  onNodeAnchorDragStart: (event: ReactMouseEvent<HTMLButtonElement>, nodeId: string, side: NodeAnchorSide) => void;
  onNodeAnchorDrop: (event: ReactMouseEvent<HTMLButtonElement>, nodeId: string, side: NodeAnchorSide) => void;
  onNodeConnectDrop: (nodeId: string) => void;
  isNodeDragAllowedTarget: (target: EventTarget | null) => boolean;
  onNodeDragStart: (event: ReactMouseEvent<HTMLDivElement>, nodeId: string) => void;
  nodeAnchorSides: readonly NodeAnchorSide[];
  nodeCardSummary: (node: GraphNode) => string;
  turnModelLabel: (node: GraphNode) => string;
  turnRoleLabel: (node: GraphNode) => string;
  nodeTypeLabel: (type: GraphNode["type"]) => string;
  nodeStatusLabel: (status: NodeExecutionStatus) => string;
  deleteNode: (nodeId: string) => void;
  onOpenFeedFromNode: (nodeId: string) => void;
  runtimeNowMs: number;
  formatNodeElapsedTime: (state: NodeRunState | undefined, nowMs: number) => string;
  marqueeSelection: MarqueeSelection | null;
  onCanvasZoomIn: () => void;
  onCanvasZoomOut: () => void;
  canvasFullscreen: boolean;
  setCanvasFullscreen: Dispatch<SetStateAction<boolean>>;
  setPanMode: Dispatch<SetStateAction<boolean>>;
  canRunGraphNow: boolean;
  onRunGraph: () => Promise<void>;
  isGraphRunning: boolean;
  onCancelGraphRun: () => Promise<void>;
  suspendedWebTurn: PendingWebTurn | null;
  pendingWebTurn: PendingWebTurn | null;
  onReopenPendingWebTurn: () => void;
  onOpenWebInputForNode: (nodeId: string) => void;
  undoStackLength: number;
  redoStackLength: number;
  onUndoGraph: () => void;
  onRedoGraph: () => void;
  onClearGraph: () => void;
  canClearGraph: boolean;
  isWorkflowBusy: boolean;
  setWorkflowQuestion: (value: string) => void;
  workflowQuestion: string;
  questionInputRef: RefObject<HTMLTextAreaElement | null>;
};

export default function WorkflowCanvasPane({
  panMode,
  onCanvasKeyDown,
  onCanvasMouseDown,
  onCanvasMouseMove,
  onCanvasMouseUp,
  onCanvasWheel,
  graphCanvasRef,
  boundedStageWidth,
  boundedStageHeight,
  canvasZoom,
  stageInsetX,
  stageInsetY,
  edgeLines,
  selectedEdgeKey,
  setNodeSelection,
  setSelectedEdgeKey,
  onEdgeDragStart,
  connectPreviewLine,
  canvasNodes,
  nodeStates,
  selectedNodeIds,
  draggingNodeIds,
  isConnectingDrag,
  questionDirectInputNodeIds,
  onNodeAnchorDragStart,
  onNodeAnchorDrop,
  onNodeConnectDrop,
  isNodeDragAllowedTarget,
  onNodeDragStart,
  nodeAnchorSides,
  nodeCardSummary,
  turnModelLabel,
  turnRoleLabel,
  nodeTypeLabel,
  nodeStatusLabel,
  deleteNode,
  onOpenFeedFromNode,
  runtimeNowMs,
  formatNodeElapsedTime,
  marqueeSelection,
  onCanvasZoomIn,
  onCanvasZoomOut,
  canvasFullscreen,
  setCanvasFullscreen,
  setPanMode,
  canRunGraphNow,
  onRunGraph,
  isGraphRunning,
  onCancelGraphRun,
  suspendedWebTurn,
  pendingWebTurn,
  onReopenPendingWebTurn,
  onOpenWebInputForNode,
  undoStackLength,
  redoStackLength,
  onUndoGraph,
  onRedoGraph,
  onClearGraph,
  canClearGraph,
  isWorkflowBusy,
  setWorkflowQuestion,
  workflowQuestion,
  questionInputRef,
}: WorkflowCanvasPaneProps) {
  const { t } = useI18n();

  return (
    <section className="canvas-pane">
      <div className="graph-canvas-shell">
        <div
          className={`graph-canvas ${panMode ? "pan-mode" : ""}`}
          onKeyDown={onCanvasKeyDown}
          onMouseDown={onCanvasMouseDown}
          onMouseMove={onCanvasMouseMove}
          onMouseUp={onCanvasMouseUp}
          onWheel={onCanvasWheel}
          ref={graphCanvasRef}
          tabIndex={-1}
        >
          <div
            className="graph-stage-shell"
            style={{
              width: Math.round(boundedStageWidth * canvasZoom + stageInsetX * 2),
              height: Math.round(boundedStageHeight * canvasZoom + stageInsetY * 2),
            }}
          >
            <div
              className="graph-stage"
              style={{
                left: stageInsetX,
                top: stageInsetY,
                transform: `scale(${canvasZoom})`,
                width: boundedStageWidth,
                height: boundedStageHeight,
              }}
            >
              <svg className="edge-layer">
                <defs>
                  <marker id="edge-arrow" markerHeight="7" markerUnits="userSpaceOnUse" markerWidth="7" orient="auto" refX="6" refY="3.5">
                    <path d="M0 0 L7 3.5 L0 7 Z" fill="#70848a" />
                  </marker>
                  <marker id="edge-arrow-readonly" markerHeight="7" markerUnits="userSpaceOnUse" markerWidth="7" orient="auto" refX="6" refY="3.5">
                    <path d="M0 0 L7 3.5 L0 7 Z" fill="#c07a2f" />
                  </marker>
                </defs>
                {edgeLines.map((line) => (
                  <g key={line.key}>
                    {!line.readOnly && (
                      <path
                        className="edge-path-hit"
                        d={line.path}
                        fill="none"
                        onClick={(e) => {
                          e.stopPropagation();
                          setNodeSelection([]);
                          setSelectedEdgeKey(line.edgeKey);
                        }}
                        onMouseDown={(e) => onEdgeDragStart(e, line.edgeKey, line.controlPoint)}
                        pointerEvents="stroke"
                        stroke="transparent"
                        strokeWidth={(selectedEdgeKey === line.edgeKey ? 3 : 2) + 2}
                      />
                    )}
                    <path
                      className={`${selectedEdgeKey === line.edgeKey ? "edge-path selected" : "edge-path"} ${
                        line.readOnly ? "readonly" : ""
                      }`.trim()}
                      d={line.path}
                      fill="none"
                      markerEnd={line.readOnly ? "url(#edge-arrow-readonly)" : "url(#edge-arrow)"}
                      pointerEvents="none"
                      stroke={line.readOnly ? "#c07a2f" : selectedEdgeKey === line.edgeKey ? "#4f83ff" : "#4f6271"}
                      strokeDasharray={line.readOnly ? "7 4" : undefined}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={selectedEdgeKey === line.edgeKey ? 3 : 2}
                    />
                  </g>
                ))}
                {connectPreviewLine && (
                  <path
                    d={connectPreviewLine}
                    fill="none"
                    pointerEvents="none"
                    stroke="#5b8cff"
                    strokeDasharray="5 4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                  />
                )}
              </svg>

              {canvasNodes.map((node) => {
                const runState = nodeStates[node.id];
                const nodeStatus = runState?.status ?? "idle";
                const nodeSummary = nodeCardSummary(node);
                const isNodeSelected = selectedNodeIds.includes(node.id);
                const isNodeDragging = draggingNodeIds.includes(node.id);
                const showNodeAnchors = isNodeSelected || isConnectingDrag;
                const receivesQuestionDirectly = questionDirectInputNodeIds.has(node.id);
                const isWebTurnNode =
                  node.type === "turn" && String(node.config?.executor ?? "").startsWith("web_");
                return (
                  <div
                    className={`graph-node node-${node.type} ${isNodeSelected ? "selected" : ""} ${isNodeDragging ? "is-dragging" : ""}`.trim()}
                    data-node-id={node.id}
                    key={node.id}
                    onClick={(event) => {
                      if (event.shiftKey) {
                        const toggled = selectedNodeIds.includes(node.id)
                          ? selectedNodeIds.filter((id) => id !== node.id)
                          : [...selectedNodeIds, node.id];
                        setNodeSelection(toggled, node.id);
                      } else {
                        setNodeSelection([node.id], node.id);
                      }
                      setSelectedEdgeKey("");
                    }}
                    onMouseDown={(event) => {
                      if (!isNodeDragAllowedTarget(event.target)) return;
                      if (event.button !== 0 || isConnectingDrag) return;
                      onNodeDragStart(event, node.id);
                    }}
                    onMouseUp={(e) => {
                      if (!isConnectingDrag) return;
                      e.stopPropagation();
                      onNodeConnectDrop(node.id);
                    }}
                    style={{
                      left: node.position.x,
                      top: node.position.y,
                      transition: isNodeDragging
                        ? "none"
                        : "left 220ms cubic-bezier(0.22, 1, 0.36, 1), top 220ms cubic-bezier(0.22, 1, 0.36, 1)",
                    }}
                  >
                    <div className="node-head">
                      <div className="node-head-main">
                        {node.type === "turn" ? (
                          <>
                            <div className="node-head-title-row">
                              <strong>{turnModelLabel(node)}</strong>
                            </div>
                            <span className="node-head-subtitle">{turnRoleLabel(node)}</span>
                          </>
                        ) : (
                          <div className="node-head-title-row">
                            <strong className={node.type === "gate" ? "gate-node-title" : undefined}>{nodeTypeLabel(node.type)}</strong>
                          </div>
                        )}
                      </div>
                      <button onClick={() => deleteNode(node.id)} type="button">{t("common.delete")}</button>
                    </div>
                    <div className="node-body">
                      {nodeSummary ? <div className="node-summary-row"><div>{nodeSummary}</div></div> : null}
                      <div className="node-runtime-meta">
                        <div>
                          {t("workflow.node.completion")}:{" "}
                          {nodeStatus === "done"
                            ? t("label.status.done")
                            : nodeStatus === "low_quality"
                              ? t("label.status.low_quality")
                              : nodeStatus === "failed"
                                ? t("label.status.failed")
                                : nodeStatus === "cancelled"
                                  ? t("label.status.cancelled")
                                  : t("label.status.idle")}
                        </div>
                        <div>{t("workflow.node.elapsed")}: {formatNodeElapsedTime(runState, runtimeNowMs)}</div>
                      </div>
                      <button className="node-feed-link" onClick={() => onOpenFeedFromNode(node.id)} type="button">{t("workflow.node.outputInFeed")}</button>
                    </div>
                    <div className="node-wait-slot">
                      <span className={`status-pill status-${nodeStatus}`}>{nodeStatusLabel(nodeStatus)}</span>
                      <div className="node-wait-actions">
                        {receivesQuestionDirectly && (
                          <span className="node-input-chip">
                            <span className="node-input-chip-text">{t("workflow.node.inputDirect")}</span>
                          </span>
                        )}
                        {isWebTurnNode && (
                          <button
                            className="node-manual-web-input-button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onOpenWebInputForNode(node.id);
                            }}
                            title={t("workflow.node.manualWebInput")}
                            type="button"
                          >
                            {t("workflow.node.manualWebInput")}
                          </button>
                        )}
                      </div>
                    </div>
                    {showNodeAnchors && (
                      <div className="node-anchors">
                        {nodeAnchorSides.map((side) => (
                          <button
                            aria-label={`${t("workflow.node.connection")} ${side}`}
                            className={`node-anchor node-anchor-${side}`}
                            key={`${node.id}-${side}`}
                            onMouseDown={(e) => onNodeAnchorDragStart(e, node.id, side)}
                            onMouseUp={(e) => onNodeAnchorDrop(e, node.id, side)}
                            type="button"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {marqueeSelection && (
                <div
                  className="marquee-selection"
                  style={{
                    left: Math.min(marqueeSelection.start.x, marqueeSelection.current.x),
                    top: Math.min(marqueeSelection.start.y, marqueeSelection.current.y),
                    width: Math.abs(marqueeSelection.current.x - marqueeSelection.start.x),
                    height: Math.abs(marqueeSelection.current.y - marqueeSelection.start.y),
                  }}
                />
              )}
            </div>
          </div>
        </div>

        <div className="canvas-overlay">
          <div className="canvas-zoom-controls">
            <div className="canvas-zoom-group">
              <button onClick={onCanvasZoomIn} title={t("workflow.canvas.zoomIn")} type="button"><img alt="" aria-hidden="true" className="canvas-control-icon" src="/plus.svg" /></button>
              <button onClick={onCanvasZoomOut} title={t("workflow.canvas.zoomOut")} type="button"><img alt="" aria-hidden="true" className="canvas-control-icon" src="/minus.svg" /></button>
            </div>
            <button className="canvas-zoom-single" onClick={() => setCanvasFullscreen((prev) => !prev)} title={canvasFullscreen ? t("workflow.canvas.defaultView") : t("workflow.canvas.fullView")} type="button">
              <img alt="" aria-hidden="true" className="canvas-control-icon" src="/canvas-fullscreen.svg" />
            </button>
            <button aria-label={t("workflow.canvas.move")} className={`canvas-zoom-single ${panMode ? "is-active" : ""}`} onClick={() => setPanMode((prev) => !prev)} title={t("workflow.canvas.moveCanvas")} type="button">
              <img alt="" aria-hidden="true" className="canvas-control-icon" src="/scroll.svg" />
            </button>
          </div>

          <div className="canvas-runbar">
            <button aria-label={t("workflow.canvas.run")} className={`canvas-icon-btn play ${canRunGraphNow ? "is-ready" : "is-disabled"}`} disabled={!canRunGraphNow} onClick={() => void onRunGraph()} title={t("workflow.canvas.run")} type="button">
              <img alt="" aria-hidden="true" className="canvas-icon-image" src="/canvas-play.svg" />
            </button>
            <button aria-label={t("workflow.canvas.stop")} className="canvas-icon-btn stop" disabled={!isGraphRunning} onClick={() => void onCancelGraphRun()} title={t("workflow.canvas.stop")} type="button">
              <img alt="" aria-hidden="true" className="canvas-icon-image" src="/canvas-stop.svg" />
            </button>
            {suspendedWebTurn && !pendingWebTurn && isGraphRunning && (
              <button aria-label={t("workflow.canvas.reopenWebInput")} className="canvas-web-turn-reopen" onClick={onReopenPendingWebTurn} title={t("workflow.canvas.reopenWebInputWindow")} type="button">WEB</button>
            )}
            <button aria-label={t("workflow.canvas.undo")} className="canvas-icon-btn" disabled={undoStackLength === 0} onClick={onUndoGraph} title={t("workflow.canvas.undo")} type="button">
              <img alt="" aria-hidden="true" className="canvas-icon-image" src="/canvas-undo.svg" />
            </button>
            <button aria-label={t("workflow.canvas.redo")} className="canvas-icon-btn" disabled={redoStackLength === 0} onClick={onRedoGraph} title={t("workflow.canvas.redo")} type="button">
              <img alt="" aria-hidden="true" className="canvas-icon-image" src="/canvas-replay.svg" />
            </button>
            <button aria-label={t("workflow.canvas.clear")} className="canvas-icon-btn" disabled={!canClearGraph} onClick={onClearGraph} title={t("workflow.canvas.clear")} type="button">
              <img alt="" aria-hidden="true" className="canvas-icon-image canvas-icon-image-clear" src="/clear.svg" />
            </button>
          </div>
        </div>
      </div>

      <div className="canvas-topbar">
        <div className="question-input">
          <textarea
            disabled={isWorkflowBusy}
            onChange={(e) => setWorkflowQuestion(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!canRunGraphNow) return;
                void onRunGraph();
              }
            }}
            placeholder={t("workflow.question.placeholder")}
            ref={questionInputRef}
            rows={1}
            value={workflowQuestion}
          />
          <div className="question-input-footer">
            <button className="primary-action question-create-button" disabled={!canRunGraphNow} onClick={() => void onRunGraph()} type="button">
              <img alt="" aria-hidden="true" className="question-create-icon" src="/up.svg" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
