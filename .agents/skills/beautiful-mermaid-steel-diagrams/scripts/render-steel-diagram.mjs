#!/usr/bin/env bun
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { env, stdin } from 'node:process'
import { parseArgs } from 'node:util'
import { renderMermaid, THEMES } from '../../../../src/index.ts'
import { Resvg } from '@resvg/resvg-js'

const STEEL_THEMES = {
  'steel-blue': {
    bg: '#0F0F0F',
    fg: '#0091FF',
    line: '#0091FF',
    accent: '#F5D90A',
    muted: '#68DDFD',
    surface: '#1a2740',
    border: '#0091FF',
  },
  'steel-green': {
    bg: '#0F0F0F',
    fg: '#30A46C',
    line: '#30A46C',
    accent: '#F5D90A',
    muted: '#30A46C',
    surface: '#16251a',
    border: '#30A46C',
  },
  'steel-yellow': {
    bg: '#0F0F0F',
    fg: '#F5D90A',
    line: '#F5D90A',
    accent: '#30A46C',
    muted: '#F5D90A',
    surface: '#322b10',
    border: '#F5D90A',
  },
}

const THEMES_WITH_STEEL = { ...THEMES, ...STEEL_THEMES }

function printHelp() {
  console.log(`Render Mermaid input to PNG with Beautiful Mermaid steel themes.

Usage:
  bun .agents/skills/beautiful-mermaid-steel-diagrams/scripts/render-steel-diagram.mjs \\
    --input tmp/diagram.mmd \\
    --output article-images/diagram.png \\
    --theme steel-yellow

Options:
  -i, --input <file>    Mermaid input file (optional; read stdin when omitted)
  -o, --output <file>   Output PNG file (required)
  -t, --theme <name>    Theme name (default: MERMAID_THEME or steel-blue)
      --width <number>  Output width in px (default: 1400)
      --font <name>     Font family (default: Inter)
      --padding <num>   Diagram padding (default: 28)
      --node <num>      Node spacing (default: 54)
      --layer <num>     Layer spacing (default: 72)
  -h, --help            Show this help

Steel themes:
  steel-blue, steel-green, steel-yellow
`)
}

function normalizeHex(hex) {
  const value = hex.trim()
  if (/^#([0-9a-fA-F]{3})$/.test(value)) {
    const short = value.slice(1)
    return `#${short[0]}${short[0]}${short[1]}${short[1]}${short[2]}${short[2]}`.toLowerCase()
  }
  return value.toLowerCase()
}

function hexToRgb(hex) {
  const n = parseInt(normalizeHex(hex).replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToHex([r, g, b]) {
  return `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`
}

function mix(fg, bg, fgPercent) {
  const p = fgPercent / 100
  const a = hexToRgb(fg)
  const b = hexToRgb(bg)
  return rgbToHex([
    a[0] * p + b[0] * (1 - p),
    a[1] * p + b[1] * (1 - p),
    a[2] * p + b[2] * (1 - p),
  ])
}

function extractNumber(svg, key) {
  const m = svg.match(new RegExp(`${key}=\\"([0-9.]+)\\"`))
  return m ? m[1] : '100'
}

function flattenSvg(svg, options) {
  const bg = normalizeHex(options.bg ?? '#ffffff')
  const fg = normalizeHex(options.fg ?? '#27272a')
  const line = normalizeHex(options.line ?? mix(fg, bg, 30))
  const accent = normalizeHex(options.accent ?? mix(fg, bg, 50))
  const muted = normalizeHex(options.muted ?? mix(fg, bg, 40))
  const surface = normalizeHex(options.surface ?? mix(fg, bg, 3))
  const border = normalizeHex(options.border ?? mix(fg, bg, 20))

  const vars = {
    '--_text': fg,
    '--_text-sec': muted,
    '--_text-muted': muted,
    '--_text-faint': mix(fg, bg, 25),
    '--_line': line,
    '--_arrow': line,
    '--_node-fill': surface,
    '--_node-stroke': border,
    '--_group-fill': bg,
    '--_group-hdr': mix(fg, bg, 5),
    '--_inner-stroke': mix(fg, bg, 12),
    '--_key-badge': mix(fg, bg, 10),
  }

  const safeStyle = `<style>text { font-family: '${options.font ?? 'Inter'}', system-ui, sans-serif; }\nsvg {\n  --_text: ${vars['--_text']};\n  --_text-sec: ${vars['--_text-sec']};\n  --_text-muted: ${vars['--_text-muted']};\n  --_text-faint: ${vars['--_text-faint']};\n  --_line: ${vars['--_line']};\n  --_arrow: ${vars['--_arrow']};\n  --_node-fill: ${vars['--_node-fill']};\n  --_node-stroke: ${vars['--_node-stroke']};\n  --_group-fill: ${vars['--_group-fill']};\n  --_group-hdr: ${vars['--_group-hdr']};\n  --_inner-stroke: ${vars['--_inner-stroke']};\n  --_key-badge: ${vars['--_key-badge']};\n}</style>`

  const withStyle = /<style>[\s\S]*?<\/style>/.test(svg)
    ? svg.replace(/<style>[\s\S]*?<\/style>/, safeStyle)
    : (() => {
      const openTagEnd = svg.indexOf('>') + 1
      return `${svg.slice(0, openTagEnd)}\n${safeStyle}${svg.slice(openTagEnd)}`
    })()

  const resolved = withStyle
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
    .replace(
      /color-mix\(in srgb,\s*(#[0-9a-fA-F]{3,8})\s+(\d+)%\s*,\s*(#[0-9a-fA-F]{3,8})\s*\)/g,
      (_, a, p, b) => mix(a, b, Number(p)),
    )

  const width = extractNumber(resolved, 'width')
  const height = extractNumber(resolved, 'height')
  const bgRect = `<rect x="0" y="0" width="${width}" height="${height}" fill="${bg}"/>`
  const openTagEnd = resolved.indexOf('>') + 1
  return `${resolved.slice(0, openTagEnd)}\n${bgRect}${resolved.slice(openTagEnd)}`
}

function parseNumber(value, fallback, flag) {
  if (value === undefined) return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${flag}: ${value}`)
  }
  return parsed
}

async function readInputFileOrStdin(inputPath) {
  if (inputPath) return readFile(resolve(inputPath), 'utf8')
  const chunks = []
  for await (const chunk of stdin) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}

const { values } = parseArgs({
  options: {
    input: { type: 'string', short: 'i' },
    output: { type: 'string', short: 'o' },
    theme: { type: 'string', short: 't' },
    width: { type: 'string' },
    font: { type: 'string' },
    padding: { type: 'string' },
    node: { type: 'string' },
    layer: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
  allowPositionals: false,
})

if (values.help) {
  printHelp()
  process.exit(0)
}

if (!values.output) {
  printHelp()
  throw new Error('--output is required')
}

const source = (await readInputFileOrStdin(values.input)).trim()
if (!source) throw new Error('Mermaid input is empty')

const themeName = values.theme ?? env.MERMAID_THEME ?? 'steel-blue'
const theme = THEMES_WITH_STEEL[themeName]
if (!theme) {
  throw new Error(`Unknown theme '${themeName}'. Available: ${Object.keys(THEMES_WITH_STEEL).join(', ')}`)
}

const renderOptions = {
  ...theme,
  font: values.font ?? 'Inter',
  padding: parseNumber(values.padding, 28, '--padding'),
  nodeSpacing: parseNumber(values.node, 54, '--node'),
  layerSpacing: parseNumber(values.layer, 72, '--layer'),
}

const rawSvg = await renderMermaid(source, renderOptions)
const flattenedSvg = flattenSvg(rawSvg, renderOptions)
const pngBuffer = new Resvg(flattenedSvg, {
  fitTo: { mode: 'width', value: parseNumber(values.width, 1400, '--width') },
}).render().asPng()

const outputPath = resolve(values.output)
await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, pngBuffer)
console.log(`Wrote ${outputPath}`)
