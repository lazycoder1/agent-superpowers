---
name: mermaid-diagrams
description: Render Mermaid diagrams in static sites at build time as themed inline SVG, with a click-to-zoom lightbox. Use when adding mermaid support to a static-site generator (Astro, Eleventy, Next static, Hugo with a custom pipeline, etc.) and you want zero runtime JS for the rendering itself, perfect first paint, dual light/dark themes, and a viewer that pans + zooms. The skill ships a working Astro reference plus the architecture to port it elsewhere.
---

# Mermaid diagrams: build-time SSR + dual-theme + lightbox

## When to use this skill

Trigger on any of:
- "Add mermaid to my blog / docs site"
- "Mermaid diagrams aren't supported / aren't rendering"
- "Make mermaid match my theme" / "themed mermaid diagrams"
- "Mermaid in dark mode looks bad"
- "Click-to-zoom for diagrams"
- The user shows a markdown file containing ` ```mermaid ` blocks that render as raw text

## Why this approach

Three principles, in priority order:

1. **Zero runtime JS for the rendering itself.** Mermaid client-side ships ~400KB and produces a flash of unstyled content. SSR via `mermaid-isomorphic` (which drives a real headless Chromium under the hood) inlines real SVG into the HTML. The only JS shipped is the lightbox (~3KB).
2. **Dual render for theme-perfect colors.** Mermaid bakes colors into the SVG at render time. Trying to recolor a single SVG via CSS in the other theme always loses (specificity wars with mermaid's inline `<style>`). Render twice — once per theme — and CSS-toggle which is visible. Build cost doubles per diagram (~1 sec each for 9 diagrams in a real post). Worth it.
3. **Strip mermaid's hardcoded SVG dimensions.** Mermaid emits `style="max-width:Xpx"` clamped to the diagram's natural size, which leaves diagrams floating tiny in a wide article. Strip `width`/`height`/`style` attrs from the SVG and inject `width:100%;height:auto;max-width:100%;display:block` so the SVG fills its container.

## Gotchas — bugs we actually shipped, do not repeat

Every one of these cost real time. Read before touching the plugin.

### 1. Fat black blob arrows on curvy edges

**Symptom**: Most arrows render as thin grey lines, but edges with steep curves (top-of-column → middle, bottom-of-column → middle) render as **fat black filled blobs** instead of thin strokes.

**Cause**: Mermaid's inline `<style>` block uses ID-scoped selectors:
```css
#mermaid-0 .edgePath .path { stroke: #6b7089; stroke-width: 1px; }
#mermaid-0 .flowchart-link { fill: none; }
```
If you rewrite the SVG root id from `mermaid-0` to `mermaid-0-l5` (necessary for de-duping — see #2) but **don't also rewrite the inline CSS selectors**, those rules match nothing. Edges fall back to SVG defaults (`fill="black"`, no `fill: none`), and `curve: basis` paths with steep deltas render as filled regions instead of strokes — visually fat black blobs.

**Fix**: ONE regex pass that rewrites every `mermaid-N` occurrence in the SVG — attributes, `url(#id)` refs, `href="#id"` anchors, AND CSS selectors. Use a negative lookahead to avoid matching partial number prefixes:
```ts
svg.replace(/mermaid-(\d+)(?![\w-])/g, (_, n) => `mermaid-${n}-${suffix}`)
```

### 2. Duplicate SVG IDs across light + dark renders

**Symptom**: After dual rendering, both SVGs in a `<figure>` ship with `id="mermaid-0"`. Browsers handle duplicate IDs unpredictably; SVG `<use>` and arrow markers can break.

**Cause**: Mermaid IDs are sequential (`mermaid-0`, `mermaid-1`...) per `createMermaidRenderer()` call. Calling the renderer twice (once per theme) resets the counter, so both batches start at 0.

**Fix**: Suffix all IDs per render (`-l0`, `-l1`, ... for light; `-d0`, `-d1`, ... for dark) using the regex above. Done in `fitSvg()`.

### 3. Empty boxes / clipped labels

**Symptom**: Single-line node labels (e.g. `Slack["Slack threads"]`) render as **empty boxes**. Two-line labels (those with `<br/>`) render but feel cramped.

**Cause**: Tailwind Typography's `.prose p { margin: 1.25em 0 }` (~20px top + 20px bottom) applies to ANY `<p>` descendant of `.prose`, including `<p>` inside mermaid's `<foreignObject>` labels. Single-line labels have foreignObject height ~22.5px — 40px of margin completely clips the text. Two-line labels (45px tall) survive barely.

**Fix**: Reset margin/padding/max-width for prose-styled elements inside foreignObjects:
```css
figure.mermaid-wrap foreignObject p,
figure.mermaid-wrap foreignObject span,
figure.mermaid-wrap foreignObject div {
  margin: 0 !important;
  padding: 0 !important;
  max-width: none !important;
  line-height: 1.4 !important;
}
```

### 4. Tiny diagrams in a wide container

**Symptom**: Diagram renders at ~300px wide inside an 800px article. Looks lost.

**Cause**: Mermaid emits `style="max-width: Xpx"` clamped to the diagram's natural rendered size. SVG with `width="100%"` + `max-width: 600px` will never grow past 600px even if the container is 1200px.

**Fix**: Strip `style/width/height` attrs from the SVG root and inject responsive sizing:
```ts
svg
  .replace(/(<svg[^>]*?)\s*style="[^"]*"/i, "$1")
  .replace(/(<svg[^>]*?)\s*width="[^"]*"/i, "$1")
  .replace(/(<svg[^>]*?)\s*height="[^"]*"/i, "$1")
  .replace(/<svg\b/i, '<svg style="width:100%;height:auto;max-width:100%;display:block"');
```
Done in `fitSvg()`.

### 5. Two disconnected graphs render side-by-side

**Symptom**: A single `mermaid` block contains two unrelated trees (e.g. "Typical X has these properties" and "Better Y has these properties"). Mermaid renders them **horizontally adjacent**, producing a 2000px-wide diagram with tiny illegible text — even with `flowchart TB`.

**Cause**: Mermaid's layout engine arranges disconnected subgraphs **side by side regardless of `TB`/`LR` orientation** when it can't find a single connected component to lay out.

**Fix**: Split into two `mermaid` blocks. Each will render as its own figure, stacked naturally by document flow. (Forcing a stack via invisible link `A ~~~ B` works but is hacky and the figures still share a frame, losing the natural section break.) Add a small bold sub-heading above each so the reader knows what they're comparing.

### 6. Uniform-grey diagrams when you strip user classDef

**Symptom**: After stripping user-authored `classDef ... fill:#xxx` lines, every node renders the same colour. Looks like garbage.

**Cause**: Stripping `classDef` removes the colour assignments but NOT the `:::className` references on each node. With no matching classDef, mermaid falls back to `mainBkg` for every node — they all look identical.

**Fix**: Strip user classDefs AND inject your own per-theme classDefs based on a curated semantic palette (see "Theming" section below). Scan the source for `:::className` patterns and `class X cls` statements, map each class name to a palette slot, and emit fresh `classDef name fill:X,stroke:Y,color:Z,stroke-width:1.5px` lines per render.

### 7. Astro caches markdown → HTML aggressively

**Symptom**: You change a remark/rehype plugin, rebuild, see no change. Add `console.log`, see no log. Add a marker attribute, doesn't appear in output. Conclude the plugin isn't running. Spend an hour debugging.

**Cause**: Astro's content collection cache + `node_modules/.astro` + `dist/` all hold stale compiled output. Plugin source changes don't invalidate the cache.

**Fix**: Always `rm -rf dist .astro node_modules/.astro` before testing plugin changes. Add a `dev:clean` npm script. Worth a sticky note on the monitor.

### 8. Production article body silently goes blank on Vercel/Netlify

**Symptom**: Local build is fine. After deploy, the post page renders the title, date, tags, and chrome perfectly — but the **entire article body is empty**, including all the prose between diagrams. `<article>...</article>` ships with whitespace inside.

**Cause**: `mermaid-isomorphic`'s renderer THROWS (not returns a per-source rejected result) when Playwright's Chromium binary is missing. The throw bubbles up through Astro's markdown pipeline and silently discards the entire article content. CI hosts that run their own build (Vercel, Netlify) don't run your Dockerfile, so `playwright install chromium` never runs.

**Fix** — both layers:

1. **Install Chromium in the build command** so the host actually has it:
   ```json
   "build": "playwright install chromium && astro check && astro build && ..."
   ```
   Don't rely on the Dockerfile; CI builds skip it.

2. **Wrap the renderer call in try/catch** so a missing Chromium degrades gracefully instead of nuking the article:
   ```ts
   let lightResults, darkResults;
   try {
     [lightResults, darkResults] = await Promise.all([renderer(lightSources, ...), renderer(darkSources, ...)]);
   } catch (err) {
     console.error("[rehypeMermaidDual] renderer crashed:", err);
     const reason = err instanceof Error ? err.message : String(err);
     const rejected = targets.map(() => ({ status: "rejected" as const, reason }));
     lightResults = rejected;
     darkResults = rejected;
   }
   ```
   And make the per-diagram fallback render the original mermaid source as a `<pre><code class="language-mermaid">` inside a `<details>` so the post survives even if every render fails. See `files/rehype-mermaid-dual.ts`.

### 9. `@types/hast` and `@types/mdast` missing on clean CI

**Symptom**: Local `pnpm build` passes. Vercel/Netlify/fresh-Docker build fails with `Cannot find module 'hast' / 'mdast'` from `astro check`.

**Cause**: `unist-util-visit`, `hast-util-from-html`, etc. transitively pull in those types in many local node_modules layouts, but a clean install may not. The plugin imports `import type { Element, Text } from "hast"` directly.

**Fix**: Always install `@types/hast` and `@types/mdast` as explicit devDependencies. Don't rely on transitive presence.

### 10. `\n` literals in backtick markdown labels render as the letter "n"

**Symptom**: A label like `"\`a\nbetter\`"` in mermaid source renders as **"abetter"** instead of "a / better".

**Cause**: Mermaid's parser reads `\n` inside backtick markdown strings as the literal two characters `\` + `n`, not a newline. The first character (`\`) gets dropped silently.

**Fix**: Pre-process source to replace `\n` inside backtick labels with a single space. Let `wrappingWidth: 160` handle line breaks instead. Done in `stripBacktickNewlines()`.

## Architecture (for any SSG, not just Astro)

```
markdown source
   │
   ▼
remark plugin: replace ```mermaid``` code nodes with raw HTML <pre class="mermaid">
   │  (escaping &, <, > so the source survives the round-trip)
   ▼
SSG runs syntax highlighter on remaining code blocks (mermaid bypassed)
   │
   ▼
rehype-raw: parse the raw <pre class="mermaid"> HTML strings into real hast elements
   │
   ▼
custom rehype plugin:
   1. visit every <pre class="mermaid">
   2. decode HTML entities, strip user `classDef` lines (let theme rule)
   3. batch-render LIGHT variants via mermaid-isomorphic
   4. batch-render DARK variants via mermaid-isomorphic
   5. for each diagram:
        - strip width/height/style from each SVG
        - suffix mermaid IDs to avoid collisions
        - inject width:100% style
        - replace <pre> with <figure class="mermaid-wrap">
            <div class="mermaid-light">{light SVG}</div>
            <div class="mermaid-dark">{dark SVG}</div>
          </figure>
   │
   ▼
serialized HTML
   │
   ▼
CSS toggles .mermaid-light vs .mermaid-dark based on data-theme
JS lightbox: click any <figure> → modal with zoom + pan, picks the active SVG
```

## Astro reference implementation

The full working code lives in `files/`:

- `remark-mermaid.ts` — converts ` ```mermaid ` fenced blocks into raw `<pre class="mermaid">` HTML nodes. Goes in `markdown.remarkPlugins`.
- `rehype-mermaid-dual.ts` — the heavy-lifter. Calls `mermaid-isomorphic` twice (light + dark), strips SVG dims, suffixes IDs, emits the dual `<figure>`. Goes in `markdown.rehypePlugins` AFTER `rehype-raw`.
- `typography.css` — the prose-and-mermaid CSS block (figure styling, light/dark toggle, modal styles).
- `lightbox.js` — vanilla-JS click-to-zoom modal. Drop into the post layout as `<script is:inline data-astro-rerun>`.

### Required deps

```sh
pnpm add -D rehype-raw mermaid-isomorphic playwright unist-util-visit hast-util-from-html @types/hast @types/mdast
pnpm exec playwright install --with-deps chromium
```

`mermaid-isomorphic` drives Playwright's Chromium to actually run mermaid's renderer in a headless DOM. There is no SSR mermaid path that avoids a real browser; mermaid uses DOM APIs.

**Don't skip `@types/hast` and `@types/mdast`.** They're transitively present in many local node_modules, so local builds pass — but on a clean CI install (Vercel, Netlify, fresh Docker) they're missing and `astro check` fails with `Cannot find module 'hast' / 'mdast'`. Burned an hour on this on the first deploy. Always install them explicitly.

### Astro config wiring

```ts
import remarkToc from "remark-toc";
import rehypeRaw from "rehype-raw";
import { remarkMermaid } from "./src/utils/remarkMermaid";
import { rehypeMermaidDual } from "./src/utils/rehypeMermaidDual";

export default defineConfig({
  markdown: {
    remarkPlugins: [remarkMermaid, remarkToc],
    rehypePlugins: [
      // Parse the raw HTML emitted by remarkMermaid into hast elements
      // so rehypeMermaidDual can find them. This is critical — without
      // rehype-raw, the <pre class="mermaid"> stays as a hast `raw` node
      // and the visit() never sees it.
      [rehypeRaw, { passThrough: ["mdxJsxFlowElement", "mdxJsxTextElement"] }],
      rehypeMermaidDual,
    ],
  },
});
```

### Layout wiring

In your post layout (Astro/MDX/etc.), drop the lightbox markup once near the bottom of the page, then include the script:

```astro
<div id="mermaid-modal" class="mermaid-modal" role="dialog" aria-modal="true" hidden>
  <div class="mermaid-modal__backdrop" data-mermaid-close></div>
  <div class="mermaid-modal__panel">
    <div class="mermaid-modal__toolbar">
      <div class="mermaid-modal__group">
        <button data-mermaid-zoom="-0.25">−</button>
        <span data-mermaid-zoom-label>100%</span>
        <button data-mermaid-zoom="0.25">+</button>
        <button data-mermaid-reset>Reset</button>
      </div>
      <button data-mermaid-close>✕</button>
    </div>
    <div class="mermaid-modal__viewport" data-mermaid-viewport>
      <div class="mermaid-modal__stage">
        <div class="mermaid-modal__svg-host" data-mermaid-svg-host></div>
      </div>
    </div>
  </div>
</div>

<script is:inline data-astro-rerun>
  /* contents of files/lightbox.js */
</script>
```

The full toolbar markup (with all the classes and aria labels) is in `files/lightbox.js` as a comment header — copy it verbatim.

### Dockerfile note

If you build in Docker (Astro build needs Playwright + Chromium):

```dockerfile
RUN pnpm install --frozen-lockfile
RUN pnpm exec playwright install --with-deps chromium
COPY . .
RUN pnpm run build
```

Adds ~250MB to the build stage. Final stage (nginx serving `dist/`) is unaffected.

## Theming: per-class semantic palette + base theme

Two layers, both per-theme:

**Layer 1 — base theme variables** apply to every node that doesn't have a class assignment. Defaults to a Tokyo Day / Tokyo Night feel with translucent-accent fills. Edit `lightTheme` and `darkTheme` in the plugin to change.

| Variable | Effect |
|---|---|
| `mainBkg` / `primaryColor` | Node fill |
| `nodeBorder` / `primaryBorderColor` | Node border |
| `lineColor` / `defaultLinkColor` / `arrowheadColor` | Edges and arrows |
| `textColor` / `primaryTextColor` | Label text |
| `clusterBkg` / `clusterBorder` | Subgraph backgrounds |
| `actorBkg` / `actorBorder` / `signalColor` | Sequence diagrams |
| `cScale0` / `cScale1` / `cScale2` | Timeline color cycling |

**Layer 2 — semantic class palette** is the magic. The plugin ships a curated 6-color system (`purple`, `cream`, `mint`, `peach`, `blue`, `rose`, plus `neutral` fallback) with light + dark variants per slot. A class-name → slot map covers the obvious semantics:

| Slot | Light fill / border / text | Dark fill / border / text | Class names |
|---|---|---|---|
| `purple` | `#ece6fa` / `#6e5fc4` / `#2d2466` | `#3d3275` / `#7a6dd8` / `#e8e2ff` | src, source, sources, input, ing, ingestion, new |
| `cream` | `#f5efd9` / `#a89065` / `#4d3f1f` | `#2a2418` / `#9d8c5e` / `#e8dfb8` | store, storage, data, cache, db, wiki, old, field |
| `mint` | `#daf0e6` / `#3da882` / `#1a4a3a` | `#1a3d2f` / `#3da882` / `#dff2ea` | agent, compute, success, good, pass, verified, approved, surf, has, bsys |
| `peach` | `#f8dcb6` / `#c47138` / `#7a3e15` | `#5a3018` / `#d68c5e` / `#fde8d4` | out, output, bad, error, fail, conflict, catch, warn, miss |
| `blue` | `#d9e8f7` / `#4a78b5` / `#1f3a5e` | `#1a2a45` / `#4a78b5` / `#d9e8f7` | decision, judge, route, branch, rec |
| `rose` | `#f9d9e2` / `#b85a78` / `#5e2a3a` | `#4a1f2f` / `#b85a78` / `#f9d9e2` | heading, title, highlight, important |

**How it works**: `normaliseSource()` strips any user-authored `classDef` lines, scans the source for `:::className` references and `class X cls` statements, then injects a fresh `classDef` per referenced class using the active theme's palette. Mermaid renders nodes with the right colors per theme, no CSS overrides needed.

**Adding a new semantic class**: add it to the `classNameToSlot` map in `rehype-mermaid-dual.ts`. Unknown class names fall back to `neutral` (a desaturated grey) — visible enough to spot in QA, neutral enough to not break the diagram.

**Authoring**: in the markdown, just use semantic class names (`Calls["Sales calls"]:::src`, `Store[(Vector store)]:::store`, etc.) — don't bother with `classDef ... fill:#xxx` lines, the plugin will own the colors. If you DO write a `classDef`, it gets stripped.

## Source normalization

`rehype-mermaid-dual.ts` rewrites two patterns before handing source to mermaid:

1. `flowchart TB` / `flowchart TD` → `flowchart LR` (vertical layouts burn screen height; LR is more compact). [Note: in this skill's reference plugin we leave the orientation alone — toggle on per-project taste by uncommenting the `replace()` in `normaliseSource()`.]
2. `\n` literals inside backtick markdown labels → space (mermaid's parser renders `\n` as the literal char `n`, producing "abetter" instead of "a\nbetter"). Let `wrappingWidth: 160` handle line breaks.

## Lightbox UX

- Click any diagram (or Enter/Space when focused) → modal opens with the active-theme SVG
- Toolbar: zoom −, % readout, zoom +, Reset, ✕
- Pan: pointer drag (sets `cursor: grabbing`)
- Zoom: Cmd/Ctrl + wheel (plain wheel passes through to scroll), or +/− keys
- Esc closes; 0 resets
- Auto-fits-to-viewport on open so big diagrams start fully visible
- Vanilla JS, no React/Preact/anything — drop into any layout

The script clones the DOM SVG (doesn't re-render), so it's fast and theme-correct by construction.

## Porting to other SSGs

The remark+rehype plugins are stack-agnostic. For Next.js MDX, Eleventy with `eleventy-plugin-mdx`, etc., wire them into the same place in the markdown pipeline. The lightbox JS + CSS port unchanged.

For Hugo / Jekyll / SSGs without remark/rehype, the equivalent is a build script that:
1. Walks markdown files
2. Extracts `mermaid` code blocks
3. Calls `mermaid-isomorphic` to render SVG (twice, for light + dark)
4. Replaces the code block with the dual `<figure>` HTML
5. Writes back

## Files

- `files/remark-mermaid.ts`
- `files/rehype-mermaid-dual.ts`
- `files/typography.css` (the relevant excerpt)
- `files/lightbox.js`

Copy whichever you need into your project. Adjust import paths and TypeScript flavor as needed.
