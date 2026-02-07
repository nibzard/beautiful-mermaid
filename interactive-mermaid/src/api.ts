// ============================================================================
// Public API - Main entry point for interactive-mermaid
// ============================================================================

import type {
  InteractiveOptions,
  DragState,
  InteractiveMermaidInstance,
  ParsedNode,
  ParsedEdge,
  ParsedGroup,
} from './types.ts'
import { getSvgParser } from './core/svg-parser.ts'
import { DragHandler } from './core/drag-handler.ts'
import {
  saveToLocalStorage,
  loadFromLocalStorage,
  hasSavedPositions,
  clearFromLocalStorage,
} from './core/position-serializer.ts'

/**
 * Package version
 */
export const version = '0.1.0'

/**
 * Internal instance class
 */
class InteractiveMermaid implements InteractiveMermaidInstance {
  private container: HTMLElement | SVGElement
  private options: InteractiveOptions
  private dragHandler: DragHandler | null = null
  private nodes: ParsedNode[] = []
  private edges: ParsedEdge[] = []
  private groups: ParsedGroup[] = []
  private source: string = ''
  private diagramType: string = 'unknown'
  private isDestroyed = false

  constructor(
    container: HTMLElement | SVGElement,
    options: InteractiveOptions,
    source: string
  ) {
    this.container = container
    this.options = { ...options }
    this.source = source
  }

  /**
   * Initialize the interactive features
   */
  initialize(): void {
    if (this.isDestroyed) {
      throw new Error('Instance has been destroyed')
    }

    // Get the SVG element
    const svg = this.getSvgElement()
    if (!svg) {
      throw new Error('No SVG element found in container')
    }

    // Parse the SVG
    const parser = getSvgParser()
    const result = parser.parse(svg)

    this.nodes = result.nodes
    this.edges = result.edges
    this.groups = result.groups
    this.diagramType = result.diagramType

    // Create drag handler
    this.dragHandler = new DragHandler(
      this.container,
      this.nodes,
      this.edges,
      this.groups,
      this.options,
      this.source
    )

    // Enable drag functionality
    if (!this.options.disabled) {
      this.dragHandler.enable()
    }

    // Auto-load saved positions if enabled
    if (this.options.autoSave !== false) {
      const savedPositions = loadFromLocalStorage(
        this.source,
        this.options.storageKeyPrefix
      )
      if (savedPositions) {
        this.setPositions(savedPositions)
      }
    }
  }

  /**
   * Update the diagram with new mermaid source
   */
  update(source: string): void {
    if (this.isDestroyed) {
      throw new Error('Instance has been destroyed')
    }

    // Clean up existing handler
    if (this.dragHandler) {
      this.dragHandler.destroy()
      this.dragHandler = null
    }

    this.source = source

    // Re-initialize
    this.initialize()
  }

  /**
   * Set node positions programmatically
   */
  setPositions(positions: Record<string, { x: number; y: number }>): void {
    if (this.isDestroyed || !this.dragHandler) return

    const tracker = this.dragHandler.getTracker()
    tracker.setPositions(positions)
  }

  /**
   * Get current node positions
   */
  getPositions(): Record<string, { x: number; y: number }> {
    if (this.isDestroyed || !this.dragHandler) return {}

    const tracker = this.dragHandler.getTracker()
    return tracker.getAllPositions()
  }

  /**
   * Enable/disable interactivity
   */
  setEnabled(enabled: boolean): void {
    if (this.isDestroyed) return

    const nextDisabled = !enabled
    if (this.options.disabled === nextDisabled) return
    this.options.disabled = nextDisabled

    if (this.dragHandler) {
      if (enabled) {
        this.dragHandler.enable()
      } else {
        this.dragHandler.disable()
      }
    }
  }

  /**
   * Get the parsed nodes
   */
  getNodes(): ParsedNode[] {
    return this.nodes
  }

  /**
   * Get the parsed edges
   */
  getEdges(): ParsedEdge[] {
    return this.edges
  }

  /**
   * Reset all nodes to their original positions
   */
  resetPositions(): void {
    if (this.isDestroyed || !this.dragHandler) return

    const tracker = this.dragHandler.getTracker()
    tracker.resetAllPositions()
    tracker.applyPositionUpdates()

    // Update connected edges
    const nodes = tracker.getAllNodes()
    for (const node of nodes) {
      // Edges are updated during position updates
    }
  }

  /**
   * Clean up event listeners
   */
  destroy(): void {
    if (this.isDestroyed) return

    if (this.dragHandler) {
      this.dragHandler.destroy()
      this.dragHandler = null
    }

    this.isDestroyed = true
  }

  /**
   * Get the SVG element from the container
   */
  private getSvgElement(): SVGSVGElement | null {
    if (this.container.tagName === 'svg') {
      return this.container as SVGSVGElement
    }

    const svg = this.container.querySelector('svg')
    return svg as SVGSVGElement | null
  }
}

/**
 * Make a rendered mermaid diagram interactive.
 *
 * This is the main entry point for adding drag-and-drop functionality
 * to diagrams rendered by beautiful-mermaid.
 *
 * @param container - DOM element containing the mermaid SVG
 * @param options - Configuration options
 * @returns Instance with control methods
 *
 * @example
 * ```ts
 * import { renderMermaid } from 'beautiful-mermaid'
 * import { makeInteractive } from 'interactive-mermaid'
 *
 * // Render the diagram
 * const svg = await renderMermaid('graph TD; A-->B;', {
 *   bg: '#1a1b26',
 *   fg: '#a9b1d6'
 * })
 * container.innerHTML = svg
 *
 * // Make it interactive
 * const instance = makeInteractive(container, {
 *   onDragEnd: (state) => {
 *     console.log('New positions:', state.positions)
 *   }
 * })
 * ```
 */
export function makeInteractive(
  container: HTMLElement | SVGElement,
  options: InteractiveOptions = {}
): InteractiveMermaidInstance {
  // Extract source from data attribute if available
  const source =
    (container instanceof HTMLElement
      ? container.getAttribute('data-mermaid-source')
      : null) || ''

  const instance = new InteractiveMermaid(container, options, source)

  // Set up auto-save on drag end
  const originalOnDragEnd = options.onDragEnd
  options.onDragEnd = (state: DragState) => {
    // Auto-save to localStorage if enabled
    if (options.autoSave !== false) {
      saveToLocalStorage(state.positions, state.source, options.storageKeyPrefix)
    }

    // Call user callback
    originalOnDragEnd?.(state)
  }

  // Initialize
  instance.initialize()

  return instance
}

/**
 * Alias for makeInteractive for compatibility
 */
export const createInteractive = makeInteractive
