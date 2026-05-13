/** @type {import("mermaid").MermaidConfig} */
export default {
  er: {
    useMaxWidth: false,
    // Room for long @map column names; defaults (100×75) are too tight and clip foreignObject text.
    minEntityWidth: 720,
    minEntityHeight: 110,
    entityPadding: 28,
    diagramPadding: 48,
    nodeSpacing: 200,
    rankSpacing: 120,
    fontSize: 15,
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
