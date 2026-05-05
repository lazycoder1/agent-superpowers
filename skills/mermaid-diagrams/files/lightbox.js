/* Mermaid lightbox: click any rendered diagram to open a modal with
 * zoom + pan. Picks the SVG matching the active theme, clones it, and
 * applies transforms to the host element via inline style.
 *
 * Vanilla JS — drop into any layout. Pairs with the modal markup:
 *
 *   <div id="mermaid-modal" class="mermaid-modal" role="dialog"
 *        aria-modal="true" aria-label="Diagram preview" hidden>
 *     <div class="mermaid-modal__backdrop" data-mermaid-close></div>
 *     <div class="mermaid-modal__panel">
 *       <div class="mermaid-modal__toolbar">
 *         <div class="mermaid-modal__group">
 *           <button class="mermaid-modal__btn"
 *                   data-mermaid-zoom="-0.25" aria-label="Zoom out">−</button>
 *           <span class="mermaid-modal__zoom-label"
 *                 data-mermaid-zoom-label>100%</span>
 *           <button class="mermaid-modal__btn"
 *                   data-mermaid-zoom="0.25" aria-label="Zoom in">+</button>
 *           <button class="mermaid-modal__btn"
 *                   data-mermaid-reset aria-label="Reset view">Reset</button>
 *         </div>
 *         <button class="mermaid-modal__btn"
 *                 data-mermaid-close aria-label="Close">✕</button>
 *       </div>
 *       <div class="mermaid-modal__viewport" data-mermaid-viewport>
 *         <div class="mermaid-modal__stage">
 *           <div class="mermaid-modal__svg-host" data-mermaid-svg-host></div>
 *         </div>
 *       </div>
 *     </div>
 *   </div>
 *
 * In Astro, wrap this in <script is:inline data-astro-rerun> so it survives
 * view-transition swaps.
 */
(function setupMermaidLightbox() {
  const modal = document.getElementById("mermaid-modal");
  if (!modal) return;

  const host = modal.querySelector("[data-mermaid-svg-host]");
  const viewport = modal.querySelector("[data-mermaid-viewport]");
  const zoomLabel = modal.querySelector("[data-mermaid-zoom-label]");
  if (!host || !viewport || !zoomLabel) return;

  const ZOOM_MIN = 0.1;
  const ZOOM_MAX = 4;
  let zoom = 1;
  let pan = { x: 0, y: 0 };
  let drag = null;

  function applyTransform() {
    host.style.transform =
      "translate(" + pan.x + "px," + pan.y + "px) scale(" + zoom + ")";
    zoomLabel.textContent = Math.round(zoom * 100) + "%";
  }

  function reset() {
    zoom = 1;
    pan = { x: 0, y: 0 };
    applyTransform();
  }

  function fitToViewport() {
    const svg = host.querySelector("svg");
    if (!svg) return;
    requestAnimationFrame(() => {
      const sb = svg.getBoundingClientRect();
      const vb = viewport.getBoundingClientRect();
      if (sb.width === 0 || sb.height === 0) return;
      const padding = 48;
      const fitW = (vb.width - padding) / sb.width;
      const fitH = (vb.height - padding) / sb.height;
      const fit = Math.min(fitW, fitH, 1);
      if (fit < 0.98) {
        zoom = Math.max(fit, ZOOM_MIN);
        applyTransform();
      }
    });
  }

  function open(svgEl) {
    host.innerHTML = "";
    const clone = svgEl.cloneNode(true);
    // Strip any width/height/style that pin the SVG to its natural size.
    clone.removeAttribute("width");
    clone.removeAttribute("height");
    clone.removeAttribute("style");
    host.appendChild(clone);
    reset();
    modal.removeAttribute("hidden");
    document.body.style.overflow = "hidden";
    fitToViewport();
  }

  function close() {
    modal.setAttribute("hidden", "");
    document.body.style.overflow = "";
    host.innerHTML = "";
  }

  function activeSvgFor(figure) {
    const isDark =
      document.documentElement.getAttribute("data-theme") === "dark";
    const visible = figure.querySelector(
      isDark ? ".mermaid-dark svg" : ".mermaid-light svg"
    );
    return visible || figure.querySelector("svg");
  }

  document.querySelectorAll("figure.mermaid-wrap").forEach(figure => {
    figure.setAttribute("role", "button");
    figure.setAttribute("tabindex", "0");
    figure.setAttribute("aria-label", "Open diagram in full view");

    const trigger = () => {
      const svg = activeSvgFor(figure);
      if (svg) open(svg);
    };

    figure.addEventListener("click", trigger);
    figure.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        trigger();
      }
    });
  });

  modal
    .querySelectorAll("[data-mermaid-close]")
    .forEach(el => el.addEventListener("click", close));
  modal.querySelectorAll("[data-mermaid-zoom]").forEach(el => {
    el.addEventListener("click", () => {
      const delta = parseFloat(el.getAttribute("data-mermaid-zoom") || "0");
      zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom + delta));
      applyTransform();
    });
  });
  modal
    .querySelector("[data-mermaid-reset]")
    ?.addEventListener("click", reset);

  // Keyboard shortcuts while the modal is open.
  document.addEventListener("keydown", e => {
    if (modal.hasAttribute("hidden")) return;
    if (e.key === "Escape") close();
    else if (e.key === "+" || e.key === "=") {
      zoom = Math.min(ZOOM_MAX, zoom + 0.25);
      applyTransform();
    } else if (e.key === "-") {
      zoom = Math.max(ZOOM_MIN, zoom - 0.25);
      applyTransform();
    } else if (e.key === "0") reset();
  });

  // Pan via pointer drag.
  viewport.addEventListener("pointerdown", e => {
    if (e.button !== 0) return;
    drag = {
      startX: e.clientX,
      startY: e.clientY,
      originX: pan.x,
      originY: pan.y,
    };
    viewport.classList.add("is-dragging");
    host.classList.add("is-dragging");
    viewport.setPointerCapture(e.pointerId);
  });
  viewport.addEventListener("pointermove", e => {
    if (!drag) return;
    pan = {
      x: drag.originX + (e.clientX - drag.startX),
      y: drag.originY + (e.clientY - drag.startY),
    };
    applyTransform();
  });
  function endDrag(e) {
    if (!drag) return;
    drag = null;
    viewport.classList.remove("is-dragging");
    host.classList.remove("is-dragging");
    try {
      viewport.releasePointerCapture(e.pointerId);
    } catch {
      /* not captured — ignore */
    }
  }
  viewport.addEventListener("pointerup", endDrag);
  viewport.addEventListener("pointercancel", endDrag);

  // Cmd/Ctrl + wheel = zoom; plain wheel passes through to scroll.
  viewport.addEventListener(
    "wheel",
    e => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const delta = -e.deltaY * 0.002;
      zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom + delta));
      applyTransform();
    },
    { passive: false }
  );
})();
