/**
 * Client-side mermaid renderer + theme toggle hook.
 *
 * Why client-side: mermaid-isomorphic + Playwright doesn't work on Vercel
 * (no system libs to launch Chromium). Convinced's web app uses the exact
 * same lazy-load + render pattern and it's instant, so we copy that.
 *
 * Flow:
 *   1. server-side `remarkMermaid` plugin emits each ```mermaid block as
 *      <pre class="mermaid">{source}</pre> raw HTML
 *   2. on page load, find every <pre class="mermaid">, lazy-load mermaid
 *      from CDN, and replace each block with the rendered SVG wrapped in a
 *      <figure class="mermaid-wrap"> so the lightbox + zoom modal work
 *   3. observe `data-theme` on <html> and re-render on theme toggle
 */

const MERMAID_CDN =
  "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";

type MermaidApi = {
  initialize: (config: Record<string, unknown>) => void;
  render: (id: string, source: string) => Promise<{ svg: string }>;
};

let mermaidPromise: Promise<MermaidApi> | null = null;
function loadMermaid(): Promise<MermaidApi> {
  if (!mermaidPromise) {
    mermaidPromise = import(/* @vite-ignore */ MERMAID_CDN).then(
      mod => mod.default as MermaidApi,
    );
  }
  return mermaidPromise;
}

// Same Tokyo Day / Tokyo Night palette as the SSR plugin had — lifted into
// the client so theme switching is dynamic without re-shipping two SVGs.
const lightTheme = {
  background: "#e1e2e7",
  primaryColor: "rgba(177, 92, 0, 0.10)",
  primaryTextColor: "#343b58",
  primaryBorderColor: "#b15c00",
  secondaryColor: "#dadbe0",
  secondaryTextColor: "#343b58",
  secondaryBorderColor: "#34548a",
  tertiaryColor: "#cdced3",
  tertiaryTextColor: "#343b58",
  tertiaryBorderColor: "#9da0a8",
  mainBkg: "rgba(177, 92, 0, 0.10)",
  nodeBorder: "#b15c00",
  clusterBkg: "transparent",
  clusterBorder: "#b4b5b9",
  defaultLinkColor: "#6b7089",
  lineColor: "#6b7089",
  arrowheadColor: "#6b7089",
  edgeLabelBackground: "#e1e2e7",
  textColor: "#343b58",
  titleColor: "#343b58",
  fontSize: "15px",
  actorBkg: "rgba(177, 92, 0, 0.10)",
  actorBorder: "#b15c00",
  actorTextColor: "#343b58",
  actorLineColor: "#6b7089",
  signalColor: "#343b58",
  signalTextColor: "#343b58",
  noteBkgColor: "rgba(177, 92, 0, 0.06)",
  noteTextColor: "#343b58",
  noteBorderColor: "#b15c00",
  cScale0: "rgba(177, 92, 0, 0.18)",
  cScale1: "rgba(52, 84, 138, 0.16)",
  cScale2: "rgba(122, 162, 247, 0.16)",
};

const darkTheme = {
  background: "#1a1b26",
  primaryColor: "rgba(255, 158, 100, 0.14)",
  primaryTextColor: "#c0caf5",
  primaryBorderColor: "#ff9e64",
  secondaryColor: "#1f2335",
  secondaryTextColor: "#c0caf5",
  secondaryBorderColor: "#7aa2f7",
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
  actorBkg: "rgba(255, 158, 100, 0.14)",
  actorBorder: "#ff9e64",
  actorTextColor: "#c0caf5",
  actorLineColor: "#565f89",
  signalColor: "#c0caf5",
  signalTextColor: "#c0caf5",
  noteBkgColor: "rgba(255, 158, 100, 0.10)",
  noteTextColor: "#c0caf5",
  noteBorderColor: "#ff9e64",
  cScale0: "rgba(255, 158, 100, 0.22)",
  cScale1: "rgba(122, 162, 247, 0.18)",
  cScale2: "rgba(187, 154, 247, 0.18)",
};

// Per-class semantic palette (purple/cream/mint/peach/blue/rose) with light +
// dark variants. Same colors and class-name → slot mapping as the SSR plugin.
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

const classNameToSlot: Record<string, PaletteSlot> = {
  src: "purple",
  source: "purple",
  sources: "purple",
  input: "purple",
  ing: "purple",
  ingestion: "purple",
  new: "purple",
  store: "cream",
  storage: "cream",
  data: "cream",
  cache: "cream",
  db: "cream",
  wiki: "cream",
  old: "cream",
  field: "cream",
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
  decision: "blue",
  judge: "blue",
  route: "blue",
  branch: "blue",
  rec: "blue",
  bsys: "blue",
  out2: "blue",
  out4: "blue",
  heading: "rose",
  title: "rose",
  highlight: "rose",
  important: "rose",
};

function stripClassDefs(source: string): string {
  return source
    .split("\n")
    .filter(line => !line.trim().startsWith("classDef "))
    .join("\n");
}

function stripBacktickNewlines(source: string): string {
  return source.replace(
    /"`([^`]*)`"/g,
    (_m, inner: string) => `"\`${inner.replace(/\\n/g, " ")}\``,
  );
}

function extractClassNames(source: string): Set<string> {
  const names = new Set<string>();
  const inlineRe = /:::\s*([A-Za-z_][\w-]*)/g;
  for (const m of source.matchAll(inlineRe)) names.add(m[1]);
  const stmtRe = /^\s*class\s+[\w,\s]+\s+([A-Za-z_][\w-]*)\s*$/gm;
  for (const m of source.matchAll(stmtRe)) names.add(m[1]);
  return names;
}

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
  const sourceLines = source.split("\n");
  const firstNonEmpty = sourceLines.findIndex(l => l.trim().length > 0);
  if (firstNonEmpty === -1) return source;
  sourceLines.splice(firstNonEmpty + 1, 0, ...lines);
  return sourceLines.join("\n");
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

function fitSvg(svg: string): string {
  // Strip mermaid's pinned width/max-width so it scales to container.
  return svg
    .replace(/(<svg[^>]*?)\s*style="[^"]*"/i, "$1")
    .replace(/(<svg[^>]*?)\s*width="[^"]*"/i, "$1")
    .replace(/(<svg[^>]*?)\s*height="[^"]*"/i, "$1")
    .replace(
      /<svg\b/i,
      '<svg style="width:100%;height:auto;max-width:100%;display:block"',
    );
}

const ID_COUNTER = { n: 0 };

function activeTheme(): "light" | "dark" {
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";
}

async function renderOne(
  mermaid: MermaidApi,
  el: HTMLElement,
  source: string,
  themeName: "light" | "dark",
): Promise<HTMLElement | null> {
  const palette = themeName === "dark" ? darkPalette : lightPalette;
  const themeVars = themeName === "dark" ? darkTheme : lightTheme;
  const normalized = normaliseSource(source, palette);

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "loose",
    theme: "base",
    fontFamily:
      "'Victor Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    themeVariables: themeVars,
    flowchart: {
      curve: "basis",
      padding: 14,
      nodeSpacing: 36,
      rankSpacing: 50,
      htmlLabels: true,
      useMaxWidth: true,
      wrappingWidth: 160,
    },
    sequence: { useMaxWidth: true, mirrorActors: false, wrap: true },
    timeline: { useMaxWidth: true },
  });

  const id = `mermaid-${themeName}-${++ID_COUNTER.n}`;
  try {
    const { svg } = await mermaid.render(id, normalized);

    // First render: replace <pre class="mermaid"> with a <figure> so the
    // existing CSS and lightbox keep working. Re-render: just swap innerHTML.
    let figure: HTMLElement;
    if (el.tagName === "FIGURE") {
      figure = el;
    } else {
      figure = document.createElement("figure");
      figure.className = "mermaid-wrap";
      figure.dataset.mermaidSource = source;
      el.replaceWith(figure);
    }
    figure.innerHTML = fitSvg(svg);
    return figure;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[mermaid] render failed:", err);
    el.innerHTML = `<details class="mermaid-error" open><summary>Mermaid render failed</summary><pre><code>${source
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")}</code></pre></details>`;
    return null;
  }
}

async function renderAll(): Promise<void> {
  // Pick up unrendered <pre class="mermaid"> AND already-rendered figures
  // (so theme-toggle re-renders work on the figures we made earlier).
  const blocks = Array.from(
    document.querySelectorAll<HTMLElement>(
      "pre.mermaid, figure.mermaid-wrap[data-mermaid-source]",
    ),
  );
  if (blocks.length === 0) return;

  // Cache the original source on the element so re-renders don't lose it
  // after we replace innerHTML with the SVG.
  for (const block of blocks) {
    if (!block.dataset.mermaidSource) {
      block.dataset.mermaidSource = block.textContent ?? "";
    }
  }

  const mermaid = await loadMermaid();
  const themeName = activeTheme();

  for (const block of blocks) {
    const source = block.dataset.mermaidSource ?? "";
    await renderOne(mermaid, block, source, themeName);
  }
}

function setupThemeObserver(): void {
  if ((window as unknown as { __mermaidThemeObs?: boolean }).__mermaidThemeObs)
    return;
  (window as unknown as { __mermaidThemeObs?: boolean }).__mermaidThemeObs = true;

  const obs = new MutationObserver(() => {
    void renderAll();
  });
  obs.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
}

export function initMermaidClient(): void {
  setupThemeObserver();
  void renderAll();
}
