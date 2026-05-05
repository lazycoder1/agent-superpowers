import { visit } from "unist-util-visit";
import { createMermaidRenderer } from "mermaid-isomorphic";
import { fromHtml } from "hast-util-from-html";
import type { Root, Element, Text } from "hast";

/**
 * Renders each ``mermaid`` block twice at build time — once for the Tokyo Day
 * light palette, once for Tokyo Night — and emits a <figure> containing both
 * SVGs. CSS toggles which one is visible based on the active theme so there's
 * zero runtime cost and no flash.
 *
 * Style directly inspired by Convinced's MermaidDiagram component:
 *   - accent-soft node fills (translucent so the page colour shows through)
 *   - accent borders on every node so the edges of nodes pop
 *   - muted edge / connector colour so the LINES recede and the NODES lead
 *   - htmlLabels: true so labels respect the page typography
 */

// Tokyo Day (light)
const lightTheme = {
  background: "#e1e2e7",
  primaryColor: "rgba(177, 92, 0, 0.10)", // accent-soft
  primaryTextColor: "#343b58",
  primaryBorderColor: "#b15c00", // accent
  secondaryColor: "#dadbe0",
  secondaryTextColor: "#343b58",
  secondaryBorderColor: "#9da0a8",
  tertiaryColor: "#cdced3",
  tertiaryTextColor: "#343b58",
  tertiaryBorderColor: "#9da0a8",
  mainBkg: "rgba(177, 92, 0, 0.10)",
  nodeBorder: "#b15c00",
  clusterBkg: "transparent",
  clusterBorder: "#b4b5b9",
  defaultLinkColor: "#6b7089",
  lineColor: "#6b7089", // muted ink — lines recede
  arrowheadColor: "#6b7089",
  edgeLabelBackground: "#e1e2e7",
  textColor: "#343b58",
  titleColor: "#343b58",
  fontSize: "15px",
  // Sequence-diagram specific
  actorBkg: "rgba(177, 92, 0, 0.10)",
  actorBorder: "#b15c00",
  actorTextColor: "#343b58",
  actorLineColor: "#6b7089",
  signalColor: "#343b58",
  signalTextColor: "#343b58",
  noteBkgColor: "rgba(177, 92, 0, 0.06)",
  noteTextColor: "#343b58",
  noteBorderColor: "#b15c00",
  // Timeline specific
  cScale0: "rgba(177, 92, 0, 0.18)",
  cScale1: "rgba(52, 84, 138, 0.16)",
  cScale2: "rgba(122, 162, 247, 0.16)",
};

// Tokyo Night (dark)
const darkTheme = {
  background: "#1a1b26",
  primaryColor: "rgba(255, 158, 100, 0.14)", // accent-soft
  primaryTextColor: "#c0caf5",
  primaryBorderColor: "#ff9e64", // accent
  secondaryColor: "#1f2335",
  secondaryTextColor: "#c0caf5",
  secondaryBorderColor: "#414868",
  tertiaryColor: "#16161e",
  tertiaryTextColor: "#c0caf5",
  tertiaryBorderColor: "#414868",
  mainBkg: "rgba(255, 158, 100, 0.14)",
  nodeBorder: "#ff9e64",
  clusterBkg: "transparent",
  clusterBorder: "#414868",
  defaultLinkColor: "#7aa2f7",
  lineColor: "#7aa2f7",
  arrowheadColor: "#7aa2f7",
  edgeLabelBackground: "#1a1b26",
  textColor: "#c0caf5",
  titleColor: "#c0caf5",
  fontSize: "15px",
  // Sequence
  actorBkg: "rgba(255, 158, 100, 0.14)",
  actorBorder: "#ff9e64",
  actorTextColor: "#c0caf5",
  actorLineColor: "#565f89",
  signalColor: "#c0caf5",
  signalTextColor: "#c0caf5",
  noteBkgColor: "rgba(255, 158, 100, 0.10)",
  noteTextColor: "#c0caf5",
  noteBorderColor: "#ff9e64",
  // Timeline
  cScale0: "rgba(255, 158, 100, 0.22)",
  cScale1: "rgba(122, 162, 247, 0.18)",
  cScale2: "rgba(187, 154, 247, 0.18)",
};

const sharedConfig = {
  theme: "base" as const,
  fontFamily:
    "'Victor Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  flowchart: {
    curve: "basis" as const,
    padding: 14,
    nodeSpacing: 36,
    rankSpacing: 50,
    htmlLabels: true,
    useMaxWidth: true,
    wrappingWidth: 160,
  },
  sequence: { useMaxWidth: true, mirrorActors: false, wrap: true },
  timeline: { useMaxWidth: true },
};

/**
 * Curated palette of 6 semantic colors. Each slot has light + dark variants.
 * Modeled on the lavender/cream/mint/peach feel of beautiful-mermaid-style
 * diagrams: pastels in light mode, deep saturated colors in dark mode.
 */
type PaletteSlot =
  | "purple"
  | "cream"
  | "mint"
  | "peach"
  | "blue"
  | "rose"
  | "neutral";

interface NodeColors {
  fill: string;
  stroke: string;
  text: string;
}

const lightPalette: Record<PaletteSlot, NodeColors> = {
  purple: { fill: "#ece6fa", stroke: "#6e5fc4", text: "#2d2466" },
  cream: { fill: "#f5efd9", stroke: "#a89065", text: "#4d3f1f" },
  mint: { fill: "#daf0e6", stroke: "#3da882", text: "#1a4a3a" },
  peach: { fill: "#f8dcb6", stroke: "#c47138", text: "#7a3e15" },
  blue: { fill: "#d9e8f7", stroke: "#4a78b5", text: "#1f3a5e" },
  rose: { fill: "#f9d9e2", stroke: "#b85a78", text: "#5e2a3a" },
  neutral: { fill: "#ebebeb", stroke: "#9da0a8", text: "#343b58" },
};

const darkPalette: Record<PaletteSlot, NodeColors> = {
  purple: { fill: "#3d3275", stroke: "#7a6dd8", text: "#e8e2ff" },
  cream: { fill: "#2a2418", stroke: "#9d8c5e", text: "#e8dfb8" },
  mint: { fill: "#1a3d2f", stroke: "#3da882", text: "#dff2ea" },
  peach: { fill: "#5a3018", stroke: "#d68c5e", text: "#fde8d4" },
  blue: { fill: "#1a2a45", stroke: "#4a78b5", text: "#d9e8f7" },
  rose: { fill: "#4a1f2f", stroke: "#b85a78", text: "#f9d9e2" },
  neutral: { fill: "#2a2a2a", stroke: "#565f89", text: "#c0caf5" },
};

/**
 * Map common class names to palette slots. Anything not listed falls back to
 * `neutral`. Add to this map as new semantic class names show up in posts.
 */
const classNameToSlot: Record<string, PaletteSlot> = {
  // Sources / inputs / ingestion
  src: "purple",
  source: "purple",
  sources: "purple",
  input: "purple",
  ing: "purple",
  ingestion: "purple",
  new: "purple",
  // Storage / data / wiki
  store: "cream",
  storage: "cream",
  data: "cream",
  cache: "cream",
  db: "cream",
  wiki: "cream",
  old: "cream",
  field: "cream",
  // Agents / success / verified
  agent: "mint",
  compute: "mint",
  success: "mint",
  good: "mint",
  pass: "mint",
  verified: "mint",
  approved: "mint",
  surf: "mint",
  has: "mint",
  out1: "mint",
  // Output / bad / conflict
  out: "peach",
  output: "peach",
  bad: "peach",
  error: "peach",
  fail: "peach",
  conflict: "peach",
  catch: "peach",
  warn: "peach",
  miss: "peach",
  out3: "peach",
  // Decision / routing / belief-system upgrades
  decision: "blue",
  judge: "blue",
  route: "blue",
  branch: "blue",
  rec: "blue",
  bsys: "blue",
  out2: "blue",
  out4: "blue",
  // Headings / highlights
  heading: "rose",
  title: "rose",
  highlight: "rose",
  important: "rose",
};

/**
 * Strip user-authored classDef lines so we own the palette. Their semantic
 * `:::className` references stay intact — we re-define the colors below.
 */
function stripClassDefs(source: string): string {
  return source
    .split("\n")
    .filter(line => !line.trim().startsWith("classDef "))
    .join("\n");
}

/**
 * Find every `:::className` reference (and `class X,Y className` statements)
 * so we know which classDef lines to inject.
 */
function extractClassNames(source: string): Set<string> {
  const names = new Set<string>();
  const inlineRe = /:::\s*([A-Za-z_][\w-]*)/g;
  for (const m of source.matchAll(inlineRe)) names.add(m[1]);
  const stmtRe = /^\s*class\s+[\w,\s]+\s+([A-Za-z_][\w-]*)\s*$/gm;
  for (const m of source.matchAll(stmtRe)) names.add(m[1]);
  return names;
}

/**
 * Inject themed classDef lines for every class referenced in the source.
 * Mermaid's `classDef name fill:X,stroke:Y,color:Z,stroke-width:1.5px` is
 * the format. We append after the diagram declaration line so they apply.
 */
function injectClassDefs(
  source: string,
  palette: Record<PaletteSlot, NodeColors>,
): string {
  const classNames = extractClassNames(source);
  if (classNames.size === 0) return source;

  const lines: string[] = [];
  for (const name of classNames) {
    const slot = classNameToSlot[name] ?? "neutral";
    const c = palette[slot];
    lines.push(
      `classDef ${name} fill:${c.fill},stroke:${c.stroke},color:${c.text},stroke-width:1.5px`,
    );
  }

  // Insert after the first line (the diagram declaration like "flowchart LR").
  const sourceLines = source.split("\n");
  const firstNonEmpty = sourceLines.findIndex(l => l.trim().length > 0);
  if (firstNonEmpty === -1) return source;
  sourceLines.splice(firstNonEmpty + 1, 0, ...lines);
  return sourceLines.join("\n");
}

/**
 * Mermaid renders ``\n`` inside backtick markdown labels as the literal char
 * ``n`` ("abetter" instead of "a\nbetter"). Strip those so wrappingWidth can
 * handle line breaks.
 */
function stripBacktickNewlines(source: string): string {
  return source.replace(/"`([^`]*)`"/g, (_m, inner: string) =>
    `"\`${inner.replace(/\\n/g, " ")}\``,
  );
}

function normaliseSource(
  source: string,
  palette: Record<PaletteSlot, NodeColors>,
): string {
  return injectClassDefs(
    stripBacktickNewlines(stripClassDefs(source)),
    palette,
  );
}

/**
 * Rewrite the mermaid SVG so it stretches to fill its container width
 * (mermaid emits ``style="max-width:Xpx"`` clamped to natural size, which
 * leaves diagrams floating tiny in a wide article). Also rewrites the
 * ``id="mermaid-N"`` so two SVGs in the same <figure> don't collide.
 */
function fitSvg(svg: string, suffix: string): string {
  // Mermaid's inline <style> block uses ID-scoped selectors like
  // `#mermaid-0 .edgePath .path { stroke: ... }`. Two SVGs in the same
  // figure both ship with id="mermaid-0", so we need a per-render suffix
  // — and we MUST rewrite every occurrence (id attrs, url() refs,
  // href anchors, AND the inline CSS selectors) so the styles still match.
  // Lookahead `(?![\w-])` keeps us from double-suffixing or matching
  // partial number prefixes (e.g. mermaid-1 inside mermaid-10).
  const renamed = svg.replace(
    /mermaid-(\d+)(?![\w-])/g,
    (_m, n) => `mermaid-${n}-${suffix}`,
  );

  // Strip mermaid's pinned width/height/max-width and inject responsive
  // sizing so the SVG fills its container instead of capping at natural size.
  return renamed
    .replace(/(<svg[^>]*?)\s*style="[^"]*"/i, "$1")
    .replace(/(<svg[^>]*?)\s*width="[^"]*"/i, "$1")
    .replace(/(<svg[^>]*?)\s*height="[^"]*"/i, "$1")
    .replace(
      /<svg\b/i,
      '<svg style="width:100%;height:auto;max-width:100%;display:block"',
    );
}

function getInnerText(node: Element): string {
  return node.children
    .map(child => {
      if (child.type === "text") return (child as Text).value;
      if (child.type === "element") return getInnerText(child as Element);
      return "";
    })
    .join("");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

interface Target {
  parent: Element | Root;
  index: number;
  raw: string;
}

export function rehypeMermaidDual() {
  return async (tree: Root) => {
    const targets: Target[] = [];

    visit(tree, "element", (node, index, parent) => {
      if (node.tagName !== "pre" || index == null || !parent) return;

      const cls = node.properties?.className;
      const classes = Array.isArray(cls) ? cls : cls ? [String(cls)] : [];
      if (!classes.includes("mermaid")) return;

      targets.push({
        parent: parent as Element | Root,
        index,
        raw: decodeEntities(getInnerText(node)),
      });
    });

    if (targets.length === 0) return;

    const renderer = createMermaidRenderer();
    const lightSources = targets.map(t => normaliseSource(t.raw, lightPalette));
    const darkSources = targets.map(t => normaliseSource(t.raw, darkPalette));

    const [lightResults, darkResults] = await Promise.all([
      renderer(lightSources, {
        mermaidConfig: { ...sharedConfig, themeVariables: lightTheme },
      }),
      renderer(darkSources, {
        mermaidConfig: { ...sharedConfig, themeVariables: darkTheme },
      }),
    ]);

    for (let i = targets.length - 1; i >= 0; i--) {
      const { parent, index } = targets[i];
      const light = lightResults[i];
      const dark = darkResults[i];

      if (light.status !== "fulfilled" || dark.status !== "fulfilled") {
        const reason =
          light.status === "rejected"
            ? String(light.reason)
            : dark.status === "rejected"
              ? String(dark.reason)
              : "unknown";
        const fallback = `<pre class="mermaid-error">Mermaid render failed: ${reason
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")}</pre>`;
        const fallbackNodes = fromHtml(fallback, { fragment: true })
          .children as Element[];
        parent.children.splice(index, 1, ...fallbackNodes);
        continue;
      }

      const lightSvg = fitSvg(light.value.svg, `l${i}`);
      const darkSvg = fitSvg(dark.value.svg, `d${i}`);

      const html = `<figure class="mermaid-wrap"><div class="mermaid-light">${lightSvg}</div><div class="mermaid-dark">${darkSvg}</div></figure>`;
      const newNodes = fromHtml(html, { fragment: true })
        .children as Element[];
      parent.children.splice(index, 1, ...newNodes);
    }
  };
}
