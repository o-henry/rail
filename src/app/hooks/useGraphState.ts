import { useRef, useState } from "react";
import type { PresetKind } from "../../features/workflow/domain";
import type { GraphData, NodeAnchorSide } from "../../features/workflow/types";
import type {
  DragState,
  EdgeDragState,
  GraphClipboardSnapshot,
  LogicalPoint,
  MarqueeSelection,
  NodeVisualSize,
  PanState,
  PointerState,
} from "../main";

export function useGraphState(options: {
  initialGraph: GraphData;
  defaultStageWidth: number;
  defaultStageHeight: number;
}) {
  const { initialGraph, defaultStageWidth, defaultStageHeight } = options;

  const [graph, setGraph] = useState<GraphData>(initialGraph);
  const [selectedNodeId, setSelectedNodeId] = useState<string>("");
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectedEdgeKey, setSelectedEdgeKey] = useState<string>("");
  const [connectFromNodeId, setConnectFromNodeId] = useState<string>("");
  const [connectFromSide, setConnectFromSide] = useState<NodeAnchorSide | null>(null);
  const [connectPreviewStartPoint, setConnectPreviewStartPoint] = useState<LogicalPoint | null>(null);
  const [connectPreviewPoint, setConnectPreviewPoint] = useState<LogicalPoint | null>(null);
  const [isConnectingDrag, setIsConnectingDrag] = useState(false);
  const [draggingNodeIds, setDraggingNodeIds] = useState<string[]>([]);
  const [graphFileName, setGraphFileName] = useState("");
  const [selectedGraphFileName, setSelectedGraphFileName] = useState("");
  const [graphRenameOpen, setGraphRenameOpen] = useState(false);
  const [graphRenameDraft, setGraphRenameDraft] = useState("");
  const [graphFiles, setGraphFiles] = useState<string[]>([]);

  const [canvasZoom, setCanvasZoom] = useState(1);
  const [panMode, setPanMode] = useState(false);
  const [canvasFullscreen, setCanvasFullscreen] = useState(false);
  const [canvasLogicalViewport, setCanvasLogicalViewport] = useState({
    width: defaultStageWidth,
    height: defaultStageHeight,
  });
  const [undoStack, setUndoStack] = useState<GraphData[]>([]);
  const [redoStack, setRedoStack] = useState<GraphData[]>([]);
  const [, setNodeSizeVersion] = useState(0);
  const [marqueeSelection, setMarqueeSelection] = useState<MarqueeSelection | null>(null);

  const dragRef = useRef<DragState | null>(null);
  const edgeDragRef = useRef<EdgeDragState | null>(null);
  const graphCanvasRef = useRef<HTMLDivElement | null>(null);
  const nodeSizeMapRef = useRef<Record<string, NodeVisualSize>>({});
  const questionInputRef = useRef<HTMLTextAreaElement | null>(null);
  const panRef = useRef<PanState | null>(null);
  const dragPointerRef = useRef<PointerState | null>(null);
  const dragAutoPanFrameRef = useRef<number | null>(null);
  const dragWindowMoveHandlerRef = useRef<((event: MouseEvent) => void) | null>(null);
  const dragWindowUpHandlerRef = useRef<((event: MouseEvent) => void) | null>(null);
  const dragStartSnapshotRef = useRef<GraphData | null>(null);
  const edgeDragStartSnapshotRef = useRef<GraphData | null>(null);
  const edgeDragWindowMoveHandlerRef = useRef<((event: MouseEvent) => void) | null>(null);
  const edgeDragWindowUpHandlerRef = useRef<((event: MouseEvent) => void) | null>(null);
  const zoomStatusTimerRef = useRef<number | null>(null);
  const lastAppliedPresetRef = useRef<{ kind: PresetKind; graph: GraphData } | null>(null);
  const graphClipboardRef = useRef<GraphClipboardSnapshot | null>(null);
  const graphPasteSerialRef = useRef(0);

  return {
    graph,
    setGraph,
    selectedNodeId,
    setSelectedNodeId,
    selectedNodeIds,
    setSelectedNodeIds,
    selectedEdgeKey,
    setSelectedEdgeKey,
    connectFromNodeId,
    setConnectFromNodeId,
    connectFromSide,
    setConnectFromSide,
    connectPreviewStartPoint,
    setConnectPreviewStartPoint,
    connectPreviewPoint,
    setConnectPreviewPoint,
    isConnectingDrag,
    setIsConnectingDrag,
    draggingNodeIds,
    setDraggingNodeIds,
    graphFileName,
    setGraphFileName,
    selectedGraphFileName,
    setSelectedGraphFileName,
    graphRenameOpen,
    setGraphRenameOpen,
    graphRenameDraft,
    setGraphRenameDraft,
    graphFiles,
    setGraphFiles,
    canvasZoom,
    setCanvasZoom,
    panMode,
    setPanMode,
    canvasFullscreen,
    setCanvasFullscreen,
    canvasLogicalViewport,
    setCanvasLogicalViewport,
    undoStack,
    setUndoStack,
    redoStack,
    setRedoStack,
    setNodeSizeVersion,
    marqueeSelection,
    setMarqueeSelection,
    dragRef,
    edgeDragRef,
    graphCanvasRef,
    nodeSizeMapRef,
    questionInputRef,
    panRef,
    dragPointerRef,
    dragAutoPanFrameRef,
    dragWindowMoveHandlerRef,
    dragWindowUpHandlerRef,
    dragStartSnapshotRef,
    edgeDragStartSnapshotRef,
    edgeDragWindowMoveHandlerRef,
    edgeDragWindowUpHandlerRef,
    zoomStatusTimerRef,
    lastAppliedPresetRef,
    graphClipboardRef,
    graphPasteSerialRef,
  };
}
