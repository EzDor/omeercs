import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GenerateThreejsCodeInput, GenerateThreejsCodeOutput, CodeFile, CodeFilePurpose } from '@agentic-template/dto/src/skills/generate-threejs-code.dto';
import { SkillResult, skillSuccess, skillFailure, SkillArtifact } from '@agentic-template/dto/src/skills/skill-result.interface';
import { SkillHandler, SkillExecutionContext } from '../interfaces/skill-handler.interface';
import { OpenCodeService } from './opencode.service';
import { CodeSafetyService } from './code-safety.service';
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

const ALLOWED_TEMPLATE_IDS = ['spin_wheel', 'quiz', 'scratch_card', 'memory_match'];

@Injectable()
export class OpenCodeGenerateThreejsCodeHandler implements SkillHandler<GenerateThreejsCodeInput, GenerateThreejsCodeOutput> {
  private readonly logger = new Logger(OpenCodeGenerateThreejsCodeHandler.name);
  private readonly outputDir: string;
  private readonly promptsDir: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly openCodeService: OpenCodeService,
    private readonly codeSafetyService: CodeSafetyService,
  ) {
    this.outputDir = configService.get<string>('ASSET_STORAGE_DIR') || '/tmp/skills/assets';
    this.promptsDir = path.resolve(__dirname, '..', '..', 'prompt-registry', 'prompts');
  }

  async execute(input: GenerateThreejsCodeInput, context: SkillExecutionContext): Promise<SkillResult<GenerateThreejsCodeOutput>> {
    const startTime = Date.now();
    const timings: Record<string, number> = {};

    this.logger.log(`Generating Three.js code via OpenCode for template ${input.template_id}, execution ${context.executionId}`);

    if (!ALLOWED_TEMPLATE_IDS.includes(input.template_id)) {
      return skillFailure(`Invalid template_id: ${input.template_id}`, 'INVALID_TEMPLATE_ID', {
        timings_ms: { total: Date.now() - startTime },
      });
    }

    try {
      const promptStart = Date.now();
      const systemPrompt = this.loadPromptFile('threejs-system.prompt.txt');
      const templatePrompt = this.loadPromptFile(`${input.template_id.replace(/_/g, '-')}.prompt.txt`);
      const userPrompt = this.buildUserPrompt(input);
      timings['build_prompts'] = Date.now() - promptStart;

      const workspaceDir = path.join(this.outputDir, context.executionId, 'generated_code');
      const scriptsDir = path.join(workspaceDir, 'scripts');
      fs.mkdirSync(scriptsDir, { recursive: true });

      const agentSystemPrompt = this.buildAgentSystemPrompt(systemPrompt);
      const agentUserPrompt = `## Template Instructions\n\n${templatePrompt}\n\n## Generation Request\n\n${userPrompt}`;

      const genStart = Date.now();
      await this.openCodeService.executeSession({
        workspaceDir,
        systemPrompt: agentSystemPrompt,
        userPrompt: agentUserPrompt,
      });
      timings['opencode_generation'] = Date.now() - genStart;

      const safetyStart = Date.now();
      const safetyResult = this.codeSafetyService.validateWorkspaceFiles(workspaceDir, 'scripts');
      timings['safety_validation'] = Date.now() - safetyStart;

      if (!safetyResult.valid) {
        const reasons = [
          ...safetyResult.violations.map((v) => `${v.filename}: forbidden pattern ${v.pattern}`),
          ...safetyResult.invalidFilenames.map((f) => `invalid filename: ${f}`),
        ];
        return skillFailure(`Code safety validation failed: ${reasons.join('; ')}`, 'CODE_SAFETY_VIOLATION', {
          timings_ms: { total: Date.now() - startTime, ...timings },
        });
      }

      const codeFiles = this.collectCodeFiles(scriptsDir);

      if (codeFiles.length === 0) {
        return skillFailure('Code generation produced no .js files', 'CODE_GENERATION_EMPTY', {
          timings_ms: { total: Date.now() - startTime, ...timings },
        });
      }

      const totalLines = codeFiles.reduce((sum, f) => sum + f.line_count, 0);

      const output: GenerateThreejsCodeOutput = {
        code_files: codeFiles,
        code_dir: scriptsDir,
        total_lines: totalLines,
      };

      const artifacts: SkillArtifact[] = codeFiles.map((f) => ({
        artifact_type: 'code/javascript',
        uri: path.join(scriptsDir, f.filename),
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

  private buildAgentSystemPrompt(coreSystemPrompt: string): string {
    return [
      coreSystemPrompt,
      '',
      '== AGENT INSTRUCTIONS ==',
      '',
      'You are running as an autonomous code generation agent.',
      'Write each JavaScript file directly to the `scripts/` subdirectory using the file write tool.',
      'Use filenames with only alphanumeric characters, dashes, and underscores (e.g., scene-setup.js, game-logic.js).',
      'Do NOT use Node.js built-ins (fs, path, process, child_process).',
      'Do NOT use eval, new Function, require, or dynamic imports.',
      'Write only browser-safe Three.js/GSAP ES module code.',
      'Write all files to the `scripts/` directory only.',
    ].join('\n');
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
      sections.push(
        '',
        '## Sealed Outcome',
        'The game config will contain a `sealed_outcome_token` field.',
        'Use `window.GAME_CONFIG.sealed_outcome_token` to access the pre-determined outcome.',
      );
    }

    sections.push('', '## Template Scene Config', '```json', JSON.stringify(input.template_manifest.scene_config, null, 2), '```');
    sections.push('', '## Asset Slots', '```json', JSON.stringify(input.template_manifest.asset_slots, null, 2), '```');

    return sections.join('\n');
  }

  private loadPromptFile(filename: string): string {
    const resolvedPromptsDir = path.resolve(this.promptsDir);
    const filePath = path.resolve(this.promptsDir, filename);
    if (!filePath.startsWith(resolvedPromptsDir + path.sep)) {
      throw new Error('Prompt file path escapes prompts directory');
    }
    if (!fs.existsSync(filePath)) {
      throw new Error(`Prompt file not found for template: ${filename.replace('.prompt.txt', '')}`);
    }
    return fs.readFileSync(filePath, 'utf-8');
  }

  private collectCodeFiles(scriptsDir: string): CodeFile[] {
    if (!fs.existsSync(scriptsDir)) return [];

    const files: CodeFile[] = [];
    const entries = fs.readdirSync(scriptsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.js')) continue;

      const content = fs.readFileSync(path.join(scriptsDir, entry.name), 'utf-8');
      const lineCount = content.split('\n').length;
      const purpose = PURPOSE_MAP[entry.name] || this.inferPurpose(entry.name);

      files.push({ filename: entry.name, purpose, content, line_count: lineCount });
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
}
