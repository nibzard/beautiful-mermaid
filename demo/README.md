# Interactive Mermaid Demo

This is a live demo website for the `interactive-mermaid` package.

## Running Locally

### Option 1: Serve From Repo Root (Recommended)

This uses the locally built browser bundles, so you see your local changes.

```bash
cd ..
npm run build
npm run build:interactive
python3 -u -m http.server 8001 --bind 127.0.0.1
```

Then open `http://localhost:8001/demo/` in your browser.

### Option 2: Serve `demo/` Only (CDN Fallback)

```bash
cd demo
python3 -u -m http.server 8000 --bind 127.0.0.1
# or
npx serve .
```

Then open `http://localhost:8000/` in your browser.

## Deployment

The demo is automatically deployed to GitHub Pages on pushes to the `main` branch.

Access it at: `https://lukilabs.github.io/beautiful-mermaid/`

## Features

The demo showcases:

- **All diagram types**: Flowchart, State, Sequence, Class, and ER diagrams
- **Theme switching**: Tokyo Night, Nord, Monokai, Dracula, and Light themes
- **Interactive dragging**: Drag nodes to rearrange the diagram
- **Grid snapping**: Optional 10px grid alignment
- **Position persistence**: Positions automatically save to localStorage
- **Reset functionality**: Reset nodes to original positions or clear saved data

## Technical Details

The demo prefers locally bundled scripts when available:

- When deployed to GitHub Pages, CI builds both packages and copies browser bundles into `demo/vendor/`.
- When served from the repo root, it loads browser bundles from `../dist/` and `../interactive-mermaid/dist/`.
- Otherwise it falls back to ES module imports from `esm.sh`.
