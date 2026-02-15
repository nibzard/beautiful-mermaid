import { writeFile, mkdir } from 'node:fs/promises'
import { renderMermaid, THEMES } from './src/index.ts'
import { Resvg } from '@resvg/resvg-js'

const diagrams = {
  'polite-frequency': `flowchart TD
    H[Human-like bot design] --> W[Respect crawl-delay]
    W --> S[Spread requests over time]
    S --> P[Random jitter: 1-3s]
    P --> R[Read robots.txt before crawling]
    R --> U[Fewer false positives]`,

  'fingerprint-layers': `flowchart TD
    L[Automation request] --> U[Check UA + platform]
    U -->|Looks odd| Q[Flag]
    U -->|Consistent| M[Canvas/WebGL sanity checks]
    M -->|Native-like| P[Continue]
    M -->|Mismatch| Q
    P --> E[Proceed to behavior]`,

  'behavior-simulation': `sequenceDiagram
    autonumber
    Client->>Site: Load page
    Site-->>Client: DOM rendered
    Client->>Client: Read + 2-8s pause
    Client->>Site: Slow scroll
    Client->>Site: Mouse move + jitter
    Client->>Site: Click with think-time
    Site-->>Client: Navigate / response`,

  'challenge-path': `flowchart TD
    M[Challenge encountered] --> I{Is data public?}
    I -->|No| O[Stop, request permission]
    I -->|Yes| A{API available?}
    A -->|Yes| U[Use official API]
    A -->|No| R[Follow robots + respectful retries]
    R --> P[Solve only as last resort]
    P --> E[Log evidence/source citations]`,

  'legit-use-cases': `flowchart LR
    A[Legitimate automation] --> B[Search indexing]
    A --> C[Accessibility checks]
    A --> D[SEO validation]
    A --> E[QA regression tests]
    A --> F[Academic/public data research]
    A --> G[Web archiving]
    B --> H[Always: rules + rate limits + traceability]`,
}

function antiBotLayersDiagram(theme) {
  return `flowchart TD
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
    S -->|High| K[Block/Review]

    classDef normalNode fill:${theme.surface},stroke:${theme.border},color:${theme.fg},stroke-width:2px
    classDef riskNode fill:${theme.surface},stroke:${theme.border},color:${theme.fg},stroke-width:2px
    class R,N,F,B,C,S normalNode
    class A,H,K riskNode
    linkStyle 0,1,2,3,4,5,6,7,8,9,10 stroke:${theme.line},stroke-width:2px
    `
}

const customTheme = {
  bg: '#0F0F0F',
  fg: '#0091FF',
  line: '#0091FF',
  accent: '#F5D90A',
  muted: '#68DDFD',
  surface: '#1a2740',
  border: '#0091FF',
}
const greenTheme = {
  bg: '#0F0F0F',
  fg: '#30A46C',
  line: '#30A46C',
  accent: '#F5D90A',
  muted: '#30A46C',
  surface: '#16251a',
  border: '#30A46C',
}
const yellowTheme = {
  bg: '#0F0F0F',
  fg: '#F5D90A',
  line: '#F5D90A',
  accent: '#30A46C',
  muted: '#F5D90A',
  surface: '#322b10',
  border: '#F5D90A',
}

const themes = {
  ...THEMES,
  'steel-blue': customTheme,
  'steel-green': greenTheme,
  'steel-yellow': yellowTheme,
}

const themeName = process.env.MERMAID_THEME ?? 'steel-blue'
const theme = themes[themeName]

if (!theme) {
  throw new Error(`Unknown theme '${themeName}'. Available: ${Object.keys(themes).join(', ')}`)
}

const renderOptions = {
  ...theme,
  font: 'Inter',
  padding: 28,
  nodeSpacing: 54,
  layerSpacing: 72,
}

function normalizeHex(hex) {
  const value = hex.trim()
  if (/^#([0-9a-fA-F]{3})$/.test(value)) {
    const m = value.slice(1)
    return `#${m[0]}${m[0]}${m[1]}${m[1]}${m[2]}${m[2]}`.toLowerCase()
  }
  return value.toLowerCase()
}

function hexToRgb(hex) {
  const h = normalizeHex(hex).replace('#', '')
  const n = parseInt(h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToHex([r, g, b]) {
  return `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toLowerCase()}`
}

function mix(a, b, percentFG) {
  const p = percentFG / 100
  const fg = hexToRgb(a)
  const bg = hexToRgb(b)
  return rgbToHex([fg[0] * p + bg[0] * (1 - p), fg[1] * p + bg[1] * (1 - p), fg[2] * p + bg[2] * (1 - p)])
}

function replaceColorMixValues(svg) {
  return svg.replace(
    /color-mix\(in srgb,\s*(#[0-9a-fA-F]{3,8})\s+(\d+)%\s*,\s*(#[0-9a-fA-F]{3,8})\s*\)/g,
    (_, a, p, b) => mix(a, b, Number(p)),
  )
}

function highlightDecisionLabels(svg, accent) {
  const labels = new Set(['yes', 'no', 'low', 'medium', 'high'])
  const setFill = (attrs, color) => (attrs.includes('fill="')
    ? attrs.replace(/fill="[^"]*"/, `fill="${color}"`)
    : `${attrs} fill="${color}"`)

  return svg.replace(/<text([^>]*?)>([^<]*?)<\/text>/g, (match, attrs, text) => {
    if (!labels.has(text.trim().toLowerCase())) return match
    return `<text${setFill(attrs, accent)}>${text}</text>`
  })
}

function flattenSvg(svg, options) {
  const bg = normalizeHex(options.bg ?? '#FFFFFF')
  const fg = normalizeHex(options.fg ?? '#0A0A0A')
  const line = normalizeHex(options.line ?? mix(fg, bg, 30))
  const accent = normalizeHex(options.accent ?? mix(fg, bg, 50))
  const muted = normalizeHex(options.muted ?? mix(fg, bg, 60))
  const surface = normalizeHex(options.surface ?? mix(fg, bg, 3))
  const border = normalizeHex(options.border ?? mix(fg, bg, 20))

  const vars = {
    '--bg': bg,
    '--fg': fg,
    '--_text': fg,
    '--_text-sec': muted ?? mix(fg, bg, 60),
    '--_text-muted': muted ?? mix(fg, bg, 40),
    '--_text-faint': mix(fg, bg, 25),
    '--_line': line ?? mix(fg, bg, 30),
    '--_arrow': line ?? mix(fg, bg, 30),
    '--_node-fill': surface ?? mix(fg, bg, 3),
    '--_node-stroke': border ?? mix(fg, bg, 20),
    '--_group-fill': bg,
    '--_group-hdr': mix(fg, bg, 5),
    '--_inner-stroke': mix(fg, bg, 12),
    '--_key-badge': mix(fg, bg, 10),
  }

  const safeStyle = `<style>text { font-family: 'Inter', system-ui, sans-serif; }\nsvg {\n  --_text: ${vars['--_text']};\n  --_text-sec: ${vars['--_text-sec']};\n  --_text-muted: ${vars['--_text-muted']};\n  --_text-faint: ${vars['--_text-faint']};\n  --_line: ${vars['--_line']};\n  --_arrow: ${vars['--_arrow']};\n  --_node-fill: ${vars['--_node-fill']};\n  --_node-stroke: ${vars['--_node-stroke']};\n  --_group-fill: ${vars['--_group-fill']};\n  --_group-hdr: ${vars['--_group-hdr']};\n  --_inner-stroke: ${vars['--_inner-stroke']};\n  --_key-badge: ${vars['--_key-badge']};\n}</style>`

  const resolved = svg
    .replace(/<style>[\s\S]*?<\/style>/, safeStyle)
    .replace(/var\(--_text\)/g, vars['--_text'])
    .replace(/var\(--_text-sec\)/g, vars['--_text-sec'])
    .replace(/var\(--_text-muted\)/g, vars['--_text-muted'])
    .replace(/var\(--_text-faint\)/g, vars['--_text-faint'])
    .replace(/var\(--_line\)/g, vars['--_line'])
    .replace(/var\(--_arrow\)/g, vars['--_arrow'])
    .replace(/var\(--_node-fill\)/g, vars['--_node-fill'])
    .replace(/var\(--_node-stroke\)/g, vars['--_node-stroke'])
    .replace(/var\(--_group-fill\)/g, vars['--_group-fill'])
    .replace(/var\(--_group-hdr\)/g, vars['--_group-hdr'])
    .replace(/var\(--_inner-stroke\)/g, vars['--_inner-stroke'])
    .replace(/var\(--_key-badge\)/g, vars['--_key-badge'])
    .replace(/var\(--bg\)/g, bg)
    .replace(/var\(--fg\)/g, fg)
    .replace(/var\(--line\)/g, line)
    .replace(/var\(--accent\)/g, accent)
    .replace(/var\(--muted\)/g, muted)
    .replace(/var\(--surface\)/g, surface)
    .replace(/var\(--border\)/g, border)
    .replace(/style="[^"]*background:var\\(--bg\\)[^"]*"/g, `style="background:${bg}"`)
    .replace(/color-mix\(in srgb,[^)]+\)/g, (match) => replaceColorMixValues(match))

  const labeled = highlightDecisionLabels(resolved, accent)

  const width = extractNumber(resolved, 'width')
  const height = extractNumber(resolved, 'height')
  const bgRect = `<rect x="0" y="0" width="${width}" height="${height}" fill="${bg}"/>`
  const openTagEnd = labeled.indexOf('>') + 1
  return labeled.slice(0, openTagEnd) + '\n' + bgRect + labeled.slice(openTagEnd)
}

function extractNumber(svg, key) {
  const m = svg.match(new RegExp(`${key}=\\"([0-9.]+)\\"`))
  return m ? m[1] : '100'
}

await mkdir('article-images', { recursive: true })

const diagramSources = {
  ...diagrams,
  'anti-bot-layers': antiBotLayersDiagram(renderOptions),
}

for (const [name, source] of Object.entries(diagramSources)) {
  const raw = await renderMermaid(source, renderOptions)
  const flattened = flattenSvg(raw, renderOptions)
  const png = new Resvg(flattened, {
    fitTo: { mode: 'width', value: 1200 },
  }).render().asPng()
  await writeFile(`article-images/${name}.png`, png)
}

console.log('Wrote article-images/*.png')
