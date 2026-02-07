// ============================================================================
// interactive-mermaid - Drag-and-drop wrapper for beautiful-mermaid
// ============================================================================

// Public API exports
export type {
  InteractiveOptions,
  DragState,
  InteractiveMermaidInstance,
  SerializedLayout,
  ParsedNode,
  ParsedEdge,
  Point,
  BoundingBox,
  SvgNodeType,
  DiagramType,
} from './types.ts'

export type { LayoutMetadata } from './core/position-serializer.ts'

export {
  makeInteractive,
  createInteractive,
  version,
} from './api.ts'

// Re-export serializer functions for advanced use cases
export {
  serialize,
  deserialize,
  saveToLocalStorage,
  loadFromLocalStorage,
  clearFromLocalStorage,
  hasSavedPositions,
  getAllSavedLayoutKeys,
  clearAllSavedLayouts,
  getLayoutMetadata,
  generateStorageKey,
} from './core/position-serializer.ts'
