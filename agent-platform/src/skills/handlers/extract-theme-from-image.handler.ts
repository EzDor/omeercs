import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import * as fs from 'fs';
import { SkillResult, skillSuccess, skillFailure } from '@agentic-template/dto/src/skills/skill-result.interface';
import { SkillHandler, SkillExecutionContext } from '../interfaces/skill-handler.interface';

interface ExtractThemeInput {
  image_uri: string;
  max_colors?: number;
}

interface ThemeColor {
  r: number;
  g: number;
  b: number;
}

interface ExtractThemeOutput {
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  background_color: string;
  text_color: string;
  mood: string;
  confidence: number;
  palette: string[];
}

const MOOD_MAP: Array<{ hueRange: [number, number]; satRange: [number, number]; mood: string }> = [
  { hueRange: [0, 30], satRange: [0.5, 1], mood: 'urgent' },
  { hueRange: [30, 70], satRange: [0.5, 1], mood: 'playful' },
  { hueRange: [70, 160], satRange: [0.3, 1], mood: 'natural' },
  { hueRange: [160, 260], satRange: [0.3, 1], mood: 'professional' },
  { hueRange: [260, 320], satRange: [0.5, 1], mood: 'premium' },
  { hueRange: [320, 360], satRange: [0.5, 1], mood: 'festive' },
];

@Injectable()
export class ExtractThemeFromImageHandler implements SkillHandler<ExtractThemeInput, ExtractThemeOutput> {
  private readonly logger = new Logger(ExtractThemeFromImageHandler.name);
  private readonly storageDir: string;

  constructor(private readonly configService: ConfigService) {
    this.storageDir = configService.get<string>('ASSET_STORAGE_DIR') || '/tmp/assets';
  }

  async execute(input: ExtractThemeInput, context: SkillExecutionContext): Promise<SkillResult<ExtractThemeOutput>> {
    const startTime = Date.now();
    const maxColors = input.max_colors || 5;

    this.logger.log(`Extracting theme from image: ${input.image_uri}, maxColors=${maxColors}`);

    try {
      const imagePath = this.resolveImagePath(input.image_uri);

      if (!fs.existsSync(imagePath)) {
        this.logger.warn(`Image not found at ${imagePath}, returning default theme`);
        return skillSuccess(this.buildDefaultTheme(), [], {
          timings_ms: { total: Date.now() - startTime },
        });
      }

      const { data, info } = await sharp(imagePath).resize(100, 100, { fit: 'cover' }).raw().toBuffer({ resolveWithObject: true });

      const colors = this.extractDominantColors(data, info.width, info.height, info.channels, maxColors);
      const sorted = this.sortByBrightness(colors);

      const theme = this.mapColorsToTheme(sorted);
      const totalTime = Date.now() - startTime;

      this.logger.log(`Theme extracted in ${totalTime}ms: primary=${theme.primary_color}, mood=${theme.mood}`);

      return skillSuccess(theme, [], {
        timings_ms: { total: totalTime },
      });
    } catch (error) {
      const totalTime = Date.now() - startTime;
      this.logger.error(`Failed to extract theme: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return skillFailure(error instanceof Error ? error.message : 'Unknown error', 'EXECUTION_ERROR', {
        timings_ms: { total: totalTime },
      });
    }
  }

  private resolveImagePath(uri: string): string {
    if (uri.startsWith('/')) return uri;
    if (uri.startsWith('storage://')) return uri.replace('storage://', `${this.storageDir}/`);
    return `${this.storageDir}/${uri}`;
  }

  private extractDominantColors(data: Buffer, width: number, height: number, channels: number, maxColors: number): ThemeColor[] {
    const buckets = new Map<string, { r: number; g: number; b: number; count: number }>();

    for (let i = 0; i < data.length; i += channels) {
      const r = Math.round(data[i] / 32) * 32;
      const g = Math.round(data[i + 1] / 32) * 32;
      const b = Math.round(data[i + 2] / 32) * 32;
      const key = `${r},${g},${b}`;

      const existing = buckets.get(key);
      if (existing) {
        existing.r += data[i];
        existing.g += data[i + 1];
        existing.b += data[i + 2];
        existing.count++;
      } else {
        buckets.set(key, { r: data[i], g: data[i + 1], b: data[i + 2], count: 1 });
      }
    }

    return Array.from(buckets.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, maxColors)
      .map((b) => ({
        r: Math.round(b.r / b.count),
        g: Math.round(b.g / b.count),
        b: Math.round(b.b / b.count),
      }));
  }

  private sortByBrightness(colors: ThemeColor[]): ThemeColor[] {
    return [...colors].sort((a, b) => {
      const brightnessA = 0.299 * a.r + 0.587 * a.g + 0.114 * a.b;
      const brightnessB = 0.299 * b.r + 0.587 * b.g + 0.114 * b.b;
      return brightnessB - brightnessA;
    });
  }

  private toHex(color: ThemeColor): string {
    return `#${color.r.toString(16).padStart(2, '0')}${color.g.toString(16).padStart(2, '0')}${color.b.toString(16).padStart(2, '0')}`.toUpperCase();
  }

  private rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h = 0;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
    return { h: h * 360, s, l };
  }

  private classifyMood(colors: ThemeColor[]): string {
    if (colors.length === 0) return 'minimal';
    const primary = colors[0];
    const hsl = this.rgbToHsl(primary.r, primary.g, primary.b);
    if (hsl.s < 0.15) return 'minimal';
    for (const entry of MOOD_MAP) {
      if (hsl.h >= entry.hueRange[0] && hsl.h < entry.hueRange[1] && hsl.s >= entry.satRange[0]) {
        return entry.mood;
      }
    }
    return 'professional';
  }

  private mapColorsToTheme(sorted: ThemeColor[]): ExtractThemeOutput {
    const palette = sorted.map((c) => this.toHex(c));

    while (palette.length < 5) {
      palette.push(palette[palette.length - 1] || '#333333');
    }

    const brightest = sorted[0] || { r: 255, g: 255, b: 255 };
    const darkest = sorted[sorted.length - 1] || { r: 0, g: 0, b: 0 };
    const mid = sorted[Math.floor(sorted.length / 2)] || { r: 128, g: 128, b: 128 };

    const bgBrightness = 0.299 * brightest.r + 0.587 * brightest.g + 0.114 * brightest.b;
    const textColor = bgBrightness > 128 ? '#1A1A1A' : '#F5F5F5';

    return {
      primary_color: this.toHex(sorted[1] || mid),
      secondary_color: this.toHex(sorted[2] || darkest),
      accent_color: this.toHex(sorted.length > 3 ? sorted[3] : mid),
      background_color: this.toHex(brightest),
      text_color: textColor,
      mood: this.classifyMood(sorted),
      confidence: Math.min(0.9, 0.5 + sorted.length * 0.08),
      palette,
    };
  }

  private buildDefaultTheme(): ExtractThemeOutput {
    return {
      primary_color: '#FF5733',
      secondary_color: '#33FF57',
      accent_color: '#3357FF',
      background_color: '#FFFFFF',
      text_color: '#1A1A1A',
      mood: 'playful',
      confidence: 0.3,
      palette: ['#FF5733', '#33FF57', '#3357FF', '#FFFFFF', '#1A1A1A'],
    };
  }
}
