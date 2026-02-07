// ============================================================================
// Node Tracker - Track node positions during drag operations
// ============================================================================

import type { ParsedNode, ParsedEdge, ParsedGroup, Point } from '../types.ts'

/**
 * Tracks node positions and provides position updates
 */
export class NodeTracker {
  private nodes: Map<string, ParsedNode>
  private originalPositions: Map<string, { x: number; y: number }>
  private edges: ParsedEdge[]
  private groups: ParsedGroup[]

  constructor(nodes: ParsedNode[], edges: ParsedEdge[], groups: ParsedGroup[] = []) {
    this.nodes = new Map()
    this.originalPositions = new Map()
    this.edges = edges
    this.groups = groups

    for (const node of nodes) {
      this.nodes.set(node.id, node)
      this.originalPositions.set(node.id, { x: node.originalX, y: node.originalY })
    }
  }

  /**
   * Get a node by ID
   */
  getNode(id: string): ParsedNode | undefined {
    return this.nodes.get(id)
  }

  /**
   * Get all nodes
   */
  getAllNodes(): ParsedNode[] {
    return Array.from(this.nodes.values())
  }

  /**
   * Get all edges
   */
  getAllEdges(): ParsedEdge[] {
    return this.edges
  }

  /**
   * Update node position
   */
  updateNodePosition(id: string, x: number, y: number): boolean {
    const node = this.nodes.get(id)
    if (!node) return false

    node.x = x
    node.y = y
    return true
  }

  /**
   * Get current position of a node
   */
  getNodePosition(id: string): { x: number; y: number } | undefined {
    const node = this.nodes.get(id)
    if (!node) return undefined
    return { x: node.x, y: node.y }
  }

  /**
   * Get all current positions as a record
   */
  getAllPositions(): Record<string, { x: number; y: number }> {
    const positions: Record<string, { x: number; y: number }> = {}
    for (const [id, node] of this.nodes) {
      positions[id] = { x: node.x, y: node.y }
    }
    return positions
  }

  /**
   * Get all original positions
   */
  getOriginalPositions(): Record<string, { x: number; y: number }> {
    const positions: Record<string, { x: number; y: number }> = {}
    for (const [id, pos] of this.originalPositions) {
      positions[id] = { ...pos }
    }
    return positions
  }

  /**
   * Reset a node to its original position
   */
  resetNodePosition(id: string): boolean {
    const original = this.originalPositions.get(id)
    if (!original) return false

    return this.updateNodePosition(id, original.x, original.y)
  }

  /**
   * Reset all nodes to their original positions
   */
  resetAllPositions(): void {
    for (const [id, original] of this.originalPositions) {
      this.updateNodePosition(id, original.x, original.y)
    }
  }

  /**
   * Apply position updates to all node elements in the DOM
   */
  applyPositionUpdates(): void {
    for (const node of this.nodes.values()) {
      this.applyNodeTransform(node)
    }

    // Keep edges and edge-affiliated elements in sync with node movement.
    this.applyEdgeUpdates()
  }

  /**
   * Apply transform to a node's elements
   */
  private applyNodeTransform(node: ParsedNode): void {
    const dx = node.x - node.originalX
    const dy = node.y - node.originalY

    // If no movement, clear any existing transform
    if (dx === 0 && dy === 0) {
      for (const element of node.elements) {
        if (element.getAttribute('data-original-transform')) {
          element.setAttribute('transform', element.getAttribute('data-original-transform') || '')
        } else {
          element.removeAttribute('transform')
        }
      }
      return
    }

    // Apply translation to each element
    for (const element of node.elements) {
      // Store original transform if not already stored
      if (!element.hasAttribute('data-original-transform')) {
        element.setAttribute('data-original-transform', element.getAttribute('transform') || '')
      }

      const originalTransform = element.getAttribute('data-original-transform') || ''
      const translate = `translate(${dx}, ${dy})`

      // Combine with existing transform
      if (originalTransform) {
        element.setAttribute('transform', `${originalTransform} ${translate}`)
      } else {
        element.setAttribute('transform', translate)
      }
    }
  }

  /**
   * Set positions from a record
   */
  setPositions(positions: Record<string, { x: number; y: number }>): void {
    for (const [id, pos] of Object.entries(positions)) {
      this.updateNodePosition(id, pos.x, pos.y)
    }
    this.applyPositionUpdates()
  }

  /**
   * Get the delta (movement) for a node
   */
  getNodeDelta(id: string): { dx: number; dy: number } | undefined {
    const node = this.nodes.get(id)
    if (!node) return undefined
    return {
      dx: node.x - node.originalX,
      dy: node.y - node.originalY,
    }
  }

  /**
   * Get connected edges for a node
   */
  getConnectedEdges(nodeId: string): ParsedEdge[] {
    return this.edges.filter(
      edge => edge.sourceNodeId === nodeId || edge.targetNodeId === nodeId
    )
  }

  /**
   * Apply updates to all edges (endpoints, labels, and decorations) in the DOM.
   */
  applyEdgeUpdates(): void {
    for (const edge of this.edges) {
      this.updateEdgeEndpoints(edge)
      this.maintainOrthogonalEdge(edge)
      this.updateEdgeElement(edge)
      this.updateEdgeLabel(edge)
      this.updateEdgeDecorations(edge)
    }
  }

  /**
   * Run a "polish" pass after a drag operation.
   * Keeps edges orthogonal and updates subgraph boxes to fit moved nodes.
   */
  polishLayout(): void {
    this.polishEdges()
    this.polishGroups()
  }

  private polishEdges(): void {
    for (const edge of this.edges) {
      this.updateEdgeEndpoints(edge)
      this.maintainOrthogonalEdge(edge)
      edge.points = simplifyPoints(edge.points)
      recomputeEdgeHints(edge)
      this.updateEdgeElement(edge)
      this.updateEdgeLabel(edge)
      this.updateEdgeDecorations(edge)
    }
  }

  private polishGroups(): void {
    if (!this.groups || this.groups.length === 0) return

    for (const group of this.groups) {
      if (!group.memberNodeIds || group.memberNodeIds.length === 0) continue

      const members: ParsedNode[] = []
      for (const id of group.memberNodeIds) {
        const n = this.nodes.get(id)
        if (n) members.push(n)
      }
      if (members.length === 0) continue

      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity

      for (const n of members) {
        minX = Math.min(minX, n.x)
        minY = Math.min(minY, n.y)
        maxX = Math.max(maxX, n.x + n.width)
        maxY = Math.max(maxY, n.y + n.height)
      }

      if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) continue

      const pad = group.padding || { left: 0, top: 0, right: 0, bottom: 0 }

      const newX = minX - pad.left
      const newY = minY - pad.top
      const newWidth = maxX + pad.right - newX
      const newHeight = maxY + pad.bottom - newY

      if (!isFinite(newX) || !isFinite(newY) || newWidth <= 0 || newHeight <= 0) continue

      group.outerRect.setAttribute('x', String(newX))
      group.outerRect.setAttribute('y', String(newY))
      group.outerRect.setAttribute('width', String(newWidth))
      group.outerRect.setAttribute('height', String(newHeight))

      if (group.headerRect) {
        group.headerRect.setAttribute('x', String(newX))
        group.headerRect.setAttribute('y', String(newY))
        group.headerRect.setAttribute('width', String(newWidth))
        if (group.headerHeight > 0) {
          group.headerRect.setAttribute('height', String(group.headerHeight))
        }
      }

      if (group.labelElement) {
        const off = group.labelOffset ?? { x: 12, y: group.headerHeight > 0 ? group.headerHeight / 2 : 14 }
        group.labelElement.setAttribute('x', String(newX + off.x))
        group.labelElement.setAttribute('y', String(newY + off.y))
      }
    }
  }

  private updateEdgeEndpoints(edge: ParsedEdge): void {
    if (edge.points.length < 2) return

    const first = edge.points[0]!
    const last = edge.points[edge.points.length - 1]!

    if (edge.sourceNodeId) {
      const node = this.nodes.get(edge.sourceNodeId)
      if (node) {
        const center = { x: node.x + node.width / 2, y: node.y + node.height / 2 }
        if (!edge.sourceOffset) {
          edge.sourceOffset = { x: first.x - center.x, y: first.y - center.y }
        }
        edge.points[0] = {
          x: center.x + edge.sourceOffset.x,
          y: center.y + edge.sourceOffset.y,
        }
      }
    }

    if (edge.targetNodeId) {
      const node = this.nodes.get(edge.targetNodeId)
      if (node) {
        const center = { x: node.x + node.width / 2, y: node.y + node.height / 2 }
        if (!edge.targetOffset) {
          edge.targetOffset = { x: last.x - center.x, y: last.y - center.y }
        }
        edge.points[edge.points.length - 1] = {
          x: center.x + edge.targetOffset.x,
          y: center.y + edge.targetOffset.y,
        }
      }
    }
  }

  private updateEdgeElement(edge: ParsedEdge): void {
    const element = edge.element

    const tag = element.tagName.toLowerCase()

    if (tag === 'polyline') {
      const pointsStr = edge.points.map(p => `${p.x},${p.y}`).join(' ')
      element.setAttribute('points', pointsStr)
      return
    }

    if (tag === 'line') {
      if (edge.points.length >= 2) {
        element.setAttribute('x1', String(edge.points[0]!.x))
        element.setAttribute('y1', String(edge.points[0]!.y))
        element.setAttribute('x2', String(edge.points[edge.points.length - 1]!.x))
        element.setAttribute('y2', String(edge.points[edge.points.length - 1]!.y))
      }
    }
  }

  private updateEdgeLabel(edge: ParsedEdge): void {
    if (!edge.labelInfo) return
    if (!edge.labelElement && !edge.labelBackground) return

    const desired = addPoint(
      pointOnPolyline(edge.points, edge.labelInfo.t),
      edge.labelInfo.offset
    )
    const dx = desired.x - edge.labelInfo.anchor.x
    const dy = desired.y - edge.labelInfo.anchor.y

    if (edge.labelBackground) {
      applyTranslate(edge.labelBackground, dx, dy)
    }
    if (edge.labelElement) {
      applyTranslate(edge.labelElement, dx, dy)
    }
  }

  private updateEdgeDecorations(edge: ParsedEdge): void {
    if (!edge.decorations || edge.decorations.length === 0) return
    if (edge.points.length < 2) return

    for (const deco of edge.decorations) {
      const idx = deco.endpoint === 'source' ? 0 : edge.points.length - 1
      const ep = edge.points[idx]!
      const desired = { x: ep.x + deco.offset.x, y: ep.y + deco.offset.y }
      const dx = desired.x - deco.anchor.x
      const dy = desired.y - deco.anchor.y
      applyTranslate(deco.element, dx, dy)
    }
  }

  private maintainOrthogonalEdge(edge: ParsedEdge): void {
    const element = edge.element
    const tag = element.tagName.toLowerCase()
    if (tag !== 'polyline') return

    if (edge.points.length < 2) return

    // For 2-point polylines, ensure we don't end up with a diagonal segment after dragging.
    if (edge.points.length === 2) {
      const a = edge.points[0]!
      const b = edge.points[1]!
      const dx = Math.abs(b.x - a.x)
      const dy = Math.abs(b.y - a.y)

      if (dx >= 1 && dy >= 1) {
        const verticalFirst =
          edge.firstSegmentVertical != null ? edge.firstSegmentVertical : dy >= dx
        const bend = verticalFirst ? { x: a.x, y: b.y } : { x: b.x, y: a.y }
        edge.points = [a, bend, b]
        edge.firstSegmentVertical = verticalFirst
        edge.lastSegmentVertical = !verticalFirst
      }
      return
    }

    // 3+ points: keep the first and last segments axis-aligned by adjusting the
    // adjacent points (cheap, prevents accumulating bend points during drag).
    const start = edge.points[0]!
    const end = edge.points[edge.points.length - 1]!

    const firstVertical = edge.firstSegmentVertical
    const lastVertical = edge.lastSegmentVertical

    const p1 = edge.points[1]!
    if (firstVertical === true) {
      p1.x = start.x
    } else if (firstVertical === false) {
      p1.y = start.y
    }

    const pN = edge.points[edge.points.length - 2]!
    if (lastVertical === true) {
      pN.x = end.x
    } else if (lastVertical === false) {
      pN.y = end.y
    }
  }
}

function addPoint(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y }
}

function simplifyPoints(points: Point[]): Point[] {
  if (points.length < 2) return points

  // 1) Deduplicate consecutive points
  const deduped: Point[] = [points[0]!]
  for (let i = 1; i < points.length; i++) {
    const prev = deduped[deduped.length - 1]!
    const curr = points[i]!
    if (Math.abs(curr.x - prev.x) < 0.5 && Math.abs(curr.y - prev.y) < 0.5) continue
    deduped.push(curr)
  }

  // 2) Remove collinear points
  if (deduped.length < 3) return deduped
  const out: Point[] = [deduped[0]!]
  for (let i = 1; i < deduped.length - 1; i++) {
    const a = out[out.length - 1]!
    const b = deduped[i]!
    const c = deduped[i + 1]!
    const sameX = Math.abs(a.x - b.x) < 1 && Math.abs(b.x - c.x) < 1
    const sameY = Math.abs(a.y - b.y) < 1 && Math.abs(b.y - c.y) < 1
    if (sameX || sameY) continue
    out.push(b)
  }
  out.push(deduped[deduped.length - 1]!)
  return out
}

function recomputeEdgeHints(edge: ParsedEdge): void {
  if (edge.points.length < 2) return
  const a = edge.points[0]!
  const b = edge.points[1]!
  const dx = Math.abs(b.x - a.x)
  const dy = Math.abs(b.y - a.y)
  edge.firstSegmentVertical = dx < 1 ? true : dy < 1 ? false : dy >= dx

  const last = edge.points.length - 1
  const c = edge.points[last - 1]!
  const d = edge.points[last]!
  const ldx = Math.abs(d.x - c.x)
  const ldy = Math.abs(d.y - c.y)
  edge.lastSegmentVertical = ldx < 1 ? true : ldy < 1 ? false : ldy >= ldx
}

function pointOnPolyline(points: Point[], t: number): Point {
  if (points.length === 0) return { x: 0, y: 0 }
  if (points.length === 1) return { ...points[0]! }

  const clampedT = Math.max(0, Math.min(1, t))

  // Total length
  let total = 0
  const segLens: number[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!
    const b = points[i + 1]!
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    segLens.push(len)
    total += len
  }

  if (total === 0) return { ...points[0]! }

  const target = total * clampedT
  let acc = 0
  for (let i = 0; i < segLens.length; i++) {
    const len = segLens[i]!
    const a = points[i]!
    const b = points[i + 1]!
    if (acc + len >= target) {
      const localT = len === 0 ? 0 : (target - acc) / len
      return {
        x: a.x + (b.x - a.x) * localT,
        y: a.y + (b.y - a.y) * localT,
      }
    }
    acc += len
  }

  return { ...points[points.length - 1]! }
}

function applyTranslate(element: SVGElement, dx: number, dy: number): void {
  // If no movement, restore original transform (if any).
  if (dx === 0 && dy === 0) {
    if (element.getAttribute('data-original-transform')) {
      element.setAttribute('transform', element.getAttribute('data-original-transform') || '')
    } else {
      element.removeAttribute('transform')
    }
    return
  }

  if (!element.hasAttribute('data-original-transform')) {
    element.setAttribute('data-original-transform', element.getAttribute('transform') || '')
  }

  const originalTransform = element.getAttribute('data-original-transform') || ''
  const translate = `translate(${dx}, ${dy})`

  if (originalTransform) {
    element.setAttribute('transform', `${originalTransform} ${translate}`)
  } else {
    element.setAttribute('transform', translate)
  }
}
