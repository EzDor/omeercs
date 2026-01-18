import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Service for managing skill execution workspaces.
 * Each skill execution gets a unique, isolated workspace directory.
 */
@Injectable()
export class WorkspaceService {
  private readonly logger = new Logger(WorkspaceService.name);
  private readonly baseDir: string;

  constructor(private readonly configService: ConfigService) {
    this.baseDir = configService.get<string>('SKILLS_WORKSPACE_DIR') || path.join(os.tmpdir(), 'skill-workspaces');

    // Ensure base directory exists
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
      this.logger.log(`Created workspace base directory: ${this.baseDir}`);
    }
  }

  /**
   * Create a new workspace directory for a skill execution.
   * @param runId Unique run identifier
   * @returns Absolute path to the created workspace directory
   */
  async createWorkspace(runId: string): Promise<string> {
    const workspacePath = this.getWorkspacePath(runId);

    try {
      await fs.promises.mkdir(workspacePath, { recursive: true, mode: 0o755 });
      this.logger.debug(`Created workspace: ${workspacePath}`);
      return workspacePath;
    } catch (error) {
      this.logger.error(`Failed to create workspace for run ${runId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Clean up a workspace directory and all its contents.
   * @param workspaceDir Absolute path to the workspace directory
   */
  async cleanupWorkspace(workspaceDir: string): Promise<void> {
    try {
      // Safety check: only clean directories under our base directory
      const resolvedPath = path.resolve(workspaceDir);
      const resolvedBase = path.resolve(this.baseDir);

      if (!resolvedPath.startsWith(resolvedBase)) {
        this.logger.warn(`Attempted to cleanup directory outside base: ${workspaceDir}`);
        return;
      }

      if (fs.existsSync(workspaceDir)) {
        await fs.promises.rm(workspaceDir, { recursive: true, force: true });
        this.logger.debug(`Cleaned up workspace: ${workspaceDir}`);
      }
    } catch (error) {
      // Log but don't throw - cleanup failures shouldn't break execution flow
      this.logger.warn(`Failed to cleanup workspace ${workspaceDir}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get the workspace path for a given run ID without creating it.
   * @param runId Unique run identifier
   * @returns Absolute path where the workspace would be created
   */
  getWorkspacePath(runId: string): string {
    // Sanitize runId to prevent path traversal
    const sanitizedRunId = runId.replace(/[^a-zA-Z0-9-_]/g, '_');
    return path.join(this.baseDir, `run-${sanitizedRunId}`);
  }

  /**
   * Get the base directory for all workspaces.
   */
  getBaseDir(): string {
    return this.baseDir;
  }
}
