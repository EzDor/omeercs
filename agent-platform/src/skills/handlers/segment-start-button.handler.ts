import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LiteLLMHttpClient } from '@agentic-template/common/src/llm/litellm-http.client';
import { LiteLLMClientFactory } from '@agentic-template/common/src/llm/litellm-client.factory';
import { SegmentStartButtonInput, SegmentStartButtonOutput, BoundingBox, MaskPolygon } from '@agentic-template/dto/src/skills/segment-start-button.dto';
import { SkillResult, skillSuccess, skillFailure } from '@agentic-template/dto/src/skills/skill-result.interface';
import { SkillHandler, SkillExecutionContext } from '../interfaces/skill-handler.interface';
import * as fs from 'fs';
import * as path from 'path';

const BUTTON_DETECTION_SYSTEM_PROMPT = `You are a computer vision expert specialized in UI element detection. Your task is to detect and locate start/play buttons in images.

Analyze the provided image and:
1. Identify any start button, play button, or call-to-action button
2. Provide the bounding box coordinates (x, y, width, height) in pixels
3. Provide polygon points that trace the button's outline for precise masking
4. Classify the button type (play, start, cta, or unknown)
5. Rate your confidence in the detection (0-1)

Important guidelines:
- Coordinates should be in pixels from the top-left corner
- Polygon points should trace the button boundary clockwise
- If no button is detected, set detected to false
- Consider common button styles: circular play icons, rectangular CTAs, rounded buttons`;

const BUTTON_DETECTION_OUTPUT_SCHEMA = {
  name: 'button_detection',
  description: 'Button detection result with bounding box and mask polygon',
  strict: true,
  schema: {
    type: 'object',
    required: ['detected', 'confidence', 'bounds', 'mask_polygon', 'button_type', 'analysis_notes'],
    properties: {
      detected: { type: 'boolean' },
      confidence: { type: 'number' },
      bounds: {
        type: 'object',
        required: ['x', 'y', 'width', 'height'],
        properties: {
          x: { type: 'number' },
          y: { type: 'number' },
          width: { type: 'number' },
          height: { type: 'number' },
        },
        additionalProperties: false,
      },
      mask_polygon: {
        type: 'object',
        required: ['points', 'is_closed'],
        properties: {
          points: {
            type: 'array',
            items: {
              type: 'object',
              required: ['x', 'y'],
              properties: {
                x: { type: 'number' },
                y: { type: 'number' },
              },
              additionalProperties: false,
            },
          },
          is_closed: { type: 'boolean' },
        },
        additionalProperties: false,
      },
      button_type: { type: 'string', enum: ['play', 'start', 'cta', 'unknown'] },
      analysis_notes: { type: 'string' },
    },
    additionalProperties: false,
  },
};

@Injectable()
export class SegmentStartButtonHandler implements SkillHandler<SegmentStartButtonInput, SegmentStartButtonOutput> {
  private readonly logger = new Logger(SegmentStartButtonHandler.name);
  private readonly llmClient: LiteLLMHttpClient;
  private readonly defaultModel: string;
  private readonly outputDir: string;

  constructor(private readonly configService: ConfigService) {
    this.llmClient = LiteLLMClientFactory.createClientFromConfig(configService);
    this.defaultModel = configService.get<string>('VISION_MODEL') || 'gpt-4o';
    this.outputDir = configService.get<string>('SKILLS_OUTPUT_DIR') || '/tmp/skills/output';
  }

  async execute(input: SegmentStartButtonInput, context: SkillExecutionContext): Promise<SkillResult<SegmentStartButtonOutput>> {
    const startTime = Date.now();
    const timings: Record<string, number> = {};

    this.logger.log(`Executing segment_start_button for tenant ${context.tenantId}, execution ${context.executionId}`);

    try {
      // Prepare image for vision model
      const prepareStart = Date.now();
      const imageUrl = this.prepareImageUrl(input.image_uri);
      timings['prepare'] = Date.now() - prepareStart;

      // Build the detection prompt
      const userPrompt = this.buildUserPrompt(input);

      // Call vision model
      const visionStart = Date.now();
      const model = input.provider || this.defaultModel;

      const response = await this.llmClient.chatCompletion({
        model,
        messages: [
          { role: 'system', content: BUTTON_DETECTION_SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: userPrompt },
              {
                type: 'image_url',
                image_url: {
                  url: imageUrl,
                  detail: 'high',
                },
              },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 1000,
        response_format: {
          type: 'json_schema',
          json_schema: BUTTON_DETECTION_OUTPUT_SCHEMA,
        },
      });
      timings['vision'] = Date.now() - visionStart;

      // Parse response
      const parseStart = Date.now();
      const content = response.choices[0]?.message?.content;
      if (!content) {
        return skillFailure('No content in vision model response', 'EMPTY_RESPONSE', { timings_ms: { total: Date.now() - startTime, ...timings } });
      }

      const detectionResult = JSON.parse(content) as {
        detected: boolean;
        confidence: number;
        bounds: BoundingBox;
        mask_polygon: MaskPolygon;
        button_type: 'play' | 'start' | 'cta' | 'unknown';
        analysis_notes: string;
      };
      timings['parse'] = Date.now() - parseStart;

      // Check confidence threshold
      const confidenceThreshold = input.confidence_threshold ?? 0.7;
      if (detectionResult.detected && detectionResult.confidence < confidenceThreshold) {
        detectionResult.detected = false;
        detectionResult.analysis_notes += ` (Detection below confidence threshold of ${confidenceThreshold})`;
      }

      // Generate mask image if requested
      let maskImageUri: string | undefined;
      if (input.generate_mask && detectionResult.detected) {
        const maskStart = Date.now();
        maskImageUri = this.generateMaskImage(detectionResult.mask_polygon, detectionResult.bounds, context.executionId);
        timings['mask_generation'] = Date.now() - maskStart;
      }

      const totalTime = Date.now() - startTime;
      this.logger.log(`Button segmentation completed in ${totalTime}ms, detected: ${detectionResult.detected}`);

      const output: SegmentStartButtonOutput = {
        detected: detectionResult.detected,
        confidence: detectionResult.confidence,
        bounds: detectionResult.bounds,
        mask_polygon: detectionResult.mask_polygon,
        mask_image_uri: maskImageUri,
        button_type: detectionResult.button_type,
        detection_method_used: input.detection_method || 'auto',
        analysis_notes: detectionResult.analysis_notes,
      };

      const artifacts: Array<{
        artifact_type: string;
        uri: string;
        metadata: Record<string, unknown>;
      }> = [
        {
          artifact_type: 'json/button-bounds',
          uri: `memory://button-bounds/${context.executionId}`,
          metadata: {
            detected: detectionResult.detected,
            button_type: detectionResult.button_type,
            confidence: detectionResult.confidence,
          },
        },
      ];

      if (maskImageUri) {
        artifacts.push({
          artifact_type: 'image/button-mask',
          uri: maskImageUri,
          metadata: {
            format: 'png',
          },
        });
      }

      return skillSuccess(output, artifacts, {
        timings_ms: { total: totalTime, ...timings },
        provider_calls: [
          {
            provider: 'litellm',
            model,
            duration_ms: timings['vision'],
            tokens: {
              input: response.usage?.prompt_tokens || 0,
              output: response.usage?.completion_tokens || 0,
            },
          },
        ],
      });
    } catch (error) {
      const totalTime = Date.now() - startTime;
      this.logger.error(`Failed to segment button: ${error instanceof Error ? error.message : 'Unknown error'}`);

      return skillFailure(error instanceof Error ? error.message : 'Unknown error during button segmentation', 'EXECUTION_ERROR', {
        timings_ms: { total: totalTime, ...timings },
      });
    }
  }

  private buildUserPrompt(input: SegmentStartButtonInput): string {
    const parts: string[] = ['Analyze this image and detect any start/play button or CTA.'];

    if (input.button_hint) {
      parts.push(`Hint: Look for ${input.button_hint}`);
    }

    parts.push('Return the bounding box coordinates and polygon mask points in pixels.');

    return parts.join(' ');
  }

  private prepareImageUrl(imageUri: string): string {
    // If it's already a URL, return as-is
    if (imageUri.startsWith('http://') || imageUri.startsWith('https://')) {
      return imageUri;
    }

    // If it's a local file, convert to base64 data URL
    if (fs.existsSync(imageUri)) {
      const buffer = fs.readFileSync(imageUri);
      const base64 = buffer.toString('base64');
      const ext = path.extname(imageUri).toLowerCase().slice(1);
      const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
      return `data:${mimeType};base64,${base64}`;
    }

    throw new Error(`Invalid image URI: ${imageUri}`);
  }

  private generateMaskImage(polygon: MaskPolygon, bounds: BoundingBox, executionId: string): string {
    // In a production system, this would generate an actual mask image
    // using a canvas library like sharp or canvas
    // For now, we'll create a placeholder JSON file with the mask data

    const outputPath = path.join(this.outputDir, executionId);
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }

    const maskData = {
      bounds,
      polygon,
      format: 'polygon_points',
      note: 'Mask image generation requires canvas/sharp library integration',
    };

    const filePath = path.join(outputPath, 'button-mask.json');
    fs.writeFileSync(filePath, JSON.stringify(maskData, null, 2));

    this.logger.warn('Actual mask image generation not implemented - saved polygon data as JSON');
    return filePath;
  }
}
