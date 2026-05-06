# Porting to non-Astro stacks

The renderer (`assets/mermaid-client.ts`) and the lightbox (`assets/lightbox.js` + `assets/lightbox.html` + the CSS) are stack-agnostic — they only need `<pre class="mermaid">{source}</pre>` blocks in the rendered HTML and they'll do the rest.

The only stack-specific piece is the **remark plugin** that converts ` ```mermaid ` fenced blocks into those `<pre>` blocks before the syntax highlighter sees them.

## Next.js MDX (next-mdx-remote / @next/mdx)

Add the remark plugin to your MDX config:

```js
// next.config.mjs
import remarkMermaid from "./src/lib/remark-mermaid.js";

export default {
  experimental: {
    mdxRs: false, // remark plugins require the JS pipeline
  },
  // ... other config
};

// In your MDX setup:
import { compileMDX } from "next-mdx-remote/rsc";

await compileMDX({
  source,
  options: {
    mdxOptions: {
      remarkPlugins: [remarkMermaid],
    },
  },
});
```

Then load `mermaid-client.ts` as a client component on every page that might have diagrams.

## Eleventy (`@11ty/eleventy`)

Use `eleventy-plugin-mdx` or wire the markdown-it pipeline:

```js
// .eleventy.js with markdown-it
const md = require("markdown-it")({ html: true });
md.renderer.rules.fence = (tokens, idx) => {
  const t = tokens[idx];
  if (t.info === "mermaid") {
    const escaped = t.content
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return `<pre class="mermaid">${escaped}</pre>`;
  }
  // fall through to default fence renderer
};
```

## Hugo

Hugo doesn't run remark/markdown-it; it uses Goldmark. Use a render hook for `mermaid` code fences:

```html
<!-- layouts/_default/_markup/render-codeblock-mermaid.html -->
<pre class="mermaid">{{ .Inner | htmlEscape }}</pre>
```

Then include `mermaid-client.ts` (compiled to JS) and `lightbox.js` in your base template.

## Plain markdown-it (no framework)

```js
import MarkdownIt from "markdown-it";
const md = new MarkdownIt({ html: true });
const orig = md.renderer.rules.fence;
md.renderer.rules.fence = (tokens, idx, opts, env, self) => {
  const t = tokens[idx];
  if (t.info === "mermaid") {
    return `<pre class="mermaid">${md.utils.escapeHtml(t.content)}</pre>`;
  }
  return orig(tokens, idx, opts, env, self);
};
```

## Plain remark (Gatsby, custom unified pipelines)

`assets/remark-mermaid.ts` is a vanilla unified plugin. Plug it into any `unified().use(remarkMermaid)` chain. No Astro-specific bits.
