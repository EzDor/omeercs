import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';

interface Rgb {
  r: number;
  g: number;
  b: number;
}

export type { ThemeOutput } from './theme-brief.service';
import type { ThemeOutput } from './theme-brief.service';

@Injectable()
export class ThemeImageService {
  private readonly logger = new Logger(ThemeImageService.name);

  async extractTheme(imageBuffer: Buffer): Promise<{ theme: ThemeOutput; duration_ms: number }> {
    this.logger.log(`Extracting theme from image (${imageBuffer.length} bytes)`);
    const startTime = Date.now();

    const { data, info } = await sharp(imageBuffer).resize(200, 200, { fit: 'cover' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });

    const pixels = this.extractPixels(data, info.width, info.height);
    const dominantColors = this.kMeansClustering(pixels, 5, 20);
    const sortedColors = this.sortByFrequency(dominantColors);

    const palette = this.assignPaletteRoles(sortedColors);
    const extendedPalette = this.generateExtendedPalette(palette);
    const mood = this.classifyMood(palette);

    const durationMs = Date.now() - startTime;
    this.logger.log(`Theme extracted from image in ${durationMs}ms`);

    return {
      theme: {
        primary_color: this.rgbToHex(palette.primary),
        secondary_color: this.rgbToHex(palette.secondary),
        accent_color: this.rgbToHex(palette.accent),
        background_color: this.rgbToHex(palette.background),
        text_color: this.rgbToHex(palette.text),
        mood,
        confidence: 0.7,
        palette: extendedPalette,
      },
      duration_ms: durationMs,
    };
  }

  private extractPixels(data: Buffer, width: number, height: number): Rgb[] {
    const pixels: Rgb[] = [];
    for (let i = 0; i < width * height * 3; i += 3) {
      pixels.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
    }
    return pixels;
  }

  private kMeansClustering(pixels: Rgb[], k: number, maxIterations: number): { centroid: Rgb; count: number }[] {
    let centroids = this.initializeCentroids(pixels, k);

    for (let iter = 0; iter < maxIterations; iter++) {
      const clusters: Rgb[][] = Array.from({ length: k }, () => []);

      for (const pixel of pixels) {
        let minDist = Infinity;
        let closestIdx = 0;
        for (let i = 0; i < centroids.length; i++) {
          const dist = this.colorDistance(pixel, centroids[i]);
          if (dist < minDist) {
            minDist = dist;
            closestIdx = i;
          }
        }
        clusters[closestIdx].push(pixel);
      }

      let converged = true;
      const newCentroids: Rgb[] = [];
      for (let i = 0; i < k; i++) {
        if (clusters[i].length === 0) {
          newCentroids.push(centroids[i]);
          continue;
        }
        const avg = this.averageColor(clusters[i]);
        if (this.colorDistance(avg, centroids[i]) > 1) {
          converged = false;
        }
        newCentroids.push(avg);
      }
      centroids = newCentroids;

      if (converged) break;
    }

    const clusters: Rgb[][] = Array.from({ length: k }, () => []);
    for (const pixel of pixels) {
      let minDist = Infinity;
      let closestIdx = 0;
      for (let i = 0; i < centroids.length; i++) {
        const dist = this.colorDistance(pixel, centroids[i]);
        if (dist < minDist) {
          minDist = dist;
          closestIdx = i;
        }
      }
      clusters[closestIdx].push(pixel);
    }

    return centroids.map((centroid, i) => ({ centroid, count: clusters[i].length }));
  }

  private initializeCentroids(pixels: Rgb[], k: number): Rgb[] {
    const step = Math.floor(pixels.length / k);
    return Array.from({ length: k }, (_, i) => ({ ...pixels[i * step] }));
  }

  private colorDistance(a: Rgb, b: Rgb): number {
    return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
  }

  private averageColor(pixels: Rgb[]): Rgb {
    const sum = pixels.reduce((acc, p) => ({ r: acc.r + p.r, g: acc.g + p.g, b: acc.b + p.b }), { r: 0, g: 0, b: 0 });
    return {
      r: Math.round(sum.r / pixels.length),
      g: Math.round(sum.g / pixels.length),
      b: Math.round(sum.b / pixels.length),
    };
  }

  private sortByFrequency(clusters: { centroid: Rgb; count: number }[]): { centroid: Rgb; count: number }[] {
    return [...clusters].sort((a, b) => b.count - a.count);
  }

  private assignPaletteRoles(sorted: { centroid: Rgb; count: number }[]): { primary: Rgb; secondary: Rgb; accent: Rgb; background: Rgb; text: Rgb } {
    const withLightness = sorted.map((c) => ({
      ...c,
      lightness: (c.centroid.r * 0.299 + c.centroid.g * 0.587 + c.centroid.b * 0.114) / 255,
      saturation: this.calculateSaturation(c.centroid),
    }));

    const primary = withLightness[0].centroid;
    const secondary = withLightness.length > 1 ? withLightness[1].centroid : this.adjustLightness(primary, 0.2);

    const mostSaturated = [...withLightness].sort((a, b) => b.saturation - a.saturation);
    const accent = mostSaturated[0].centroid !== primary ? mostSaturated[0].centroid : this.adjustLightness(primary, -0.15);

    const lightest = [...withLightness].sort((a, b) => b.lightness - a.lightness);
    const background = lightest[0].lightness > 0.7 ? lightest[0].centroid : { r: 255, g: 255, b: 255 };

    const darkest = [...withLightness].sort((a, b) => a.lightness - b.lightness);
    const text = darkest[0].lightness < 0.3 ? darkest[0].centroid : { r: 33, g: 33, b: 33 };

    return { primary, secondary, accent, background, text };
  }

  private calculateSaturation(c: Rgb): number {
    const max = Math.max(c.r, c.g, c.b) / 255;
    const min = Math.min(c.r, c.g, c.b) / 255;
    if (max === 0) return 0;
    return (max - min) / max;
  }

  private adjustLightness(color: Rgb, amount: number): Rgb {
    return {
      r: Math.max(0, Math.min(255, Math.round(color.r + amount * 255))),
      g: Math.max(0, Math.min(255, Math.round(color.g + amount * 255))),
      b: Math.max(0, Math.min(255, Math.round(color.b + amount * 255))),
    };
  }

  private generateExtendedPalette(palette: { primary: Rgb; secondary: Rgb; accent: Rgb; background: Rgb; text: Rgb }): string[] {
    const base = [palette.primary, palette.secondary, palette.accent, palette.background, palette.text];
    const complementary1 = this.complementaryColor(palette.primary);
    const complementary2 = this.complementaryColor(palette.accent);
    return [...base, complementary1, complementary2].map((c) => this.rgbToHex(c));
  }

  private complementaryColor(c: Rgb): Rgb {
    return { r: 255 - c.r, g: 255 - c.g, b: 255 - c.b };
  }

  private classifyMood(palette: { primary: Rgb; secondary: Rgb; accent: Rgb; background: Rgb; text: Rgb }): string {
    const { primary } = palette;
    const hue = this.rgbToHue(primary);
    const sat = this.calculateSaturation(primary);
    const lightness = (primary.r * 0.299 + primary.g * 0.587 + primary.b * 0.114) / 255;

    if (sat < 0.15) return 'minimal';
    if (hue >= 0 && hue < 30 && sat > 0.5) return 'urgent';
    if (hue >= 30 && hue < 60 && lightness > 0.6) return 'festive';
    if (hue >= 60 && hue < 150 && sat > 0.3) return 'natural';
    if (hue >= 200 && hue < 260 && lightness < 0.4) return 'professional';
    if (lightness < 0.3 && sat < 0.4) return 'premium';
    if (sat > 0.6 && lightness > 0.5) return 'playful';
    return 'professional';
  }

  private rgbToHue(c: Rgb): number {
    const r = c.r / 255;
    const g = c.g / 255;
    const b = c.b / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;

    if (delta === 0) return 0;

    let hue = 0;
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;

    hue = Math.round(hue * 60);
    return hue < 0 ? hue + 360 : hue;
  }

  private rgbToHex(c: Rgb): string {
    const toHex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
    return `#${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`;
  }
}
