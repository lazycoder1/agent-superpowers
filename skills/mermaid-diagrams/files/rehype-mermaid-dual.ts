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
 * Drop user-authored ``classDef`` lines so every diagram inherits the unified
 * theme. Keeps ``class X cls`` assignments — they just become no-ops, which is
 * fine: mermaid falls back to primary/secondary/tertiary cycling.
 */
function stripClassDefs(source: string): string {
  return source
    .split("\n")
    .filter(line => !line.trim().startsWith("classDef "))
    .join("\n");
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

function normaliseSource(source: string): string {
  return stripBacktickNewlines(stripClassDefs(source));
}

/**
 * Rewrite the mermaid SVG so it stretches to fill its container width
 * (mermaid emits ``style="max-width:Xpx"`` clamped to natural size, which
 * leaves diagrams floating tiny in a wide article). Also rewrites the
 * ``id="mermaid-N"`` so two SVGs in the same <figure> don't collide.
 */
function fitSvg(svg: string, suffix: string): string {
  return svg
    .replace(/(<svg[^>]*?)\s*style="[^"]*"/i, "$1")
    .replace(/(<svg[^>]*?)\s*width="[^"]*"/i, "$1")
    .replace(/(<svg[^>]*?)\s*height="[^"]*"/i, "$1")
    .replace(/id="(mermaid-[^"]+)"/g, (_m, id) => `id="${id}-${suffix}"`)
    .replace(/url\(#(mermaid-[^)]+)\)/g, (_m, id) => `url(#${id}-${suffix})`)
    .replace(/href="#(mermaid-[^"]+)"/g, (_m, id) => `href="#${id}-${suffix}"`)
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
  source: string;
}

export function rehypeMermaidDual() {
  return async (tree: Root) => {
    const targets: Target[] = [];

    visit(tree, "element", (node, index, parent) => {
      if (node.tagName !== "pre" || index == null || !parent) return;

      const cls = node.properties?.className;
      const classes = Array.isArray(cls) ? cls : cls ? [String(cls)] : [];
      if (!classes.includes("mermaid")) return;

      const raw = decodeEntities(getInnerText(node));
      targets.push({
        parent: parent as Element | Root,
        index,
        source: normaliseSource(raw),
      });
    });

    if (targets.length === 0) return;

    const renderer = createMermaidRenderer();
    const sources = targets.map(t => t.source);

    const [lightResults, darkResults] = await Promise.all([
      renderer(sources, {
        mermaidConfig: { ...sharedConfig, themeVariables: lightTheme },
      }),
      renderer(sources, {
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
