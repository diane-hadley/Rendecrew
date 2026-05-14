/** @type {import("mermaid").MermaidConfig} */
export default {
  er: {
    useMaxWidth: false,
    // LR: bias layout left-to-right so related tables sit on one row more often (denser than default TB).
    layoutDirection: "LR",
    // Tighter than before; post-process in scripts/fix-data-model-erd-svg.mjs still widens narrow cells.
    minEntityWidth: 480,
    minEntityHeight: 88,
    entityPadding: 18,
    diagramPadding: 28,
    nodeSpacing: 110,
    rankSpacing: 64,
    fontSize: 14,
  },
  themeCSS: `
    /* Mermaid ER uses <foreignObject> with fixed width/height; avoid clipping overflow. */
    #my-svg foreignObject {
      overflow: visible !important;
    }
    #my-svg foreignObject div {
      overflow: visible !important;
    }
  `,
};
