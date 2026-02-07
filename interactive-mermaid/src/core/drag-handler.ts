// ============================================================================
// Drag Handler - DOM event handling for drag-and-drop
// ============================================================================

import type {
  InteractiveOptions,
  DragState,
  ParsedNode,
  ParsedEdge,
  ParsedGroup,
} from '../types.ts'
import { NodeTracker } from './node-tracker.ts'

/**
 * Handles drag events for interactive diagrams
 */
export class DragHandler {
  private tracker: NodeTracker
  private container: HTMLElement | SVGElement
  private options: InteractiveOptions
  private svg: SVGSVGElement

  private activeNode: ParsedNode | null = null
  private dragOffset = { x: 0, y: 0 }
  private isDragging = false
  private source = ''

  // Event listener bindings for cleanup
  private boundMouseDown: ((e: Event) => void) | null = null
  private boundMouseMove: ((e: Event) => void) | null = null
  private boundMouseUp: ((e: Event) => void) | null = null
  private boundTouchStart: ((e: Event) => void) | null = null
  private boundTouchMove: ((e: Event) => void) | null = null
  private boundTouchEnd: ((e: Event) => void) | null = null

  constructor(
    container: HTMLElement | SVGElement,
    nodes: ParsedNode[],
    edges: ParsedEdge[],
    groups: ParsedGroup[],
    options: InteractiveOptions,
    source: string
  ) {
    this.container = container
    this.options = { ...options }
    this.source = source

    // Get the SVG element
    this.svg = this.getSvgElement(container)

    // Create tracker
    this.tracker = new NodeTracker(nodes, edges, groups)
  }

  /**
   * Enable drag functionality
   */
  enable(): void {
    // Idempotent: avoid double-registering event listeners if enable() is called repeatedly.
    if (this.boundMouseDown) return

    const nodes = this.tracker.getAllNodes()
    const draggableClass = this.options.draggableClass || 'mermaid-draggable'

    for (const node of nodes) {
      for (const element of node.elements) {
        // Add draggable class
        element.classList.add(draggableClass)

        // Set cursor style
        const cursor = this.options.hoverCursor || 'grab'
        element.style.cursor = cursor

        // Store reference to node ID on the element
        element.setAttribute('data-mermaid-node-id', node.id)
      }
    }

    // Set up event delegation
    this.boundMouseDown = this.handleMouseDown.bind(this)
    this.boundMouseMove = this.handleMouseMove.bind(this)
    this.boundMouseUp = this.handleMouseUp.bind(this)

    if (this.options.touchEnabled !== false) {
      this.boundTouchStart = this.handleTouchStart.bind(this)
      this.boundTouchMove = this.handleTouchMove.bind(this)
      this.boundTouchEnd = this.handleTouchEnd.bind(this)
    }

    // Add event listeners to the container (delegation)
    this.container.addEventListener('mousedown', this.boundMouseDown)
    document.addEventListener('mousemove', this.boundMouseMove)
    document.addEventListener('mouseup', this.boundMouseUp)

    if (this.boundTouchStart) {
      this.container.addEventListener('touchstart', this.boundTouchStart, { passive: false })
      document.addEventListener('touchmove', this.boundTouchMove, { passive: false })
      document.addEventListener('touchend', this.boundTouchEnd)
    }
  }

  /**
   * Disable drag functionality
   */
  disable(): void {
    const nodes = this.tracker.getAllNodes()
    const draggableClass = this.options.draggableClass || 'mermaid-draggable'

    for (const node of nodes) {
      for (const element of node.elements) {
        element.classList.remove(draggableClass)
        element.style.cursor = ''
        element.removeAttribute('data-mermaid-node-id')
      }
    }

    // Remove event listeners
    if (this.boundMouseDown) {
      this.container.removeEventListener('mousedown', this.boundMouseDown)
      document.removeEventListener('mousemove', this.boundMouseMove)
      document.removeEventListener('mouseup', this.boundMouseUp)
    }

    if (this.boundTouchStart) {
      this.container.removeEventListener('touchstart', this.boundTouchStart)
      document.removeEventListener('touchmove', this.boundTouchMove)
      document.removeEventListener('touchend', this.boundTouchEnd)
    }

    this.boundMouseDown = null
    this.boundMouseMove = null
    this.boundMouseUp = null
    this.boundTouchStart = null
    this.boundTouchMove = null
    this.boundTouchEnd = null
  }

  /**
   * Clean up event listeners
   */
  destroy(): void {
    this.disable()
  }

  /**
   * Get the tracker instance
   */
  getTracker(): NodeTracker {
    return this.tracker
  }

  /**
   * Handle mouse down event
   */
  private handleMouseDown(event: Event): void {
    if (this.options.disabled) return

    const mouseEvent = event as MouseEvent
    const target = mouseEvent.target as SVGElement

    // Find the node element
    const nodeElement = target.closest('[data-mermaid-node-id]') as SVGElement | null
    if (!nodeElement) return

    const nodeId = nodeElement.getAttribute('data-mermaid-node-id')
    if (!nodeId) return

    const node = this.tracker.getNode(nodeId)
    if (!node) return

    event.preventDefault()
    this.startDrag(node, mouseEvent.clientX, mouseEvent.clientY)
  }

  /**
   * Handle touch start event
   */
  private handleTouchStart(event: Event): void {
    if (this.options.disabled) return

    const touchEvent = event as TouchEvent
    const target = touchEvent.target as SVGElement

    // Find the node element
    const nodeElement = target.closest('[data-mermaid-node-id]') as SVGElement | null
    if (!nodeElement) return

    const nodeId = nodeElement.getAttribute('data-mermaid-node-id')
    if (!nodeId) return

    const node = this.tracker.getNode(nodeId)
    if (!node) return

    // Prevent default to avoid page scrolling while dragging
    touchEvent.preventDefault()

    const touch = touchEvent.touches[0]
    if (touch) {
      this.startDrag(node, touch.clientX, touch.clientY)
    }
  }

  /**
   * Start dragging a node
   */
  private startDrag(node: ParsedNode, clientX: number, clientY: number): void {
    this.activeNode = node
    this.isDragging = true

    const svgPt = this.clientToSvgPoint(clientX, clientY)

    // Offset within the node in SVG coordinates so the node doesn't "jump" on grab.
    this.dragOffset = { x: svgPt.x - node.x, y: svgPt.y - node.y }

    // Add dragging class
    const draggingClass = this.options.draggingClass || 'mermaid-dragging'
    for (const element of node.elements) {
      element.classList.add(draggingClass)
      // Change cursor
      const cursor = this.options.cursor || 'grabbing'
      element.style.cursor = cursor
    }

    // Update document cursor
    if (this.container instanceof HTMLElement) {
      this.container.style.cursor = this.options.cursor || 'grabbing'
    }

    // Call drag start callback
    this.options.onDragStart?.(node.id)
  }

  /**
   * Handle mouse move event
   */
  private handleMouseMove(event: Event): void {
    if (!this.activeNode || !this.isDragging) return

    const mouseEvent = event as MouseEvent
    this.updateDrag(mouseEvent.clientX, mouseEvent.clientY)
  }

  /**
   * Handle touch move event
   */
  private handleTouchMove(event: Event): void {
    if (!this.activeNode || !this.isDragging) return

    const touchEvent = event as TouchEvent

    // Prevent default to avoid page scrolling while dragging
    touchEvent.preventDefault()

    const touch = touchEvent.touches[0]
    if (touch) {
      this.updateDrag(touch.clientX, touch.clientY)
    }
  }

  /**
   * Update drag position
   */
  private updateDrag(clientX: number, clientY: number): void {
    if (!this.activeNode) return

    const svgPt = this.clientToSvgPoint(clientX, clientY)

    let newX = svgPt.x - this.dragOffset.x
    let newY = svgPt.y - this.dragOffset.y

    // Apply grid snapping if enabled
    if (this.options.gridSize && this.options.gridSize > 0) {
      newX = Math.round(newX / this.options.gridSize) * this.options.gridSize
      newY = Math.round(newY / this.options.gridSize) * this.options.gridSize
    }

    // Update node position
    this.tracker.updateNodePosition(this.activeNode.id, newX, newY)

    // Apply transform to node elements
    this.tracker.applyPositionUpdates()

    // Call drag move callback
    this.options.onDragMove?.(this.getCurrentState())
  }

  /**
   * Handle mouse up event
   */
  private handleMouseUp(_event: Event): void {
    this.endDrag()
  }

  /**
   * Handle touch end event
   */
  private handleTouchEnd(_event: Event): void {
    this.endDrag()
  }

  /**
   * End dragging
   */
  private endDrag(): void {
    if (!this.activeNode) return

    // Remove dragging class
    const draggingClass = this.options.draggingClass || 'mermaid-dragging'
    const hoverCursor = this.options.hoverCursor || 'grab'

    for (const element of this.activeNode.elements) {
      element.classList.remove(draggingClass)
      element.style.cursor = hoverCursor
    }

    // Reset document cursor
    if (this.container instanceof HTMLElement) {
      this.container.style.cursor = ''
    }

    // Save positions if auto-save is enabled
    if (this.options.autoSave !== false) {
      // This will be handled by the main instance
    }

    // Optional "polish pass" after drag: keep geometry tidy.
    if (this.options.polishOnDragEnd !== false) {
      this.tracker.polishLayout()
    }

    // Call drag end callback
    this.options.onDragEnd?.(this.getCurrentState())

    this.activeNode = null
    this.isDragging = false
  }

  private clientToSvgPoint(clientX: number, clientY: number): DOMPoint {
    const pt = this.svg.createSVGPoint()
    pt.x = clientX
    pt.y = clientY
    return pt.matrixTransform(this.svg.getScreenCTM()?.inverse() || new DOMMatrix())
  }

  /**
   * Get current drag state
   */
  private getCurrentState(): DragState {
    return {
      positions: this.tracker.getAllPositions(),
      source: this.source,
      activeNodeId: this.activeNode?.id,
    }
  }

  /**
   * Get the SVG element from the container
   */
  private getSvgElement(container: HTMLElement | SVGElement): SVGSVGElement {
    if (container.tagName === 'svg') {
      return container as SVGSVGElement
    }

    const svg = container.querySelector('svg')
    if (!svg) {
      throw new Error('No SVG element found in container')
    }

    return svg as SVGSVGElement
  }
}
