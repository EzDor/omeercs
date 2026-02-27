import { Injectable } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';

const SAFE_CODE_FILENAME = /^[a-zA-Z0-9_-]+\.js$/;

const DANGEROUS_PATTERNS: RegExp[] = [
  /\beval\s*\(/,
  /\bnew\s+Function\s*\(/,
  /\brequire\s*\(/,
  /\bimport\s*\(\s*['"][^.]/,
  /\bprocess\b/,
  /\b__dirname\b/,
  /\b__filename\b/,
  /\bchild_process\b/,
  /\bfs\.\b/,
  /\bexecSync\b/,
  /\bexecFile\b/,
  /\bspawnSync\b/,
];

export interface CodeSafetyViolation {
  filename: string;
  pattern: string;
}

@Injectable()
export class CodeSafetyService {
  validateFilename(filename: string): boolean {
    return SAFE_CODE_FILENAME.test(filename);
  }

  validateContent(filename: string, content: string): CodeSafetyViolation[] {
    const violations: CodeSafetyViolation[] = [];
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(content)) {
        violations.push({ filename, pattern: pattern.source });
      }
    }
    return violations;
  }

  validatePathBounds(filePath: string, workspaceDir: string): boolean {
    const resolved = path.resolve(filePath);
    const resolvedWorkspace = path.resolve(workspaceDir);
    return resolved.startsWith(resolvedWorkspace + path.sep) || resolved === resolvedWorkspace;
  }

  validateWorkspaceFiles(workspaceDir: string, subdir: string): { valid: boolean; violations: CodeSafetyViolation[]; invalidFilenames: string[] } {
    const targetDir = path.join(workspaceDir, subdir);
    if (!fs.existsSync(targetDir)) {
      return { valid: true, violations: [], invalidFilenames: [] };
    }

    const violations: CodeSafetyViolation[] = [];
    const invalidFilenames: string[] = [];

    const entries = fs.readdirSync(targetDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith('.js')) continue;

      if (!this.validateFilename(entry.name)) {
        invalidFilenames.push(entry.name);
        continue;
      }

      const filePath = path.join(targetDir, entry.name);
      if (!this.validatePathBounds(filePath, workspaceDir)) {
        invalidFilenames.push(entry.name);
        continue;
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      violations.push(...this.validateContent(entry.name, content));
    }

    return {
      valid: violations.length === 0 && invalidFilenames.length === 0,
      violations,
      invalidFilenames,
    };
  }
}
