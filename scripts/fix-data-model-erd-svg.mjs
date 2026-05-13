#!/usr/bin/env node
/**
 * Mermaid CLI emits the ERD root <svg width="100%" ...>. Browsers and GitHub
 * then scale the entire diagram to the container, so text becomes unreadable.
 * Set explicit width/height from viewBox so intrinsic size matches the diagram
 * (horizontal scroll / zoom in a new tab works as expected).
 */
import fs from "node:fs";
import path from "node:path";

const files = [
  path.join(process.cwd(), "docs/data-model-full-erd.svg"),
  path.join(process.cwd(), "docs/data-model-erd.svg"),
  path.join(process.cwd(), "docs/packing-data-model-erd.svg"),
  path.join(process.cwd(), "docs/rides-data-model-erd.svg"),
];

for (const file of files) {
  if (!fs.existsSync(file)) {
    continue;
  }

  let s = fs.readFileSync(file, "utf8");
  const vb = s.match(/viewBox="0\s+0\s+([\d.]+)\s+([\d.]+)"/);
  if (!vb) {
    continue;
  }

  const w = String(Math.ceil(Number(vb[1])));
  const h = String(Math.ceil(Number(vb[2])));

  if (s.includes('width="100%"')) {
    s = s.replace(
      /<svg(\s[^>]*?)\swidth="100%"/,
      `<svg$1 width="${w}" height="${h}"`,
    );
  }

  // Slightly larger default text at native 1:1 zoom (raw SVG / wide window).
  s = s.replace(
    /(#my-svg\{font-family:[^;]+;)font-size:(16|18)px/,
    "$1font-size:22px",
  );

  // Let viewers use the declared pixel size; avoid capping to diagram width.
  s = s.replace(/style="max-width:[^;]+;\s*/g, 'style="max-width: none; ');

  fs.writeFileSync(file, s);
}
