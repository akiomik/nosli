const sqrt6 = Math.sqrt(6);
const sqrt3 = Math.sqrt(3);
const sqrt2 = Math.sqrt(2);

function dirCmax(zVal: number, dx: number, dy: number): number {
  let tMax = Infinity;
  const aR = (2 / sqrt6) * dx;
  const aG = (-1 / sqrt6) * dx + (1 / sqrt2) * dy;
  const aB = (-1 / sqrt6) * dx - (1 / sqrt2) * dy;
  for (const ak of [aR, aG, aB]) {
    if (ak !== 0) {
      const uk = (1 + Math.sign(ak)) / 2;
      const limit = (uk - zVal / sqrt3) / ak;
      tMax = Math.min(tMax, Math.max(0, limit));
    }
  }
  return isFinite(tMax) ? tMax : 0;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export function convertRgb(r: number, g: number, b: number): [number, number, number] {
  const X = (2 * r - g - b) / sqrt6;
  const Y = (g - b) / sqrt2;
  const Z = (r + g + b) / sqrt3;
  const Z2 = sqrt3 - Z;
  const C = Math.hypot(X, Y);
  let dx = 0;
  let dy = 0;
  if (C > 0) {
    dx = X / C;
    dy = Y / C;
  }
  const cMaxZ = dirCmax(Z, dx, dy);
  const cMaxZ2 = dirCmax(Z2, dx, dy);
  const factor = cMaxZ !== 0 ? cMaxZ2 / cMaxZ : 0;
  const X2 = factor * X;
  const Y2 = factor * Y;
  const R2 = (2 * X2) / sqrt6 + Z2 / sqrt3;
  const G2 = -X2 / sqrt6 + Y2 / sqrt2 + Z2 / sqrt3;
  const B2 = -X2 / sqrt6 - Y2 / sqrt2 + Z2 / sqrt3;
  return [clamp01(R2), clamp01(G2), clamp01(B2)];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return [r + m, g + m, b + m];
}

type ParsedColor = { r: number; g: number; b: number; a: number };

function parseAlpha(v: string | undefined): number {
  if (v == null) return 1;
  return v.endsWith('%') ? parseFloat(v) / 100 : parseFloat(v);
}

function parseColor(input: string): ParsedColor | null {
  const s = input.trim().toLowerCase();
  const hex = s.match(/^#([0-9a-f]+)$/);
  if (hex) {
    const h = hex[1];
    if (h.length === 3 || h.length === 4) {
      const r = parseInt(h[0] + h[0], 16) / 255;
      const g = parseInt(h[1] + h[1], 16) / 255;
      const b = parseInt(h[2] + h[2], 16) / 255;
      const a = h.length === 4 ? parseInt(h[3] + h[3], 16) / 255 : 1;
      return { r, g, b, a };
    }
    if (h.length === 6 || h.length === 8) {
      const r = parseInt(h.slice(0, 2), 16) / 255;
      const g = parseInt(h.slice(2, 4), 16) / 255;
      const b = parseInt(h.slice(4, 6), 16) / 255;
      const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
      return { r, g, b, a };
    }
    return null;
  }
  const rgb = s.match(
    /^rgba?\(\s*([0-9.]+%?)\s*[,\s]\s*([0-9.]+%?)\s*[,\s]\s*([0-9.]+%?)\s*(?:[,/]\s*([0-9.]+%?))?\s*\)$/
  );
  if (rgb) {
    const conv = (v: string) => (v.endsWith('%') ? parseFloat(v) / 100 : parseFloat(v) / 255);
    return { r: conv(rgb[1]), g: conv(rgb[2]), b: conv(rgb[3]), a: parseAlpha(rgb[4]) };
  }
  const hsl = s.match(
    /^hsla?\(\s*([0-9.]+)(?:deg)?\s*[,\s]\s*([0-9.]+)%\s*[,\s]\s*([0-9.]+)%\s*(?:[,/]\s*([0-9.]+%?))?\s*\)$/
  );
  if (hsl) {
    const [r, g, b] = hslToRgb(parseFloat(hsl[1]), parseFloat(hsl[2]) / 100, parseFloat(hsl[3]) / 100);
    return { r, g, b, a: parseAlpha(hsl[4]) };
  }
  return null;
}

function formatColor(r: number, g: number, b: number, a: number): string {
  const R = Math.round(clamp01(r) * 255);
  const G = Math.round(clamp01(g) * 255);
  const B = Math.round(clamp01(b) * 255);
  if (a < 1) {
    return `rgba(${R}, ${G}, ${B}, ${+a.toFixed(3)})`;
  }
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `#${h(R)}${h(G)}${h(B)}`;
}

function darkifyColor(input: string): string {
  const c = parseColor(input);
  if (!c) return input;
  const [r2, g2, b2] = convertRgb(c.r, c.g, c.b);
  return formatColor(r2, g2, b2, c.a);
}

const COLOR_RE = /#[0-9a-f]{3,8}\b|rgba?\([^)]+\)|hsla?\([^)]+\)/gi;
const VAR_RGB_TRIPLET_RE = /(--[a-z0-9-]+\s*:\s*)(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})(\s*(?:[;}]|$))/gi;

export function rewriteCss(css: string): string {
  let out = css.replace(COLOR_RE, (m) => darkifyColor(m));
  out = out.replace(VAR_RGB_TRIPLET_RE, (_, prefix, r, g, b, suffix) => {
    const ri = Math.min(255, parseInt(r, 10));
    const gi = Math.min(255, parseInt(g, 10));
    const bi = Math.min(255, parseInt(b, 10));
    const [r2, g2, b2] = convertRgb(ri / 255, gi / 255, bi / 255);
    const round = (n: number) => Math.round(clamp01(n) * 255);
    return `${prefix}${round(r2)} ${round(g2)} ${round(b2)}${suffix}`;
  });
  return out;
}

const STYLE_ID = 'darkmode-override';

function collectAllCss(): string {
  const parts: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    if ((sheet.ownerNode as HTMLElement | null)?.id === STYLE_ID) continue;
    try {
      for (const rule of Array.from(sheet.cssRules)) {
        if (rule.cssText.includes('[data-darkmode]')) continue;
        parts.push(rule.cssText);
      }
    } catch {
      // CORS-blocked sheet; skip
    }
  }
  return parts.join('\n');
}

export function applyDarkMode(): void {
  if (typeof document === 'undefined') return;
  const css = collectAllCss();
  const dark = rewriteCss(css);
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = dark;
}

export function removeDarkMode(): void {
  if (typeof document === 'undefined') return;
  document.getElementById(STYLE_ID)?.remove();
}
