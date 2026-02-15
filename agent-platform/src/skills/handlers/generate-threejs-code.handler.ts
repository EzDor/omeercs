import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GenerateThreejsCodeInput, GenerateThreejsCodeOutput, CodeFile, CodeFilePurpose } from '@agentic-template/dto/src/skills/generate-threejs-code.dto';
import { SkillResult, skillSuccess, skillFailure, SkillArtifact } from '@agentic-template/dto/src/skills/skill-result.interface';
import { SkillHandler, SkillExecutionContext } from '../interfaces/skill-handler.interface';
import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';

const PURPOSE_MAP: Record<string, CodeFilePurpose> = {
  'scene-setup.js': 'scene_setup',
  'game-logic.js': 'game_logic',
  'asset-loader.js': 'asset_loader',
  'interaction.js': 'interaction',
  'animation.js': 'animation',
  'main.js': 'entry',
};

const BACKOFF_BASE_MS = 1000;

@Injectable()
export class GenerateThreejsCodeHandler implements SkillHandler<GenerateThreejsCodeInput, GenerateThreejsCodeOutput> {
  private readonly logger = new Logger(GenerateThreejsCodeHandler.name);
  private readonly outputDir: string;
  private readonly model: string;
  private readonly maxRetries: number;
  private readonly promptsDir: string;
  private client: Anthropic | null = null;

  constructor(private readonly configService: ConfigService) {
    this.outputDir = configService.get<string>('ASSET_STORAGE_DIR') || '/tmp/skills/assets';
    this.model = configService.get<string>('CODE_GEN_MODEL') || 'claude-opus-4-6';
    this.maxRetries = parseInt(configService.get<string>('CODE_GEN_MAX_RETRIES') || '3', 10);
    this.promptsDir = path.resolve(__dirname, '..', '..', 'prompt-registry', 'prompts');
  }

  private getClient(): Anthropic {
    if (!this.client) {
      const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY is not configured');
      }
      this.client = new Anthropic({ apiKey });
    }
    return this.client;
  }

  async execute(input: GenerateThreejsCodeInput, context: SkillExecutionContext): Promise<SkillResult<GenerateThreejsCodeOutput>> {
    const startTime = Date.now();
    const timings: Record<string, number> = {};

    this.logger.log(`Generating Three.js code for template ${input.template_id}, execution ${context.executionId}`);

    try {
      const promptStart = Date.now();
      const systemPrompt = this.loadPromptFile('threejs-system.prompt.txt');
      const templatePrompt = this.loadPromptFile(`${input.template_id.replace(/_/g, '-')}.prompt.txt`);
      const userPrompt = this.buildUserPrompt(input);
      timings['build_prompts'] = Date.now() - promptStart;

      let lastError: string | null = null;
      let codeFiles: CodeFile[] = [];

      for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
        const genStart = Date.now();

        try {
          const messages = this.buildMessages(templatePrompt, userPrompt, lastError);
          const response = await this.callClaude(systemPrompt, messages);
          timings[`generation_attempt_${attempt}`] = Date.now() - genStart;

          const parseStart = Date.now();
          codeFiles = this.parseCodeFiles(response);
          timings['parse_code'] = Date.now() - parseStart;

          if (codeFiles.length === 0) {
            lastError = 'No code files were generated. Output must contain // FILE: headers.';
            this.logger.warn(`Attempt ${attempt}: No code files parsed, retrying...`);
            await this.backoff(attempt);
            continue;
          }

          this.logger.log(`Attempt ${attempt}: Generated ${codeFiles.length} code files`);
          break;
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          lastError = errorMsg;
          timings[`generation_attempt_${attempt}`] = Date.now() - genStart;

          if (attempt >= this.maxRetries) {
            return skillFailure(`Code generation failed after ${this.maxRetries} attempts: ${errorMsg}`, 'CODE_GENERATION_FAILED', {
              timings_ms: { total: Date.now() - startTime, ...timings },
              attempts: attempt,
            });
          }

          this.logger.warn(`Attempt ${attempt} failed: ${errorMsg}, retrying...`);
          await this.backoff(attempt);
        }
      }

      if (codeFiles.length === 0) {
        return skillFailure(`Code generation produced no files after ${this.maxRetries} attempts`, 'CODE_GENERATION_EMPTY', {
          timings_ms: { total: Date.now() - startTime, ...timings },
          attempts: this.maxRetries,
        });
      }

      const writeStart = Date.now();
      const codeDir = path.join(this.outputDir, context.executionId, 'generated_code');
      this.writeCodeFiles(codeDir, codeFiles);
      timings['write_files'] = Date.now() - writeStart;

      const totalLines = codeFiles.reduce((sum, f) => sum + f.line_count, 0);

      const output: GenerateThreejsCodeOutput = {
        code_files: codeFiles,
        code_dir: codeDir,
        total_lines: totalLines,
      };

      const artifacts: SkillArtifact[] = codeFiles.map((f) => ({
        artifact_type: 'code/javascript',
        uri: path.join(codeDir, f.filename),
        metadata: { purpose: f.purpose, line_count: f.line_count },
      }));

      return skillSuccess(output, artifacts, {
        timings_ms: { total: Date.now() - startTime, ...timings },
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Code generation failed: ${errorMsg}`);
      return skillFailure(errorMsg, 'EXECUTION_ERROR', {
        timings_ms: { total: Date.now() - startTime, ...timings },
      });
    }
  }

  private loadPromptFile(filename: string): string {
    const filePath = path.join(this.promptsDir, filename);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Prompt file not found: ${filePath}`);
    }
    return fs.readFileSync(filePath, 'utf-8');
  }

  private buildUserPrompt(input: GenerateThreejsCodeInput): string {
    const sections: string[] = [
      `Generate Three.js game code for the "${input.template_id}" template.`,
      '',
      '## Game Configuration',
      '```json',
      JSON.stringify(input.game_config, null, 2),
      '```',
    ];

    if (input.asset_mappings && input.asset_mappings.length > 0) {
      sections.push('', '## Asset Mappings', '```json', JSON.stringify(input.asset_mappings, null, 2), '```');
    }

    if (input.scene_overrides) {
      sections.push('', '## Scene Overrides', '```json', JSON.stringify(input.scene_overrides, null, 2), '```');
    }

    if (input.sealed_outcome_token) {
      sections.push('', '## Sealed Outcome', 'The game config will contain a `sealed_outcome_token` field.', 'Use `window.GAME_CONFIG.sealed_outcome_token` to access the pre-determined outcome.');
    }

    sections.push('', '## Template Scene Config', '```json', JSON.stringify(input.template_manifest.scene_config, null, 2), '```');

    sections.push('', '## Asset Slots', '```json', JSON.stringify(input.template_manifest.asset_slots, null, 2), '```');

    return sections.join('\n');
  }

  private buildMessages(templatePrompt: string, userPrompt: string, lastError: string | null): Array<{ role: 'user' | 'assistant'; content: string }> {
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    let fullUserPrompt = `## Template Instructions\n\n${templatePrompt}\n\n## Generation Request\n\n${userPrompt}`;

    if (lastError) {
      fullUserPrompt += `\n\n## Previous Attempt Error\nThe previous generation attempt had this issue: ${lastError}\nPlease fix this in your output.`;
    }

    messages.push({ role: 'user', content: fullUserPrompt });

    return messages;
  }

  private async callClaude(systemPrompt: string, messages: Array<{ role: 'user' | 'assistant'; content: string }>): Promise<string> {
    const client = this.getClient();
    const response = await client.messages.create({
      model: this.model,
      max_tokens: 16000,
      system: systemPrompt,
      messages,
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('Claude response contained no text content');
    }

    return textBlock.text;
  }

  private parseCodeFiles(response: string): CodeFile[] {
    const files: CodeFile[] = [];
    const filePattern = /\/\/ FILE: (.+\.js)\s*\n/g;
    const matches = [...response.matchAll(filePattern)];

    if (matches.length === 0) {
      return files;
    }

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const filename = match[1].trim();
      const startIdx = match.index! + match[0].length;
      const endIdx = i + 1 < matches.length ? matches[i + 1].index! : response.length;

      let content = response.substring(startIdx, endIdx).trim();
      content = content.replace(/^```(?:javascript|js)?\s*\n?/, '').replace(/\n?```\s*$/, '');

      const lineCount = content.split('\n').length;
      const purpose = PURPOSE_MAP[filename] || this.inferPurpose(filename);

      files.push({ filename, purpose, content, line_count: lineCount });
    }

    return files;
  }

  private inferPurpose(filename: string): CodeFilePurpose {
    if (filename.includes('scene') || filename.includes('setup')) return 'scene_setup';
    if (filename.includes('logic') || filename.includes('game')) return 'game_logic';
    if (filename.includes('asset') || filename.includes('load')) return 'asset_loader';
    if (filename.includes('interact') || filename.includes('input')) return 'interaction';
    if (filename.includes('anim')) return 'animation';
    return 'entry';
  }

  private writeCodeFiles(codeDir: string, files: CodeFile[]): void {
    if (!fs.existsSync(codeDir)) {
      fs.mkdirSync(codeDir, { recursive: true });
    }
    for (const file of files) {
      fs.writeFileSync(path.join(codeDir, file.filename), file.content);
    }
  }

  private async backoff(attempt: number): Promise<void> {
    const delay = BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}
