// ============================================================================
// SVG Parser - Parse SVG to identify nodes/edges
//
// beautiful-mermaid renders flat SVG (no per-node groups/ids). This parser:
// - Identifies draggable "nodes" by their primary shapes (rect/circle/polygon…)
// - Expands each node to include all contained elements (labels, separators, badges)
// - Identifies edges (polyline + marker-end/start lines)
// - Attaches edge labels and ER-style endpoint decorations so they move with edges
// ============================================================================

import type {
  BoundingBox,
  DiagramType,
  ParsedEdge,
  ParsedGroup,
  ParsedNode,
  Point,
  SvgNodeType,
} from '../types.ts'

export class SvgParser {
  private edgeCounter = 0

  parse(svg: SVGSVGElement): {
    nodes: ParsedNode[]
    edges: ParsedEdge[]
    groups: ParsedGroup[]
    diagramType: DiagramType
  } {
    // Ensure deterministic IDs across re-parses.
    this.edgeCounter = 0

    const diagramType = this.detectDiagramType(svg)
    const nodes = this.parseNodes(svg, diagramType)
    const edges = this.parseEdges(svg, nodes)
    const groups = this.parseGroups(svg, nodes)
    return { nodes, edges, groups, diagramType }
  }

  private detectDiagramType(svg: SVGSVGElement): DiagramType {
    // Sequence diagrams define these arrow markers.
    if (svg.querySelector('marker#seq-arrow, marker#seq-arrow-open, marker[id^="seq-"]')) {
      return 'sequence'
    }

    // Class diagrams define cls-* markers.
    if (svg.querySelector('marker[id^="cls-"]')) {
      return 'class'
    }

    // Class diagrams also contain member text (mono) with visibility symbols.
    const monoText = Array.from(svg.querySelectorAll('text.mono'))
    if (monoText.some(t => /[\+#/~]/.test(t.textContent || ''))) {
      return 'class'
    }

    // ER diagrams have key badges.
    if (svg.querySelector('rect[fill="var(--_key-badge)"]')) {
      return 'er'
    }

    // State diagrams have start/end pseudostates.
    if (
      svg.querySelector('circle[fill="var(--_text)"]') ||
      svg.querySelector('circle[fill="none"][stroke*="var(--_text)"]')
    ) {
      return 'state'
    }

    return 'flowchart'
  }

  private parseNodes(svg: SVGSVGElement, diagramType: DiagramType): ParsedNode[] {
    const textElements = Array.from(svg.querySelectorAll('text')) as SVGTextElement[]
    const shapeSelector =
      diagramType === 'sequence'
        ? 'rect, circle, polygon, ellipse, g'
        : 'rect, circle, polygon, ellipse, path'
    const shapes = Array.from(svg.querySelectorAll(shapeSelector)) as SVGElement[]

    // Candidate node shapes (exclude edge label boxes and tiny badges).
    const candidateShapes = shapes.filter(shape => {
      if (shape.closest('defs') || shape.closest('marker')) return false

      const tag = shape.tagName.toLowerCase()

      if (tag === 'rect') {
        const rect = shape as SVGRectElement
        if (this.isEdgeLabelBackground(rect)) return false

        const fill = rect.getAttribute('fill') || ''
        // Subgraph containers and headers are layout chrome, not draggable nodes.
        if (fill.includes('_group-fill') || fill.includes('_group-hdr')) return false

        const width = parseFloat(rect.getAttribute('width') || '0')
        const height = parseFloat(rect.getAttribute('height') || '0')
        if (width < 15 || height < 15) return false
      }

      if (tag === 'circle') {
        const r = parseFloat(shape.getAttribute('r') || '0')
        // Exclude tiny circles used as ER relationship markers.
        if (r < 5) return false
      }

      // Skip actor icon paths (older outputs).
      if (tag === 'g') {
        // Sequence actors are rendered as a small icon group.
        if (diagramType !== 'sequence') return false
        const g = shape as SVGGElement
        if (!g.querySelector('path[d*="M21 12C21"]')) return false
      }

      if (tag === 'path') {
        const d = shape.getAttribute('d')
        if (d && d.includes('M21 12C21')) return false
      }

      return true
    })

    const shapeGroups = this.groupShapesByProximity(candidateShapes)

    const nodes: ParsedNode[] = []
    for (const group of shapeGroups) {
      const node = this.createNodeFromShapeGroup(group, textElements)
      if (!node) continue

      // Expand to include labels, separators, key badges, etc.
      this.expandNodeElements(svg, node)
      nodes.push(node)
    }

    if (diagramType === 'sequence') {
      this.attachSequenceLifelines(svg, nodes)
    }

    return nodes
  }

  private parseEdges(svg: SVGSVGElement, nodes: ParsedNode[]): ParsedEdge[] {
    const edges: ParsedEdge[] = []

    const polylines = Array.from(svg.querySelectorAll('polyline'))
      .filter(pl => !pl.closest('defs') && !pl.closest('marker')) as SVGPolylineElement[]
    for (const pl of polylines) {
      const points = this.parsePolylinePoints(pl)
      if (points.length < 2) continue
      edges.push(this.createEdge(pl, points, nodes))
    }

    const lines = Array.from(svg.querySelectorAll('line'))
      .filter(l => !l.closest('defs') && !l.closest('marker')) as SVGLineElement[]
    for (const line of lines) {
      // Only treat marker-bearing lines as edges (sequence messages).
      if (!line.hasAttribute('marker-end') && !line.hasAttribute('marker-start')) continue
      edges.push(this.createEdge(line, this.parseLinePoints(line), nodes))
    }

    this.attachEdgeLabels(svg, edges, nodes)
    this.attachEdgeDecorations(svg, edges, nodes)

    return edges
  }

  private parseGroups(svg: SVGSVGElement, nodes: ParsedNode[]): ParsedGroup[] {
    const outerRects = Array.from(svg.querySelectorAll('rect'))
      .filter(r => !r.closest('defs') && !r.closest('marker'))
      .filter(r => (r.getAttribute('fill') || '').includes('_group-fill')) as SVGRectElement[]

    if (outerRects.length === 0) return []

    const headerRects = Array.from(svg.querySelectorAll('rect'))
      .filter(r => !r.closest('defs') && !r.closest('marker'))
      .filter(r => (r.getAttribute('fill') || '').includes('_group-hdr')) as SVGRectElement[]

    const texts = Array.from(svg.querySelectorAll('text'))
      .filter(t => !t.closest('defs') && !t.closest('marker')) as SVGTextElement[]

    const groups: ParsedGroup[] = []

    for (const outer of outerRects) {
      const x = parseFloat(outer.getAttribute('x') || '0')
      const y = parseFloat(outer.getAttribute('y') || '0')
      const width = parseFloat(outer.getAttribute('width') || '0')
      const height = parseFloat(outer.getAttribute('height') || '0')

      if (!isFinite(x) || !isFinite(y) || width <= 0 || height <= 0) continue

      const header = headerRects.find(hr => {
        const hx = parseFloat(hr.getAttribute('x') || '0')
        const hy = parseFloat(hr.getAttribute('y') || '0')
        const hw = parseFloat(hr.getAttribute('width') || '0')
        return Math.abs(hx - x) < 0.01 && Math.abs(hy - y) < 0.01 && Math.abs(hw - width) < 0.01
      })

      const headerHeight = header ? parseFloat(header.getAttribute('height') || '0') : 0
      const headerBox: BoundingBox = header
        ? { x, y, width, height: isFinite(headerHeight) ? headerHeight : 0 }
        : { x, y, width, height: Math.min(30, height) }

      // Find header label text inside the header band.
      let labelEl: SVGTextElement | undefined
      const headerTexts = texts.filter(t => {
        const pt = this.getTextAnchorPoint(t)
        if (!pt) return false
        if (!pointInBBox(pt, headerBox, 1)) return false
        const fill = t.getAttribute('fill') || ''
        if (fill && !fill.includes('_text-sec')) return false
        return true
      })
      if (headerTexts.length > 0) {
        // Prefer the left-most one (stable for "Group label").
        headerTexts.sort((a, b) => {
          const ax = parseFloat(a.getAttribute('x') || '0')
          const bx = parseFloat(b.getAttribute('x') || '0')
          return ax - bx
        })
        labelEl = headerTexts[0]
      }

      const outerBox: BoundingBox = { x, y, width, height }
      const memberNodeIds = nodes
        .filter(n => {
          const center = { x: n.originalX + n.width / 2, y: n.originalY + n.height / 2 }
          return pointInBBox(center, outerBox, 1)
        })
        .map(n => n.id)

      const padding = { left: 0, top: 0, right: 0, bottom: 0 }
      if (memberNodeIds.length > 0) {
        const members = memberNodeIds
          .map(id => nodes.find(n => n.id === id))
          .filter(Boolean) as ParsedNode[]

        let minX = Infinity
        let minY = Infinity
        let maxX = -Infinity
        let maxY = -Infinity
        for (const n of members) {
          minX = Math.min(minX, n.originalX)
          minY = Math.min(minY, n.originalY)
          maxX = Math.max(maxX, n.originalX + n.width)
          maxY = Math.max(maxY, n.originalY + n.height)
        }

        if (isFinite(minX) && isFinite(minY) && isFinite(maxX) && isFinite(maxY)) {
          padding.left = minX - x
          padding.top = minY - y
          padding.right = x + width - maxX
          padding.bottom = y + height - maxY
        }
      }

      const labelOffset =
        labelEl && isFinite(parseFloat(labelEl.getAttribute('x') || '')) && isFinite(parseFloat(labelEl.getAttribute('y') || ''))
          ? {
              x: parseFloat(labelEl.getAttribute('x') || '0') - x,
              y: parseFloat(labelEl.getAttribute('y') || '0') - y,
            }
          : undefined

      const id = this.generateGroupId({ x, y, width, height }, labelEl?.textContent?.trim() || undefined)

      groups.push({
        id,
        outerRect: outer,
        headerRect: header,
        labelElement: labelEl,
        originalX: x,
        originalY: y,
        originalWidth: width,
        originalHeight: height,
        headerHeight: isFinite(headerHeight) ? headerHeight : 0,
        memberNodeIds,
        padding,
        labelOffset,
      })
    }

    return groups
  }

  private createNodeFromShapeGroup(
    shapes: SVGElement[],
    textElements: SVGTextElement[]
  ): ParsedNode | null {
    if (shapes.length === 0) return null

    const combinedBbox = unionBBox(shapes.map(s => this.getBBox(s)))
    if (!combinedBbox) return null

    const primaryShape = this.findPrimaryShape(shapes)
    const type = this.detectNodeType(primaryShape, shapes)
    const labelEl = this.pickNodeLabelElement(combinedBbox, textElements)
    const label = labelEl?.textContent?.trim() || undefined

    const id = this.generateNodeId(combinedBbox, label)

    const elements = labelEl ? [...shapes, labelEl as unknown as SVGElement] : (shapes as SVGElement[])

    return {
      id,
      elements,
      x: combinedBbox.x,
      y: combinedBbox.y,
      width: combinedBbox.width,
      height: combinedBbox.height,
      type,
      label,
      originalX: combinedBbox.x,
      originalY: combinedBbox.y,
    }
  }

  private expandNodeElements(svg: SVGSVGElement, node: ParsedNode): void {
    const bbox: BoundingBox = {
      x: node.originalX,
      y: node.originalY,
      width: node.width,
      height: node.height,
    }

    const elements = new Set<SVGElement>(node.elements)
    const candidates = Array.from(
      svg.querySelectorAll('text, line, rect, circle, ellipse, polygon, path')
    ) as SVGElement[]

    for (const el of candidates) {
      if (el.closest('defs') || el.closest('marker')) continue
      const tag = el.tagName.toLowerCase()

      // If an ancestor is already moved via a grouped element, don't double-transform children.
      let parent: Element | null = el.parentElement
      let skip = false
      while (parent) {
        if (elements.has(parent as unknown as SVGElement)) {
          skip = true
          break
        }
        parent = parent.parentElement
      }
      if (skip) continue

      // Never absorb connectors.
      if (tag === 'polyline') continue
      if (tag === 'line') {
        const line = el as SVGLineElement
        if (line.hasAttribute('marker-end') || line.hasAttribute('marker-start')) continue
      }

      if (tag === 'rect' && this.isEdgeLabelBackground(el as SVGRectElement)) continue
      if (tag === 'rect') {
        const fill = el.getAttribute('fill') || ''
        // Never absorb subgraph chrome into a node (can otherwise happen when the
        // group center falls inside a child node's bbox, e.g. a single-node subgraph).
        if (fill.includes('_group-fill') || fill.includes('_group-hdr')) continue
      }

      const anchor = this.getElementAnchorPoint(el)
      if (!anchor) continue

      if (pointInBBox(anchor, bbox, 1)) {
        elements.add(el)
      }
    }

    node.elements = Array.from(elements)
  }

  private attachSequenceLifelines(svg: SVGSVGElement, nodes: ParsedNode[]): void {
    const dashedLines = Array.from(svg.querySelectorAll('line[stroke-dasharray]')) as SVGLineElement[]

    const lifelines = dashedLines.filter(l => {
      const dash = l.getAttribute('stroke-dasharray') || ''
      if (!dash.includes('6 4')) return false

      const x1 = parseFloat(l.getAttribute('x1') || '0')
      const y1 = parseFloat(l.getAttribute('y1') || '0')
      const x2 = parseFloat(l.getAttribute('x2') || '0')
      const y2 = parseFloat(l.getAttribute('y2') || '0')

      return Math.abs(x1 - x2) < 0.5 && Math.abs(y2 - y1) > 40 && y2 > y1
    })

    // Activation boxes are narrow rects drawn on the lifeline x coordinate.
    const activationRects = Array.from(svg.querySelectorAll('rect'))
      .filter(r => !r.closest('defs') && !r.closest('marker')) as SVGRectElement[]

    const activations = activationRects.filter(r => {
      const width = parseFloat(r.getAttribute('width') || '0')
      const height = parseFloat(r.getAttribute('height') || '0')
      if (width <= 0 || height <= 0) return false

      // Sequence activation boxes are narrow (activationWidth ~ 10px) and tall.
      if (width >= 15 || height < 15) return false

      const fill = r.getAttribute('fill') || ''
      const stroke = r.getAttribute('stroke') || ''
      if (!fill.includes('_node-fill')) return false
      if (!stroke.includes('_node-stroke')) return false

      return true
    })

    for (const node of nodes) {
      const centerX = node.originalX + node.width / 2

      for (const line of lifelines) {
        const x1 = parseFloat(line.getAttribute('x1') || '0')
        const y1 = parseFloat(line.getAttribute('y1') || '0')

        // Lifelines start near the diagram header band; match by lane x-coordinate.
        if (Math.abs(x1 - centerX) < 1.5 && y1 <= node.originalY + node.height + 60) {
          const el = line as unknown as SVGElement
          if (!node.elements.includes(el)) {
            node.elements.push(el)
          }
        }
      }

      for (const rect of activations) {
        const x = parseFloat(rect.getAttribute('x') || '0')
        const width = parseFloat(rect.getAttribute('width') || '0')
        const rectCenterX = x + width / 2

        if (Math.abs(rectCenterX - centerX) < 1.5) {
          const el = rect as unknown as SVGElement
          if (!node.elements.includes(el)) {
            node.elements.push(el)
          }
        }
      }
    }
  }

  private attachEdgeLabels(svg: SVGSVGElement, edges: ParsedEdge[], nodes: ParsedNode[]): void {
    if (edges.length === 0) return

    const nodeBoxes = nodes.map(n => ({
      x: n.originalX,
      y: n.originalY,
      width: n.width,
      height: n.height,
    }))
    const isInsideAnyNode = (p: Point) => nodeBoxes.some(b => pointInBBox(p, b, 1))

    const allTexts = Array.from(svg.querySelectorAll('text'))
      .filter(t => !t.closest('defs') && !t.closest('marker')) as SVGTextElement[]

    const usedTexts = new Set<SVGTextElement>()
    const usedRects = new Set<SVGRectElement>()

    // Backgrounded labels (rect + text)
    const rects = Array.from(svg.querySelectorAll('rect'))
      .filter(r => !r.closest('defs') && !r.closest('marker')) as SVGRectElement[]

    for (const rect of rects) {
      if (!this.isEdgeLabelBackground(rect)) continue

      const rectBox = this.getBBox(rect)
      const center: Point = {
        x: rectBox.x + rectBox.width / 2,
        y: rectBox.y + rectBox.height / 2,
      }

      // Find a text element inside the rect.
      let bestText: SVGTextElement | null = null
      let bestDist = Infinity
      for (const t of allTexts) {
        const pt = this.getTextAnchorPoint(t)
        if (!pt) continue
        if (!pointInBBox(pt, rectBox, 2)) continue
        const d = Math.hypot(pt.x - center.x, pt.y - center.y)
        if (d < bestDist) {
          bestDist = d
          bestText = t
        }
      }

      const match = this.findNearestEdge(edges, center)
      if (!match) continue

      match.edge.labelBackground = rect
      usedRects.add(rect)

      if (bestText) {
        match.edge.labelElement = bestText
        usedTexts.add(bestText)
      }

      match.edge.labelInfo = {
        t: match.t,
        offset: { x: center.x - match.closest.x, y: center.y - match.closest.y },
        anchor: center,
      }
    }

    // Text-only labels (sequence, class, etc.)
    for (const t of allTexts) {
      if (usedTexts.has(t)) continue

      const anchor = this.getTextAnchorPoint(t)
      if (!anchor) continue
      if (isInsideAnyNode(anchor)) continue

      // Skip texts inside any already-handled label rect.
      const insideLabelRect = Array.from(usedRects).some(r =>
        pointInBBox(anchor, this.getBBox(r), 2)
      )
      if (insideLabelRect) continue

      const match = this.findNearestEdge(edges, anchor)
      if (!match) continue
      if (match.edge.labelElement) continue

      match.edge.labelElement = t
      match.edge.labelInfo = {
        t: match.t,
        offset: { x: anchor.x - match.closest.x, y: anchor.y - match.closest.y },
        anchor,
      }
    }
  }

  private attachEdgeDecorations(svg: SVGSVGElement, edges: ParsedEdge[], nodes: ParsedNode[]): void {
    if (edges.length === 0) return

    const nodeElementSet = new Set<SVGElement>()
    for (const n of nodes) {
      for (const el of n.elements) nodeElementSet.add(el)
    }

    const candidates: SVGElement[] = [
      ...Array.from(svg.querySelectorAll('line')).filter(el => !el.closest('defs') && !el.closest('marker')),
      ...Array.from(svg.querySelectorAll('circle')).filter(el => !el.closest('defs') && !el.closest('marker')),
    ]

    for (const el of candidates) {
      if (nodeElementSet.has(el)) continue

      // Ignore base edge lines (marker-bearing).
      const tag = el.tagName.toLowerCase()

      if (tag === 'line') {
        const line = el as SVGLineElement
        if (line.hasAttribute('marker-end') || line.hasAttribute('marker-start')) continue

        // Skip sequence lifelines (vertical dashed).
        const dash = line.getAttribute('stroke-dasharray') || ''
        const x1 = parseFloat(line.getAttribute('x1') || '0')
        const y1 = parseFloat(line.getAttribute('y1') || '0')
        const x2 = parseFloat(line.getAttribute('x2') || '0')
        const y2 = parseFloat(line.getAttribute('y2') || '0')
        if (dash.includes('6 4') && Math.abs(x1 - x2) < 0.5 && Math.abs(y2 - y1) > 40) continue

        const len = Math.hypot(x2 - x1, y2 - y1)
        if (len > 40) continue
      }

      if (tag === 'circle') {
        const c = el as SVGCircleElement
        const r = parseFloat(c.getAttribute('r') || '0')
        if (r > 8) continue
      }

      const stroke = el.getAttribute('stroke') || ''
      if (!stroke.includes('--_line')) continue

      const anchor = this.getElementAnchorPoint(el)
      if (!anchor) continue

      let best: { edge: ParsedEdge; endpoint: 'source' | 'target'; dist: number; ep: Point } | null = null

      for (const edge of edges) {
        if (edge.points.length < 2) continue
        const source = edge.points[0]!
        const target = edge.points[edge.points.length - 1]!

        const ds = Math.hypot(anchor.x - source.x, anchor.y - source.y)
        const dt = Math.hypot(anchor.x - target.x, anchor.y - target.y)

        if (ds <= dt) {
          if (!best || ds < best.dist) best = { edge, endpoint: 'source', dist: ds, ep: source }
        } else {
          if (!best || dt < best.dist) best = { edge, endpoint: 'target', dist: dt, ep: target }
        }
      }

      if (!best || best.dist > 35) continue

      if (!best.edge.decorations) best.edge.decorations = []
      best.edge.decorations.push({
        element: el,
        endpoint: best.endpoint,
        offset: { x: anchor.x - best.ep.x, y: anchor.y - best.ep.y },
        anchor,
      })
    }
  }

  private isEdgeLabelBackground(rect: SVGRectElement): boolean {
    const stroke = rect.getAttribute('stroke') || ''
    const fill = rect.getAttribute('fill') || ''
    const height = parseFloat(rect.getAttribute('height') || '0')

    // Edge label boxes use var(--_inner-stroke) by convention.
    if (!stroke.includes('_inner-stroke')) return false

    // Labels are short; large inner-stroke rects are usually layout containers (subgraphs, etc.).
    if (height > 40) return false

    // Label backgrounds are drawn on the SVG background color.
    if (fill && fill !== 'var(--bg)') return false

    return true
  }

  private groupShapesByProximity(shapes: SVGElement[]): SVGElement[][] {
    const groups: SVGElement[][] = []
    const used = new Set<SVGElement>()

    for (const shape of shapes) {
      if (used.has(shape)) continue

      const bbox = this.getBBox(shape)
      const center = { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 }

      const group: SVGElement[] = [shape]
      used.add(shape)

      for (const other of shapes) {
        if (used.has(other)) continue

        const ob = this.getBBox(other)
        const oc = { x: ob.x + ob.width / 2, y: ob.y + ob.height / 2 }

        const dist = Math.hypot(center.x - oc.x, center.y - oc.y)
        const thresh = Math.max(bbox.width, bbox.height, ob.width, ob.height) * 0.5

        if (dist < thresh) {
          group.push(other)
          used.add(other)
        }
      }

      groups.push(group)
    }

    return groups
  }

  private findPrimaryShape(shapes: SVGElement[]): SVGElement {
    let largest = shapes[0]!
    let largestArea = 0

    for (const shape of shapes) {
      const bbox = this.getBBox(shape)
      const area = bbox.width * bbox.height
      if (area > largestArea) {
        largest = shape
        largestArea = area
      }
    }

    return largest
  }

  private detectNodeType(shape: SVGElement, allShapes: SVGElement[]): SvgNodeType {
    const tagName = shape.tagName.toLowerCase()

    if (tagName === 'circle') {
      if (allShapes.length > 1) return 'doublecircle'
      return 'circle'
    }

    if (tagName === 'ellipse') return 'ellipse'
    if (tagName === 'polygon') return 'polygon'

    if (tagName === 'rect') {
      const rx = parseFloat(shape.getAttribute('rx') || '0')
      const ry = parseFloat(shape.getAttribute('ry') || '0')

      if (rx > 0 && ry > 0) {
        if (rx >= ry) return 'stadium'
        return 'rounded'
      }

      return 'rect'
    }

    return 'unknown'
  }

  private pickNodeLabelElement(
    bbox: BoundingBox,
    textElements: SVGTextElement[]
  ): SVGTextElement | undefined {
    const inside: SVGTextElement[] = []

    for (const t of textElements) {
      const pt = this.getTextAnchorPoint(t)
      if (!pt) continue
      if (pointInBBox(pt, bbox, 2)) {
        inside.push(t)
      }
    }

    if (inside.length === 0) {
      // Sequence actor icons render their label just below the icon group (outside bbox).
      const centerX = bbox.x + bbox.width / 2
      const bottomY = bbox.y + bbox.height
      let best: { el: SVGTextElement; dy: number } | null = null

      for (const t of textElements) {
        const pt = this.getTextAnchorPoint(t)
        if (!pt) continue
        if (Math.abs(pt.x - centerX) > 4) continue
        if (pt.y < bottomY - 2 || pt.y > bottomY + 40) continue

        const dy = pt.y - bottomY
        if (!best || dy < best.dy) best = { el: t, dy }
      }

      return best?.el
    }

    // Prefer non-mono header labels for class/ER diagrams.
    const nonMono = inside.filter(t => !t.classList.contains('mono'))
    const candidates = nonMono.length > 0 ? nonMono : inside

    // Then pick the top-most label (stable for headers).
    candidates.sort((a, b) => {
      const ay = parseFloat(a.getAttribute('y') || '0')
      const by = parseFloat(b.getAttribute('y') || '0')
      return ay - by
    })

    return candidates[0]
  }

  private parsePolylinePoints(polyline: SVGPolylineElement): Point[] {
    const pointsAttr = polyline.getAttribute('points')
    if (!pointsAttr) return []

    const points: Point[] = []
    const coords = pointsAttr.trim().split(/\s+/)

    for (const coord of coords) {
      const [x, y] = coord.split(',').map(Number)
      if (!isNaN(x) && !isNaN(y)) {
        points.push({ x, y })
      }
    }

    return points
  }

  private parseLinePoints(line: SVGLineElement): Point[] {
    const x1 = parseFloat(line.getAttribute('x1') || '0')
    const y1 = parseFloat(line.getAttribute('y1') || '0')
    const x2 = parseFloat(line.getAttribute('x2') || '0')
    const y2 = parseFloat(line.getAttribute('y2') || '0')

    return [{ x: x1, y: y1 }, { x: x2, y: y2 }]
  }

  private createEdge(
    element: SVGPolylineElement | SVGLineElement,
    points: Point[],
    nodes: ParsedNode[]
  ): ParsedEdge {
    const firstPoint = points[0]!
    const lastPoint = points[points.length - 1]!

    const sourceNodeId = this.findNodeAtPoint(firstPoint, nodes)
    const targetNodeId = this.findNodeAtPoint(lastPoint, nodes)

    const edge: ParsedEdge = {
      id: `edge-${this.edgeCounter++}`,
      element,
      points,
      sourceNodeId,
      targetNodeId,
    }

    // Cache endpoint offsets so edges can be updated without re-parsing.
    if (sourceNodeId) {
      const sourceNode = nodes.find(n => n.id === sourceNodeId)
      if (sourceNode) {
        const center = {
          x: sourceNode.x + sourceNode.width / 2,
          y: sourceNode.y + sourceNode.height / 2,
        }
        edge.sourceOffset = {
          x: firstPoint.x - center.x,
          y: firstPoint.y - center.y,
        }
      }
    }

    if (targetNodeId) {
      const targetNode = nodes.find(n => n.id === targetNodeId)
      if (targetNode) {
        const center = {
          x: targetNode.x + targetNode.width / 2,
          y: targetNode.y + targetNode.height / 2,
        }
        edge.targetOffset = {
          x: lastPoint.x - center.x,
          y: lastPoint.y - center.y,
        }
      }
    }

    // Routing hints for keeping polylines orthogonal while endpoints move.
    if (points.length >= 2) {
      const a = points[0]!
      const b = points[1] ?? points[points.length - 1]!
      const dx = Math.abs(b.x - a.x)
      const dy = Math.abs(b.y - a.y)
      // For diagonal first segments, fall back to the dominant axis.
      edge.firstSegmentVertical = dx < 1 ? true : dy < 1 ? false : dy >= dx

      const last = points.length - 1
      const c = points[last - 1]!
      const d = points[last]!
      const ldx = Math.abs(d.x - c.x)
      const ldy = Math.abs(d.y - c.y)
      edge.lastSegmentVertical = ldx < 1 ? true : ldy < 1 ? false : ldy >= ldx
    }

    return edge
  }

  private findNearestEdge(
    edges: ParsedEdge[],
    p: Point
  ): { edge: ParsedEdge; t: number; closest: Point; dist: number } | null {
    let best: { edge: ParsedEdge; t: number; closest: Point; dist: number } | null = null

    for (const edge of edges) {
      const res = closestPointOnPolyline(p, edge.points)
      if (!best || res.dist < best.dist) {
        best = { edge, t: res.t, closest: res.closest, dist: res.dist }
      }
    }

    // Only attach labels if the label is reasonably close to an edge.
    if (best && best.dist <= 30) return best
    return null
  }

  private findNodeAtPoint(point: Point, nodes: ParsedNode[]): string | undefined {
    const threshold = 30 // px

    for (const node of nodes) {
      const nodeCenter = {
        x: node.x + node.width / 2,
        y: node.y + node.height / 2,
      }

      const distance = Math.hypot(point.x - nodeCenter.x, point.y - nodeCenter.y)

      if (distance < Math.max(node.width, node.height) / 2 + threshold) {
        return node.id
      }
    }

    return undefined
  }

  private generateNodeId(bbox: BoundingBox, label?: string): string {
    const x = Math.round(bbox.x)
    const y = Math.round(bbox.y)
    const hash = simpleHash(`${x},${y},${label || ''}`)
    return `node-${hash}`
  }

  private generateGroupId(bbox: BoundingBox, label?: string): string {
    const x = Math.round(bbox.x)
    const y = Math.round(bbox.y)
    const w = Math.round(bbox.width)
    const h = Math.round(bbox.height)
    const hash = simpleHash(`${x},${y},${w},${h},${label || ''}`)
    return `group-${hash}`
  }

  private getTextAnchorPoint(text: SVGTextElement): Point | null {
    const xAttr = text.getAttribute('x')
    const yAttr = text.getAttribute('y')
    if (!xAttr || !yAttr) return null

    const x = parseFloat(xAttr)
    const y = parseFloat(yAttr)
    if (!isFinite(x) || !isFinite(y)) return null

    return { x, y }
  }

  private getElementAnchorPoint(el: SVGElement): Point | null {
    const tag = el.tagName.toLowerCase()

    if (tag === 'text') {
      return this.getTextAnchorPoint(el as unknown as SVGTextElement)
    }

    if (tag === 'line') {
      const l = el as SVGLineElement
      const x1 = parseFloat(l.getAttribute('x1') || '0')
      const y1 = parseFloat(l.getAttribute('y1') || '0')
      const x2 = parseFloat(l.getAttribute('x2') || '0')
      const y2 = parseFloat(l.getAttribute('y2') || '0')
      return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 }
    }

    const bbox = this.getBBox(el)
    return { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 }
  }

  private getBBox(element: SVGElement): BoundingBox {
    const tag = element.tagName.toLowerCase()

    if (tag === 'rect') {
      const x = parseFloat(element.getAttribute('x') || '0')
      const y = parseFloat(element.getAttribute('y') || '0')
      const width = parseFloat(element.getAttribute('width') || '0')
      const height = parseFloat(element.getAttribute('height') || '0')
      return { x, y, width, height }
    }

    if (tag === 'circle') {
      const cx = parseFloat(element.getAttribute('cx') || '0')
      const cy = parseFloat(element.getAttribute('cy') || '0')
      const r = parseFloat(element.getAttribute('r') || '0')
      return { x: cx - r, y: cy - r, width: r * 2, height: r * 2 }
    }

    if (tag === 'ellipse') {
      const cx = parseFloat(element.getAttribute('cx') || '0')
      const cy = parseFloat(element.getAttribute('cy') || '0')
      const rx = parseFloat(element.getAttribute('rx') || '0')
      const ry = parseFloat(element.getAttribute('ry') || '0')
      return { x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2 }
    }

    if (tag === 'line') {
      const x1 = parseFloat(element.getAttribute('x1') || '0')
      const y1 = parseFloat(element.getAttribute('y1') || '0')
      const x2 = parseFloat(element.getAttribute('x2') || '0')
      const y2 = parseFloat(element.getAttribute('y2') || '0')
      const x = Math.min(x1, x2)
      const y = Math.min(y1, y2)
      return { x, y, width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) }
    }

    if (tag === 'polygon' || tag === 'polyline') {
      const pointsAttr = element.getAttribute('points') || ''
      const pts = parsePointsAttr(pointsAttr)
      return pts.length === 0 ? { x: 0, y: 0, width: 0, height: 0 } : bboxFromPoints(pts)
    }

    if (tag === 'g') {
      const g = element as SVGGElement
      // Actor icons in sequence diagrams are rendered as a <g> with a known 24x24-ish path set.
      // happy-dom doesn't implement getBBox() for <g>, so approximate from transform.
      if (g.querySelector('path[d*="M21 12C21"]')) {
        const { tx, ty, sx, sy } = parseTransform(g.getAttribute('transform') || '')
        const local = { x: 3, y: 3, width: 18, height: 18 } // icon path bounds
        return {
          x: tx + local.x * sx,
          y: ty + local.y * sy,
          width: local.width * sx,
          height: local.height * sy,
        }
      }
    }

    // For paths and anything else, fall back to getBBox() if available.
    try {
      const bbox = (element as unknown as SVGGraphicsElement).getBBox()
      return { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height }
    } catch {
      return { x: 0, y: 0, width: 0, height: 0 }
    }
  }
}

// Singleton instance (keeps ID generation stable across parses).
let parserInstance: SvgParser | null = null

export function getSvgParser(): SvgParser {
  if (!parserInstance) {
    parserInstance = new SvgParser()
  }
  return parserInstance
}

function pointInBBox(p: Point, bbox: BoundingBox, pad: number): boolean {
  return (
    p.x >= bbox.x - pad &&
    p.x <= bbox.x + bbox.width + pad &&
    p.y >= bbox.y - pad &&
    p.y <= bbox.y + bbox.height + pad
  )
}

function unionBBox(boxes: BoundingBox[]): BoundingBox | null {
  if (boxes.length === 0) return null

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const b of boxes) {
    minX = Math.min(minX, b.x)
    minY = Math.min(minY, b.y)
    maxX = Math.max(maxX, b.x + b.width)
    maxY = Math.max(maxY, b.y + b.height)
  }

  if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) return null

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36)
}

function parseTransform(transform: string): { tx: number; ty: number; sx: number; sy: number } {
  let tx = 0
  let ty = 0
  let sx = 1
  let sy = 1

  const tMatch = transform.match(/translate\(([^)]+)\)/)
  if (tMatch) {
    const parts = tMatch[1]!.trim().split(/[ ,]+/).filter(Boolean).map(Number)
    if (isFinite(parts[0]!)) tx = parts[0]!
    if (isFinite(parts[1]!)) ty = parts[1]!
  }

  const sMatch = transform.match(/scale\(([^)]+)\)/)
  if (sMatch) {
    const parts = sMatch[1]!.trim().split(/[ ,]+/).filter(Boolean).map(Number)
    if (isFinite(parts[0]!)) {
      sx = parts[0]!
      sy = parts.length > 1 && isFinite(parts[1]!) ? parts[1]! : parts[0]!
    }
  }

  return { tx, ty, sx, sy }
}

function closestPointOnPolyline(p: Point, points: Point[]): { closest: Point; dist: number; t: number } {
  if (points.length === 0) return { closest: { x: 0, y: 0 }, dist: Infinity, t: 0 }
  if (points.length === 1) return { closest: { ...points[0]! }, dist: Math.hypot(p.x - points[0]!.x, p.y - points[0]!.y), t: 0 }

  let totalLen = 0
  let bestDist2 = Infinity
  let bestAlong = 0
  let bestPoint: Point = { ...points[0]! }

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!
    const b = points[i + 1]!
    const abx = b.x - a.x
    const aby = b.y - a.y
    const segLen = Math.hypot(abx, aby)

    if (segLen === 0) continue

    const apx = p.x - a.x
    const apy = p.y - a.y
    const tSeg = clamp01((apx * abx + apy * aby) / (segLen * segLen))

    const cp: Point = { x: a.x + abx * tSeg, y: a.y + aby * tSeg }
    const dx = p.x - cp.x
    const dy = p.y - cp.y
    const dist2 = dx * dx + dy * dy

    if (dist2 < bestDist2) {
      bestDist2 = dist2
      bestAlong = totalLen + segLen * tSeg
      bestPoint = cp
    }

    totalLen += segLen
  }

  const t = totalLen === 0 ? 0 : bestAlong / totalLen
  return { closest: bestPoint, dist: Math.sqrt(bestDist2), t }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

function parsePointsAttr(pointsAttr: string): Point[] {
  const pts: Point[] = []
  const coords = pointsAttr.trim().split(/\s+/)
  for (const coord of coords) {
    const [x, y] = coord.split(',').map(Number)
    if (!isNaN(x) && !isNaN(y)) pts.push({ x, y })
  }
  return pts
}

function bboxFromPoints(pts: Point[]): BoundingBox {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const p of pts) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}
