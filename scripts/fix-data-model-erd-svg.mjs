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
  path.join(process.cwd(), "docs/core-data-model-erd.svg"),
  path.join(process.cwd(), "docs/packing-data-model-erd.svg"),
  path.join(process.cwd(), "docs/rides-data-model-erd.svg"),
  path.join(process.cwd(), "docs/tasks-data-model-erd.svg"),
  path.join(process.cwd(), "docs/notifications-data-model-erd.svg"),
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

  // Mermaid ER uses narrow <foreignObject> cells vs inner max-width; text gets clipped.
  s = s.replace(/max-width: (\d+)px/g, (_, n) => {
    const v = Number(n);
    if (!Number.isFinite(v)) return _;
    const bumped = v < 200 ? v + 260 : v + 140;
    return `max-width: ${Math.min(bumped, 900)}px`;
  });
  s = s.replace(
    /<foreignObject width="([0-9.]+)" height="([0-9.]+)">/g,
    (match, wStr, hStr) => {
      const w0 = Number(wStr);
      const h0 = Number(hStr);
      if (!Number.isFinite(w0) || !Number.isFinite(h0) || w0 <= 0 || h0 <= 0) {
        return match;
      }
      let nw = w0;
      if (w0 < 56) {
        nw = Math.min(Math.max(w0 * 2.5, 88), 240);
      } else if (w0 < 420) {
        nw = Math.max(Math.round(w0 * 1.38 + 48), 320);
      }
      const nh = Math.max(Math.round(h0 * 1.22 + 10), Math.round(h0 + 6));
      return `<foreignObject width="${nw}" height="${nh}">`;
    },
  );

  if (!/^<svg[^>]*\boverflow="visible"/.test(s)) {
    s = s.replace(/^<svg(\s)/, '<svg overflow="visible"$1');
  }

  // Let viewers use the declared pixel size; avoid capping to diagram width.
  s = s.replace(/style="max-width:[^;]+;\s*/g, 'style="max-width: none; ');

  fs.writeFileSync(file, s);
}
