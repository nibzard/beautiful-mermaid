---
name: beautiful-mermaid-steel-diagrams
description: Create Mermaid diagrams in the beautiful-mermaid repository from user prompts, article text, or provided images, then render PNG outputs with steel themes (`steel-blue`, `steel-green`, `steel-yellow`). Use when users ask to design, revise, or export diagrams (flowcharts, sequence, class, ER) and want steel-themed rendering, including workflows like `MERMAID_THEME=steel-yellow bun article-diagrams-to-png.mjs`.
---

# Beautiful Mermaid Steel Diagrams

Generate production-ready Mermaid code, apply the steel visual style, and render diagram PNG files in this repo.

## Workflow

1. Normalize input into a diagram intent.
- For direct prompts, extract entities, relationships, and ordering.
- For article text, reduce the article to 3-7 key sections and map causality or sequence.
- For images, infer visible nodes and arrows from labels/shapes before writing Mermaid.

2. Choose diagram type.
- Use `flowchart` for concepts, decisions, and pipelines.
- Use `sequenceDiagram` for interactions over time.
- Use `classDiagram` for structure and ownership.
- Use `erDiagram` for data models.

3. Draft Mermaid source.
- Keep labels short and specific.
- Prefer 6-14 nodes unless the user asks for a larger map.
- Use direction (`TD` or `LR`) intentionally for readability.

4. Save Mermaid source to a file, then render.
- Preferred command for custom diagrams:
```bash
bun .agents/skills/beautiful-mermaid-steel-diagrams/scripts/render-steel-diagram.mjs \
  --input tmp/diagram.mmd \
  --output article-images/diagram.png \
  --theme steel-yellow
```
- Existing batch article command:
```bash
MERMAID_THEME=steel-yellow bun article-diagrams-to-png.mjs
```

5. Validate output and iterate.
- Fix parse errors first.
- Check overlap, edge routing clarity, and label truncation.
- If readability is weak, simplify wording or split one large diagram into multiple diagrams.

## Input Mode Guidance

### Prompt-only requests

- Convert user goals to one clear diagram narrative first.
- Ask one targeted clarification only when a core relation is ambiguous.
- Provide Mermaid plus a rendered PNG path.

### Article text requests

- Extract headings, transitions, and decision points.
- Turn each major section into a node cluster or step.
- Keep technical terms from the article unchanged.

### Image requests

- Read visible labels and flow direction from the image.
- Reconstruct layout as Mermaid semantics, not pixel-perfect geometry.
- Call out uncertain text in a short assumptions note when needed.

## Theme Rules

- Default to `steel-blue` unless user names a theme.
- Respect explicit user choice among `steel-blue`, `steel-green`, `steel-yellow`.
- Use `references/steel-themes.md` for exact palette and command cheatsheet.

## Resources

- `scripts/render-steel-diagram.mjs`: Render one Mermaid input file (or stdin) to PNG with steel themes.
- `references/steel-themes.md`: Steel palette values, theme selection rules, and command recipes.
