import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpencode } from '@opencode-ai/sdk';
import type { Session, Part } from '@opencode-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';

export interface OpenCodeSessionResult {
  sessionId: string;
  textParts: string[];
}

interface OpenCodeInstance {
  client: ReturnType<Awaited<ReturnType<typeof createOpencode>>['client']> extends infer C ? C : never;
  server: ReturnType<Awaited<ReturnType<typeof createOpencode>>['server']> extends infer S ? S : never;
}

@Injectable()
export class OpenCodeService implements OnModuleDestroy {
  private readonly logger = new Logger(OpenCodeService.name);
  private readonly model: string;
  private instance: OpenCodeInstance | null = null;

  constructor(private readonly configService: ConfigService) {
    this.model = configService.get<string>('OPENCODE_MODEL') || 'anthropic/claude-opus-4-6';
  }

  private async ensureInstance(): Promise<OpenCodeInstance> {
    if (this.instance) return this.instance;

    this.logger.log('Starting embedded OpenCode server...');
    const { client, server } = await createOpencode({
      hostname: '127.0.0.1',
      port: 0,
      config: {
        model: this.model,
      },
    });

    this.instance = { client, server } as OpenCodeInstance;
    this.logger.log(`OpenCode server started at ${(server as { url?: string }).url || '127.0.0.1'}`);
    return this.instance;
  }

  private writeOpenCodeConfig(workspaceDir: string): void {
    const config = {
      $schema: 'https://opencode.ai/config.json',
      model: this.model,
      permission: {
        read: 'allow',
        write: 'allow',
        edit: 'allow',
        glob: 'allow',
        grep: 'allow',
        bash: 'deny',
        webfetch: 'deny',
        task: 'deny',
        '*': 'deny',
      },
    };

    fs.writeFileSync(path.join(workspaceDir, 'opencode.json'), JSON.stringify(config, null, 2));
  }

  async executeSession(params: {
    workspaceDir: string;
    systemPrompt: string;
    userPrompt: string;
    signal?: AbortSignal;
  }): Promise<OpenCodeSessionResult> {
    const { workspaceDir, systemPrompt, userPrompt } = params;
    const instance = await this.ensureInstance();

    this.writeOpenCodeConfig(workspaceDir);

    const session = await instance.client.session.create({
      body: { title: 'skill-execution' },
    });
    const sessionId = (session.data as Session).id;

    await instance.client.session.prompt({
      path: { id: sessionId },
      body: {
        noReply: true,
        parts: [{ type: 'text', text: systemPrompt } as Part],
      },
    });

    const response = await instance.client.session.prompt({
      path: { id: sessionId },
      body: {
        parts: [{ type: 'text', text: userPrompt } as Part],
      },
    });

    const textParts = this.extractTextParts(response);

    return { sessionId, textParts };
  }

  async sendFollowUp(params: {
    sessionId: string;
    prompt: string;
    signal?: AbortSignal;
  }): Promise<string[]> {
    const instance = await this.ensureInstance();

    const response = await instance.client.session.prompt({
      path: { id: params.sessionId },
      body: {
        parts: [{ type: 'text', text: params.prompt } as Part],
      },
    });

    return this.extractTextParts(response);
  }

  private extractTextParts(response: unknown): string[] {
    const parts: string[] = [];
    const resp = response as { data?: { parts?: Array<{ type: string; text?: string }> } };
    if (resp?.data?.parts) {
      for (const part of resp.data.parts) {
        if (part.type === 'text' && part.text) {
          parts.push(part.text);
        }
      }
    }
    return parts;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.instance) {
      this.logger.log('Shutting down OpenCode server...');
      try {
        (this.instance.server as { close?: () => void }).close?.();
      } catch (err) {
        this.logger.warn(`OpenCode server shutdown error: ${err instanceof Error ? err.message : 'Unknown'}`);
      }
      this.instance = null;
    }
  }
}
