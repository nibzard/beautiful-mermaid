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

const options = {
  bg:'#FFFFFF', fg:'#0A0A0A', line:'#0F172A', accent:'#1D4ED8', muted:'#334155', surface:'#F8FAFC', border:'#1E293B',
  font:'Inter', padding:28, nodeSpacing:54, layerSpacing:72,
}

let svg = await renderMermaid(source, options)
svg = svg.replace(/font-size="([0-9.]+)"/g, (_m, n) => `font-size="${(Number(n) * 1.6).toFixed(1)}"`)
svg = svg.replace(/stroke-width="([0-9.]+)"/g, (_m, n) => `stroke-width="${(Number(n) * 1.3).toFixed(2)}"`)
svg = svg.replace('</style>', `</style>\n  <rect x="0" y="0" width="698" height="421" fill="#FFFFFF"/>`)

const png = new Resvg(svg, {
  fitTo: { mode: 'width', value: 1400 },
}).render().asPng()
await writeFile('/Users/nikola/dev/beautiful-mermaid/article-images/anti-bot-layers-scaled.png', png)
