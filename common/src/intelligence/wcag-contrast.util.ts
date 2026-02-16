export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleaned = hex.replace(/^#/, '');

  const expanded = expandShorthandHex(cleaned);

  return {
    r: parseInt(expanded.substring(0, 2), 16),
    g: parseInt(expanded.substring(2, 4), 16),
    b: parseInt(expanded.substring(4, 6), 16),
  };
}

function expandShorthandHex(hex: string): string {
  if (hex.length === 3) {
    return hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  return hex;
}

export function relativeLuminance(r: number, g: number, b: number): number {
  const rLinear = linearizeSrgbChannel(r / 255);
  const gLinear = linearizeSrgbChannel(g / 255);
  const bLinear = linearizeSrgbChannel(b / 255);

  return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear;
}

function linearizeSrgbChannel(value: number): number {
  if (value <= 0.04045) {
    return value / 12.92;
  }
  return Math.pow((value + 0.055) / 1.055, 2.4);
}

export function contrastRatio(hex1: string, hex2: string): number {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);

  const l1 = relativeLuminance(rgb1.r, rgb1.g, rgb1.b);
  const l2 = relativeLuminance(rgb2.r, rgb2.g, rgb2.b);

  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  return (lighter + 0.05) / (darker + 0.05);
}

export function meetsAA(foreground: string, background: string, largeText = false): boolean {
  const ratio = contrastRatio(foreground, background);
  const threshold = largeText ? 3.0 : 4.5;
  return ratio >= threshold;
}

export function suggestAccessibleColor(foreground: string, background: string, targetRatio = 4.5): string {
  if (contrastRatio(foreground, background) >= targetRatio) {
    return foreground;
  }

  const bgRgb = hexToRgb(background);
  const bgLuminance = relativeLuminance(bgRgb.r, bgRgb.g, bgRgb.b);

  const fgHsl = rgbToHsl(hexToRgb(foreground));

  const shouldDarken = bgLuminance > 0.5;

  for (let step = 1; step <= 20; step++) {
    const adjustedLightness = shouldDarken ? Math.max(0, fgHsl.l - step * 5) : Math.min(100, fgHsl.l + step * 5);

    const adjustedRgb = hslToRgb({ h: fgHsl.h, s: fgHsl.s, l: adjustedLightness });
    const adjustedHex = rgbToHex(adjustedRgb);

    if (contrastRatio(adjustedHex, background) >= targetRatio) {
      return adjustedHex;
    }
  }

  return shouldDarken ? '#000000' : '#FFFFFF';
}

function rgbToHsl(rgb: { r: number; g: number; b: number }): { h: number; s: number; l: number } {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l: l * 100 };
  }

  const delta = max - min;
  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);

  let h = 0;
  if (max === r) {
    h = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
  } else if (max === g) {
    h = ((b - r) / delta + 2) / 6;
  } else {
    h = ((r - g) / delta + 4) / 6;
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToRgb(hsl: { h: number; s: number; l: number }): { r: number; g: number; b: number } {
  const h = hsl.h / 360;
  const s = hsl.s / 100;
  const l = hsl.l / 100;

  if (s === 0) {
    const gray = Math.round(l * 255);
    return { r: gray, g: gray, b: gray };
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return {
    r: Math.round(hueToRgbChannel(p, q, h + 1 / 3) * 255),
    g: Math.round(hueToRgbChannel(p, q, h) * 255),
    b: Math.round(hueToRgbChannel(p, q, h - 1 / 3) * 255),
  };
}

function hueToRgbChannel(p: number, q: number, t: number): number {
  let normalizedT = t;
  if (normalizedT < 0) normalizedT += 1;
  if (normalizedT > 1) normalizedT -= 1;

  if (normalizedT < 1 / 6) return p + (q - p) * 6 * normalizedT;
  if (normalizedT < 1 / 2) return q;
  if (normalizedT < 2 / 3) return p + (q - p) * (2 / 3 - normalizedT) * 6;
  return p;
}

function rgbToHex(rgb: { r: number; g: number; b: number }): string {
  const toHexByte = (value: number) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0');

  return `#${toHexByte(rgb.r)}${toHexByte(rgb.g)}${toHexByte(rgb.b)}`.toUpperCase();
}
