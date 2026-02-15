# Steel Themes and Commands

## Theme Palette

| Theme | `bg` | `fg` | `line` | `accent` | `muted` | `surface` | `border` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `steel-blue` | `#0F0F0F` | `#0091FF` | `#0091FF` | `#F5D90A` | `#68DDFD` | `#1A2740` | `#0091FF` |
| `steel-green` | `#0F0F0F` | `#30A46C` | `#30A46C` | `#F5D90A` | `#30A46C` | `#16251A` | `#30A46C` |
| `steel-yellow` | `#0F0F0F` | `#F5D90A` | `#F5D90A` | `#30A46C` | `#F5D90A` | `#322B10` | `#F5D90A` |

## Rendering Recipes

Render a custom Mermaid file:

```bash
bun .agents/skills/beautiful-mermaid-steel-diagrams/scripts/render-steel-diagram.mjs \
  --input tmp/diagram.mmd \
  --output article-images/diagram.png \
  --theme steel-yellow
```

Render from stdin:

```bash
cat tmp/diagram.mmd | bun .agents/skills/beautiful-mermaid-steel-diagrams/scripts/render-steel-diagram.mjs \
  --output article-images/diagram.png \
  --theme steel-blue
```

Render the repository's predefined article diagram set:

```bash
MERMAID_THEME=steel-yellow bun article-diagrams-to-png.mjs
```

## Selection Rules

- Use `steel-blue` by default.
- Use `steel-green` for success/compliance/process-stability narratives.
- Use `steel-yellow` for risk/decision/attention-heavy diagrams.
