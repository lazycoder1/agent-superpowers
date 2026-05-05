import { visit } from "unist-util-visit";
import type { Root, Code, Html } from "mdast";

/**
 * Convert ```mermaid fenced code blocks into raw HTML <pre class="mermaid">
 * nodes BEFORE Shiki sees them, so rehype-mermaid can render them to inline
 * SVG at build time.
 */
export function remarkMermaid() {
  return (tree: Root) => {
    visit(tree, "code", (node: Code, index, parent) => {
      if (node.lang !== "mermaid" || !parent || typeof index !== "number")
        return;

      const escaped = node.value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

      const htmlNode: Html = {
        type: "html",
        value: `<pre class="mermaid">${escaped}</pre>`,
      };

      parent.children[index] = htmlNode;
    });
  };
}
