// Color palette for arena equity-curve charts and per-bot accents.
//
// The first five entries are the original hand-picked vivid colors (preserved
// to avoid any visual regression for 2–5 bot battles). Beyond index 4 we
// generate evenly-spaced HSL hues so any number of gladiators render with
// distinct, readable colors.

const BASE_COLORS = ['#39FF14', '#A855F7', '#EC4899', '#22D3EE', '#EAB308'];

function hslToHex(h: number, s: number, l: number): string {
  // h in [0,360], s,l in [0,1]. Returns "#RRGGBB".
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60)       { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else              { r = c; g = 0; b = x; }
  const to255 = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to255(r)}${to255(g)}${to255(b)}`.toUpperCase();
}

/**
 * Returns the chart line color for the i-th gladiator (0-indexed).
 *
 * - Indexes 0–4 reuse the original BASE_COLORS palette (no visual regression).
 * - Indexes ≥ 5 get evenly-spaced HSL hues, offset so they don't collide with
 *   the base colors. Saturation and lightness are kept high for readability
 *   on the dark theme.
 */
export function getLineColor(index: number): string {
  if (index < 0) return BASE_COLORS[0];
  if (index < BASE_COLORS.length) return BASE_COLORS[index];

  // Beyond the base palette: rotate around the hue wheel using the golden-
  // angle (~137.508°) so adjacent indexes always look noticeably different
  // even as the count grows.
  const offset = index - BASE_COLORS.length;
  const hue = (40 + offset * 137.508) % 360;
  const sat = 0.78;
  const lit = offset % 2 === 0 ? 0.58 : 0.66;
  return hslToHex(hue, sat, lit);
}

/**
 * Returns the first N colors as a plain array — handy when a chart component
 * expects a `colors` prop rather than a per-index lookup.
 */
export function getLineColors(count: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(getLineColor(i));
  return out;
}
