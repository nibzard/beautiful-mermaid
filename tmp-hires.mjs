import { writeFile } from 'node:fs/promises'
import { renderMermaid } from './src/index.ts'
import { Resvg } from '@resvg/resvg-js'

const source = `flowchart TD
  R[Incoming request] --> N[Network signal]
  R --> F[Fingerprint signal]
  R --> B[Behavior signal]
  R --> C[Challenge signal]
  N --> S{Risk score}
  F --> S
  B --> S
  C --> S
  S -->|Low| A[Allow]
  S -->|Medium| H[Light challenge]
  S -->|High| K[Block/Review]`

const svg = await renderMermaid(source, {
  bg: '#FFFFFF',
  fg: '#0A0A0A',
  line: '#0F172A',
  accent: '#1D4ED8',
  muted: '#334155',
  surface: '#F8FAFC',
  border: '#1E293B',
  font: 'Inter',
  padding: 28,
  nodeSpacing: 54,
  layerSpacing: 72,
})

const png = new Resvg(svg, {
  fitTo: { mode: 'width', value: 2200 },
}).render().asPng()

await writeFile('/Users/nikola/dev/beautiful-mermaid/article-images/anti-bot-layers-hires.png', png)
