# interactive-mermaid

Drag-and-drop wrapper for [beautiful-mermaid](../) diagrams.

## Features

- **Pure drag-and-drop** - Add interactive dragging to any beautiful-mermaid rendered diagram
- **Auto-save** - Positions automatically persist to localStorage
- **Framework agnostic** - Works with vanilla JS, React, Vue, Svelte, etc.
- **Touch support** - Works on mobile/tablet devices
- **Grid snapping** - Optional grid alignment for neat layouts
- **Edge following** - Connected edges follow nodes during drag
- **Polish pass** - On drag end, edges are kept orthogonal and subgraph boxes resize to fit
- **All diagram types** - Flowcharts, sequence, state, class, and ER diagrams

## Installation

```bash
npm install beautiful-mermaid interactive-mermaid
```

## Quick Start

```typescript
import { renderMermaid } from 'beautiful-mermaid'
import { makeInteractive } from 'interactive-mermaid'

// Render the diagram
const svg = await renderMermaid('graph TD; A-->B;', {
  bg: '#1a1b26',
  fg: '#a9b1d6'
})
container.innerHTML = svg

// Make it interactive
const instance = makeInteractive(container, {
  onDragEnd: (state) => {
    console.log('New positions:', state.positions)
  }
})
```

## API Reference

### `makeInteractive(container, options)`

Makes a rendered mermaid diagram interactive.

#### Parameters

- **`container`** - DOM element containing the mermaid SVG
- **`options`** - Configuration options (optional)

#### Options

```typescript
interface InteractiveOptions {
  /** Called when a drag operation completes */
  onDragEnd?: (state: DragState) => void

  /** Called continuously during drag for live updates */
  onDragMove?: (state: DragState) => void

  /** Called when a drag operation starts */
  onDragStart?: (nodeId: string) => void

  /** Enable/disable drag functionality */
  disabled?: boolean

  /** CSS cursor style during drag (default: 'grabbing') */
  cursor?: string

  /** CSS cursor style when hovering (default: 'grab') */
  hoverCursor?: string

  /** Snap to grid in pixels, 0 to disable (default: 0) */
  gridSize?: number

  /** Auto-save positions to localStorage (default: true) */
  autoSave?: boolean

  /** Storage key prefix (default: 'mermaid-layout') */
  storageKeyPrefix?: string

  /** Enable touch events for mobile (default: true) */
  touchEnabled?: boolean

  /** CSS class for dragging nodes (default: 'mermaid-dragging') */
  draggingClass?: string

  /** CSS class for draggable nodes (default: 'mermaid-draggable') */
  draggableClass?: string

  /**
   * Run a "polish" pass on drag end to keep geometry tidy:
   * - Re-orthogonalize polylines after endpoint movement
   * - Resize/reposition subgraph boxes to fit moved nodes
   * (default: true)
   */
  polishOnDragEnd?: boolean
}
```

#### Returns

An `InteractiveMermaidInstance` with control methods:

```typescript
interface InteractiveMermaidInstance {
  /** Update the diagram with new mermaid source */
  update(source: string): void

  /** Set node positions programmatically */
  setPositions(positions: Record<string, { x: number; y: number }>): void

  /** Get current node positions */
  getPositions(): Record<string, { x: number; y: number }>

  /** Enable/disable interactivity */
  setEnabled(enabled: boolean): void

  /** Get parsed nodes */
  getNodes(): ParsedNode[]

  /** Get parsed edges */
  getEdges(): ParsedEdge[]

  /** Reset all nodes to original positions */
  resetPositions(): void

  /** Clean up event listeners */
  destroy(): void
}
```

## Examples

### Basic Usage

```typescript
import { renderMermaid } from 'beautiful-mermaid'
import { makeInteractive } from 'interactive-mermaid'

const source = 'graph TD; A[Start] --> B{Decision}; B -->|Yes| C[Yes]; B -->|No| D[No];'

// Render
const svg = await renderMermaid(source, { bg: '#ffffff', fg: '#000000' })
document.getElementById('diagram').innerHTML = svg

// Make interactive
const instance = makeInteractive(document.getElementById('diagram'), {
  onDragEnd: (state) => {
    console.log('Positions saved:', state.positions)
  }
})
```

### With Grid Snapping

```typescript
const instance = makeInteractive(container, {
  gridSize: 20, // Snap to 20px grid
  onDragEnd: (state) => {
    // Save to your backend
    saveLayout(state.positions)
  }
})
```

### Manual Position Control

```typescript
// Set positions programmatically
instance.setPositions({
  'node-abc123': { x: 100, y: 200 },
  'node-def456': { x: 300, y: 150 }
})

// Get current positions
const positions = instance.getPositions()
```

### Disable/Enable Interactivity

```typescript
// Temporarily disable dragging
instance.setEnabled(false)

// Re-enable later
instance.setEnabled(true)
```

### Reset Positions

```typescript
// Reset all nodes to their original positions
instance.resetPositions()
```

### Custom Styling

```css
/* Style draggable nodes */
.mermaid-draggable {
  cursor: grab;
}

.mermaid-draggable:hover {
  opacity: 0.8;
}

/* Style while dragging */
.mermaid-dragging {
  opacity: 0.6;
  cursor: grabbing;
}
```

## Position Persistence

Positions are automatically saved to `localStorage` by default. The storage key is generated from the diagram source, so different diagrams maintain separate layouts.

### Custom Storage Key

```typescript
const instance = makeInteractive(container, {
  storageKeyPrefix: 'my-app-layouts'
})
```

### Manual Save/Load

```typescript
import {
  saveToLocalStorage,
  loadFromLocalStorage,
  serialize,
  deserialize
} from 'interactive-mermaid'

// Save to localStorage
saveToLocalStorage(positions, source)

// Load from localStorage
const positions = loadFromLocalStorage(source)

// Serialize to JSON
const json = serialize(positions, source)

// Deserialize from JSON
const positions = deserialize(json, source)
```

## Browser Usage

```html
<script src="https://unpkg.com/beautiful-mermaid"></script>
<script src="https://unpkg.com/interactive-mermaid"></script>

<div id="diagram"></div>

<script>
  const svg = await beautifulMermaid.renderMermaid('graph TD; A-->B;', {
    bg: '#1a1b26',
    fg: '#a9b1d6'
  })
  document.getElementById('diagram').innerHTML = svg

  const instance = InteractiveMermaid.makeInteractive(document.getElementById('diagram'))
</script>
```

## How It Works

beautiful-mermaid renders static SVG strings with no IDs on nodes. interactive-mermaid works by:

1. **Parsing the SVG** - Identifying nodes by their shape elements (rect, circle, polygon) and associating them with text labels
2. **Generating stable IDs** - Creating consistent IDs based on position and label, so the same node gets the same ID across re-renders
3. **Adding event listeners** - Handling mouse/touch events for drag operations
4. **Updating transforms** - Using SVG transforms to move nodes without modifying the original SVG structure
5. **Tracking edges** - Finding and updating connected edges (polylines) to follow dragged nodes

## Diagram Type Support

| Diagram Type | Support |
|--------------|---------|
| Flowchart    | ✅ Full |
| State        | ✅ Full |
| Sequence     | ✅ Participant dragging |
| Class        | ✅ Full |
| ER           | ✅ Full |

## License

MIT
