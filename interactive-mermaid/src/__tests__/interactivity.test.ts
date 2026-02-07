// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest'
import { Window } from 'happy-dom'

import { renderMermaid } from '../../../dist/index.js'
import { getSvgParser } from '../core/svg-parser.ts'
import { NodeTracker } from '../core/node-tracker.ts'

function ensureDom(): void {
  // bun's test runner doesn't provide DOM globals; vitest's happy-dom does.
  if (typeof document !== 'undefined') return
  const win = new Window()
  ;(globalThis as unknown as { window: unknown }).window = win
  ;(globalThis as unknown as { document: unknown }).document = win.document
}

ensureDom()

function parseSvg(svgStr: string): SVGSVGElement {
  const container = document.createElement('div')
  container.innerHTML = svgStr
  const svg = container.querySelector('svg')
  if (!svg) throw new Error('No <svg> found')
  return svg as unknown as SVGSVGElement
}

describe('interactive-mermaid', () => {
  it('parses flowchart nodes and edges without treating edge labels as nodes', async () => {
    const src = `graph TD
  A[Start] --> B{Decision}
  B -->|Yes| C[Action]
  B -->|No| D[End]`

    const svgStr = await renderMermaid(src)
    const svg = parseSvg(svgStr)

    const parser = getSvgParser()
    const { diagramType, nodes, edges } = parser.parse(svg)

    expect(diagramType).toBe('flowchart')
    expect(nodes).toHaveLength(4)
    expect(nodes.map(n => n.label)).toEqual(['Start', 'Decision', 'Action', 'End'])

    // We should not "node-ify" the edge label boxes (Yes/No).
    expect(nodes.some(n => n.label === 'Yes' || n.label === 'No')).toBe(false)

    expect(edges).toHaveLength(3)
    expect(edges.map(e => e.labelElement?.textContent?.trim() || null)).toEqual([null, 'Yes', 'No'])
  })

  it('moves node labels and keeps connected edge geometry + edge labels in sync', async () => {
    const src = `graph TD
  A[Start] --> B{Decision}
  B -->|Yes| C[Action]
  B -->|No| D[End]`

    const svgStr = await renderMermaid(src)
    const svg = parseSvg(svgStr)

    const parser = getSvgParser()
    const { nodes, edges } = parser.parse(svg)

    const tracker = new NodeTracker(nodes, edges)

    const action = nodes.find(n => n.label === 'Action')
    expect(action).toBeTruthy()
    if (!action) return

    const yesEdge = edges.find(e => e.labelElement?.textContent?.trim() === 'Yes')
    expect(yesEdge).toBeTruthy()
    if (!yesEdge) return

    const beforeX = yesEdge.points[yesEdge.points.length - 1]!.x

    // Move Action node right by 50px.
    tracker.updateNodePosition(action.id, action.x + 50, action.y)
    tracker.applyPositionUpdates()

    const actionText = action.elements.find(
      e => e.tagName.toLowerCase() === 'text' && (e.textContent || '').trim() === 'Action'
    )
    expect(actionText?.getAttribute('transform')).toContain('translate(50')

    const afterX = yesEdge.points[yesEdge.points.length - 1]!.x
    expect(afterX).toBeCloseTo(beforeX + 50, 6)

    // Edge label background + text should move too.
    expect(yesEdge.labelBackground?.getAttribute('transform')).toMatch(/^translate\(/)
    expect(yesEdge.labelElement?.getAttribute('transform')).toMatch(/^translate\(/)

    // Edge should remain orthogonal (no diagonal segments) while dragging.
    for (let i = 0; i < yesEdge.points.length - 1; i++) {
      const a = yesEdge.points[i]!
      const b = yesEdge.points[i + 1]!
      const dx = Math.abs(a.x - b.x)
      const dy = Math.abs(a.y - b.y)
      expect(dx < 1 || dy < 1).toBe(true)
    }
  })

  it('attaches and moves sequence lifelines with participants', async () => {
    const src = `sequenceDiagram
  participant User
  participant Server

  User->>Server: Request`

    const svgStr = await renderMermaid(src)
    const svg = parseSvg(svgStr)

    const parser = getSvgParser()
    const { diagramType, nodes, edges } = parser.parse(svg)

    expect(diagramType).toBe('sequence')
    expect(nodes).toHaveLength(2)
    expect(edges).toHaveLength(1)

    const user = nodes.find(n => n.label === 'User')
    expect(user).toBeTruthy()
    if (!user) return

    const hasDashedLifeline = user.elements.some(el => {
      if (el.tagName.toLowerCase() !== 'line') return false
      const dash = el.getAttribute('stroke-dasharray') || ''
      return dash.includes('6 4')
    })
    expect(hasDashedLifeline).toBe(true)
  })

  it('attaches sequence activation boxes to the correct participant lane', async () => {
    const src = `sequenceDiagram
  participant User
  participant Server

  User->>+Server: Request
  Server-->>User: Response`

    const svgStr = await renderMermaid(src)
    const svg = parseSvg(svgStr)

    const parser = getSvgParser()
    const { diagramType, nodes, edges } = parser.parse(svg)

    expect(diagramType).toBe('sequence')
    expect(nodes).toHaveLength(2)
    expect(edges.length).toBeGreaterThanOrEqual(2)

    const server = nodes.find(n => n.label === 'Server')
    expect(server).toBeTruthy()
    if (!server) return

    const activationRects = Array.from(svg.querySelectorAll('rect')).filter(r => {
      const w = parseFloat(r.getAttribute('width') || '0')
      const h = parseFloat(r.getAttribute('height') || '0')
      const fill = r.getAttribute('fill') || ''
      const stroke = r.getAttribute('stroke') || ''
      return w > 0 && w < 15 && h > 15 && fill.includes('_node-fill') && stroke.includes('_node-stroke')
    }) as SVGRectElement[]

    expect(activationRects.length).toBeGreaterThanOrEqual(1)
    const activation = activationRects[0]
    if (!activation) return

    expect(server.elements.includes(activation as unknown as SVGElement)).toBe(true)

    const tracker = new NodeTracker(nodes, edges)
    tracker.updateNodePosition(server.id, server.x + 30, server.y)
    tracker.applyPositionUpdates()

    expect(activation.getAttribute('transform')).toContain('translate(30')
  })

  it('moves ER endpoint decorations with edges', async () => {
    const src = `erDiagram
  CUSTOMER ||--o{ ORDER : places

  CUSTOMER {
      int id PK
  }
  ORDER {
      int id PK
  }`

    const svgStr = await renderMermaid(src)
    const svg = parseSvg(svgStr)

    const parser = getSvgParser()
    const { nodes, edges, diagramType } = parser.parse(svg)

    expect(diagramType).toBe('er')
    expect(nodes.length).toBeGreaterThanOrEqual(2)
    expect(edges).toHaveLength(1)

    const tracker = new NodeTracker(nodes, edges)
    const customer = nodes.find(n => n.label === 'CUSTOMER')
    expect(customer).toBeTruthy()
    if (!customer) return

    const edge = edges[0]!
    expect((edge.decorations?.length || 0) > 0).toBe(true)

    tracker.updateNodePosition(customer.id, customer.x + 40, customer.y)
    tracker.applyPositionUpdates()

    const deco = edge.decorations?.[0]
    expect(deco?.element.getAttribute('transform')).toContain('translate(40')
  })

  it('does not absorb subgraph container chrome into draggable nodes', async () => {
    const src = `graph TD
  subgraph Backend
    A[Start]
  end
  A --> B[End]`

    const svgStr = await renderMermaid(src)
    const svg = parseSvg(svgStr)

    const groupFill = svg.querySelector('rect[fill="var(--_group-fill)"]') as SVGRectElement | null
    const groupHdr = svg.querySelector('rect[fill="var(--_group-hdr)"]') as SVGRectElement | null
    expect(groupFill).toBeTruthy()
    expect(groupHdr).toBeTruthy()
    if (!groupFill || !groupHdr) return

    const parser = getSvgParser()
    const { nodes, edges } = parser.parse(svg)

    const start = nodes.find(n => n.label === 'Start')
    expect(start).toBeTruthy()
    if (!start) return

    // Group chrome should never be moved with a node.
    expect(start.elements.includes(groupFill as unknown as SVGElement)).toBe(false)
    expect(start.elements.includes(groupHdr as unknown as SVGElement)).toBe(false)

    const tracker = new NodeTracker(nodes, edges)
    tracker.updateNodePosition(start.id, start.x + 40, start.y)
    tracker.applyPositionUpdates()

    // Node label should move.
    const startText = start.elements.find(
      e => e.tagName.toLowerCase() === 'text' && (e.textContent || '').trim() === 'Start'
    )
    expect(startText?.getAttribute('transform')).toContain('translate(40')

    // Subgraph containers should remain unmoved.
    expect(groupFill.getAttribute('transform')).toBeNull()
    expect(groupHdr.getAttribute('transform')).toBeNull()
  })

  it('polishLayout resizes/repositions subgraph boxes to fit moved nodes', async () => {
    const src = `graph TD
  subgraph Backend
    A[Start]
  end
  A --> B[End]`

    const svgStr = await renderMermaid(src)
    const svg = parseSvg(svgStr)

    const groupFill = svg.querySelector('rect[fill="var(--_group-fill)"]') as SVGRectElement | null
    const groupHdr = svg.querySelector('rect[fill="var(--_group-hdr)"]') as SVGRectElement | null
    const groupLabel = svg.querySelector('text[fill="var(--_text-sec)"]') as SVGTextElement | null

    expect(groupFill).toBeTruthy()
    expect(groupHdr).toBeTruthy()
    expect(groupLabel).toBeTruthy()
    if (!groupFill || !groupHdr || !groupLabel) return

    const origGroupX = parseFloat(groupFill.getAttribute('x') || '0')

    const parser = getSvgParser()
    const { nodes, edges, groups } = parser.parse(svg)

    const start = nodes.find(n => n.label === 'Start')
    expect(start).toBeTruthy()
    if (!start) return

    const tracker = new NodeTracker(nodes, edges, groups)

    tracker.updateNodePosition(start.id, start.x + 40, start.y)
    tracker.applyPositionUpdates()

    // During drag: chrome should not move yet.
    expect(parseFloat(groupFill.getAttribute('x') || '0')).toBeCloseTo(origGroupX, 6)

    // On drag end: polish should move/resize the group to contain the moved node.
    tracker.polishLayout()

    expect(parseFloat(groupFill.getAttribute('x') || '0')).toBeCloseTo(origGroupX + 40, 6)
    expect(parseFloat(groupHdr.getAttribute('x') || '0')).toBeCloseTo(origGroupX + 40, 6)
    expect(parseFloat(groupLabel.getAttribute('x') || '0')).toBeCloseTo(origGroupX + 40 + 12, 6)
    expect(groupFill.getAttribute('transform')).toBeNull()
  })
})
