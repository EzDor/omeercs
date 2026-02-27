import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpencode, type OpencodeClient } from '@opencode-ai/sdk';
import type { Session, TextPartInput } from '@opencode-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';

export interface OpenCodeSessionResult {
  sessionId: string;
  textParts: string[];
}

interface OpenCodeInstance {
  client: OpencodeClient;
  server: { url: string; close(): void };
}

@Injectable()
export class OpenCodeService implements OnModuleDestroy {
  private readonly logger = new Logger(OpenCodeService.name);
  private readonly model: string;
  private instance: OpenCodeInstance | null = null;
  private initPromise: Promise<OpenCodeInstance> | null = null;

  constructor(private readonly configService: ConfigService) {
    this.model = configService.get<string>('OPENCODE_MODEL') || 'anthropic/claude-opus-4-6';
  }

  private async ensureInstance(): Promise<OpenCodeInstance> {
    if (this.instance) return this.instance;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.createInstance();
    try {
      const instance = await this.initPromise;
      return instance;
    } catch (err) {
      this.initPromise = null;
      throw err;
    }
  }

  private async createInstance(): Promise<OpenCodeInstance> {
    this.logger.log('Starting embedded OpenCode server...');
    const { client, server } = await createOpencode({
      hostname: '127.0.0.1',
      port: 0,
      config: {
        model: this.model,
      },
    });

    this.instance = { client, server };
    this.initPromise = null;
    this.logger.log(`OpenCode server started at ${server.url}`);
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

  async executeSession(params: { workspaceDir: string; systemPrompt: string; userPrompt: string }): Promise<OpenCodeSessionResult> {
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
        parts: [{ type: 'text', text: systemPrompt } as TextPartInput],
      },
    });

    const response = await instance.client.session.prompt({
      path: { id: sessionId },
      body: {
        parts: [{ type: 'text', text: userPrompt } as TextPartInput],
      },
    });

    const textParts = this.extractTextParts(response);

    return { sessionId, textParts };
  }

  async sendFollowUp(params: { sessionId: string; prompt: string }): Promise<string[]> {
    const instance = await this.ensureInstance();

    const response = await instance.client.session.prompt({
      path: { id: params.sessionId },
      body: {
        parts: [{ type: 'text', text: params.prompt } as TextPartInput],
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
        this.instance.server.close();
      } catch (err) {
        this.logger.warn(`OpenCode server shutdown error: ${err instanceof Error ? err.message : 'Unknown'}`);
      }
      this.instance = null;
    }
  }
}
