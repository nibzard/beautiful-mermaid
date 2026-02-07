// ============================================================================
// Type definitions for interactive-mermaid
// ============================================================================

/**
 * Point in 2D space
 */
export interface Point {
  x: number
  y: number
}

/**
 * Bounding box of a node
 */
export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Node types that can be identified in the SVG
 */
export type SvgNodeType =
  | 'rect'
  | 'rounded'
  | 'diamond'
  | 'stadium'
  | 'circle'
  | 'subroutine'
  | 'doublecircle'
  | 'hexagon'
  | 'cylinder'
  | 'asymmetric'
  | 'trapezoid'
  | 'trapezoid-alt'
  | 'state-start'
  | 'state-end'
  | 'ellipse'
  | 'polygon'
  | 'line'
  | 'unknown'

/**
 * A parsed node from the SVG
 */
export interface ParsedNode {
  /** Generated unique ID (stable across re-renders) */
  id: string
  /** Reference to the DOM element(s) for this node */
  elements: SVGElement[]
  /** Current position */
  x: number
  y: number
  /** Dimensions */
  width: number
  height: number
  /** Node type */
  type: SvgNodeType
  /** Label text (if found) */
  label?: string
  /** Original position before drag */
  originalX: number
  originalY: number
}

/**
 * A parsed edge (connection between nodes)
 */
export interface ParsedEdge {
  /** Edge ID */
  id: string
  /** Reference to the polyline/line element */
  element: SVGPolylineElement | SVGLineElement
  /** All points in the edge path */
  points: Point[]
  /** Node IDs that this edge connects */
  sourceNodeId?: string
  targetNodeId?: string
  /**
   * Cached offsets from the connected node centers to the edge endpoints.
   * Used to update edge endpoints when nodes move.
   */
  sourceOffset?: Point
  targetOffset?: Point
  /** Label element (if present) */
  labelElement?: SVGTextElement
  /** Background rect for label (if present) */
  labelBackground?: SVGRectElement

  /**
   * Label positioning info (if labelElement/labelBackground were detected).
   * Stored in SVG coordinates and applied via SVG transforms.
   */
  labelInfo?: {
    /** Fraction [0..1] along the edge path (by arc-length) */
    t: number
    /** Offset from the point on the path to the label anchor point */
    offset: Point
    /** Original label anchor point used as the transform baseline */
    anchor: Point
  }

  /**
   * Extra elements that visually belong to the edge (e.g., ER crow's foot
   * markers). These are anchored to either endpoint.
   */
  decorations?: Array<{
    element: SVGElement
    endpoint: 'source' | 'target'
    /** Offset from the endpoint point to the decoration anchor point */
    offset: Point
    /** Original anchor point used as the transform baseline */
    anchor: Point
  }>

  /**
   * Routing hints derived from the original SVG path.
   * Used to keep edge segments orthogonal while endpoints move.
   */
  firstSegmentVertical?: boolean
  lastSegmentVertical?: boolean
}

/**
 * A parsed subgraph/group container (flowchart subgraphs).
 */
export interface ParsedGroup {
  /** Stable ID */
  id: string
  /** Outer group rect (fill=var(--_group-fill)) */
  outerRect: SVGRectElement
  /** Header band rect (fill=var(--_group-hdr)) */
  headerRect?: SVGRectElement
  /** Header label text element */
  labelElement?: SVGTextElement

  /** Original box */
  originalX: number
  originalY: number
  originalWidth: number
  originalHeight: number

  /** Header height (px) captured from the SVG */
  headerHeight: number

  /** Node membership (based on original containment) */
  memberNodeIds: string[]

  /** Padding inferred from the original SVG */
  padding: { left: number; top: number; right: number; bottom: number }

  /** Label offsets relative to the group origin (original SVG) */
  labelOffset?: { x: number; y: number }
}

/**
 * Diagram type detection
 */
export type DiagramType = 'flowchart' | 'sequence' | 'state' | 'class' | 'er' | 'unknown'

/**
 * Current drag state
 */
export interface DragState {
  /** Node ID -> position mapping */
  positions: Record<string, { x: number; y: number }>
  /** Original mermaid source */
  source: string
  /** Updated mermaid source with position hints (optional format) */
  updatedSource?: string
  /** The node currently being dragged (if any) */
  activeNodeId?: string
}

/**
 * Options for making a diagram interactive
 */
export interface InteractiveOptions {
  /**
   * Called when a drag operation completes.
   * Returns updated node positions that can be used to regenerate the diagram.
   */
  onDragEnd?: (state: DragState) => void

  /**
   * Called continuously during drag for live updates.
   */
  onDragMove?: (state: DragState) => void

  /**
   * Called when a drag operation starts.
   */
  onDragStart?: (nodeId: string) => void

  /**
   * Enable/disable drag functionality.
   * @default false
   */
  disabled?: boolean

  /**
   * CSS cursor style during drag.
   * @default 'grabbing'
   */
  cursor?: string

  /**
   * CSS cursor style when hovering over draggable nodes.
   * @default 'grab'
   */
  hoverCursor?: string

  /**
   * Snap to grid (px). Set to 0 to disable.
   * @default 0
   */
  gridSize?: number

  /**
   * Auto-save positions to localStorage.
   * @default true
   */
  autoSave?: boolean

  /**
   * Storage key prefix for localStorage.
   * @default 'mermaid-layout'
   */
  storageKeyPrefix?: string

  /**
   * Enable touch events for mobile.
   * @default true
   */
  touchEnabled?: boolean

  /**
   * Visual feedback during drag - add a class to the active node.
   * @default 'mermaid-dragging'
   */
  draggingClass?: string

  /**
   * Visual feedback for hoverable nodes.
   * @default 'mermaid-draggable'
   */
  draggableClass?: string

  /**
   * Run a "polish" pass on drag end to keep the diagram tidy:
   * - Re-orthogonalize polylines after endpoint movement
   * - Resize/reposition subgraph boxes to fit moved nodes
   * @default true
   */
  polishOnDragEnd?: boolean
}

/**
 * Instance returned by makeInteractive with control methods
 */
export interface InteractiveMermaidInstance {
  /** Update the diagram with new mermaid source */
  update(source: string): void

  /** Set node positions programmatically */
  setPositions(positions: Record<string, { x: number; y: number }>): void

  /** Get current node positions */
  getPositions(): Record<string, { x: number; y: number }>

  /** Enable/disable interactivity */
  setEnabled(enabled: boolean): void

  /** Clean up event listeners */
  destroy(): void

  /** Get the parsed nodes */
  getNodes(): ParsedNode[]

  /** Get the parsed edges */
  getEdges(): ParsedEdge[]

  /** Reset all nodes to their original positions */
  resetPositions(): void
}

/**
 * Serialized layout data for persistence
 */
export interface SerializedLayout {
  version: number
  source: string
  positions: Record<string, { x: number; y: number }>
  timestamp: number
  diagramType?: DiagramType
}

/**
 * SVG parsing context
 */
export interface SvgParseContext {
  /** The SVG element being parsed */
  svg: SVGSVGElement
  /** Diagram type (if detectable) */
  diagramType: DiagramType
  /** Mapping of element IDs to parsed nodes */
  nodeMap: Map<string, ParsedNode>
  /** Mapping of element IDs to parsed edges */
  edgeMap: Map<string, ParsedEdge>
  /** Text elements for label lookup */
  textElements: SVGTextElement[]
}

/**
 * Edge connection info
 */
export interface EdgeConnection {
  /** The edge */
  edge: ParsedEdge
  /** Which endpoint connects to the node */
  endpoint: 'source' | 'target'
  /** Original point position */
  point: Point
  /** Offset from node center */
  offset: Point
}
