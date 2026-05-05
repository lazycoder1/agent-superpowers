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

Two gotchas that will eat hours if you don't know them:

- **Astro caches markdown→HTML output.** When iterating on a remark/rehype plugin, you MUST clear `.astro`, `node_modules/.astro`, and `dist/` before rebuilding, or your changes silently won't apply. Add this to your dev loop.
- **Duplicate SVG IDs.** Mermaid IDs are sequential (`mermaid-0`, `mermaid-1`...), and each `createMermaidRenderer()` call resets the counter. Two SVGs in the same `<figure>` collide. Suffix the IDs (e.g. `mermaid-0-l5` for "diagram 5, light variant") and rewrite all internal `url(#id)` and `href="#id"` references to match.

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
pnpm add -D rehype-raw mermaid-isomorphic playwright unist-util-visit hast-util-from-html
pnpm exec playwright install --with-deps chromium
```

`mermaid-isomorphic` drives Playwright's Chromium to actually run mermaid's renderer in a headless DOM. There is no SSR mermaid path that avoids a real browser; mermaid uses DOM APIs.

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

## Theming

The skill defaults to a **Tokyo Day / Tokyo Night** palette aligned with a translucent-accent fill style cribbed from Convinced's web app:

- Light: `rgba(177,92,0,0.10)` accent-soft node fills, `#b15c00` borders, `#6b7089` muted edges
- Dark: `rgba(255,158,100,0.14)` accent-soft fills, `#ff9e64` borders, `#7aa2f7` Tokyo blue edges

To change the palette, edit `lightTheme` and `darkTheme` objects in `rehype-mermaid-dual.ts`. The variables that matter most:

| Variable | Effect |
|---|---|
| `mainBkg` / `primaryColor` | Node fill |
| `nodeBorder` / `primaryBorderColor` | Node border |
| `lineColor` / `defaultLinkColor` / `arrowheadColor` | Edges and arrows |
| `textColor` / `primaryTextColor` | Label text |
| `clusterBkg` / `clusterBorder` | Subgraph backgrounds |
| `actorBkg` / `actorBorder` / `signalColor` | Sequence diagrams |
| `cScale0` / `cScale1` / `cScale2` | Timeline color cycling |

User-authored `classDef ...` lines in the markdown source are stripped by `normaliseSource()` so the unified theme always wins. If you want per-node accents back, add them via `themeVariables` (consistent across diagrams) rather than per-diagram inline.

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
