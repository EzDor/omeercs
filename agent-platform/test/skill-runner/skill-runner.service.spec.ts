import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { SkillRunnerService } from '../../src/skills/skill-runner/skill-runner.service';
import { SkillCatalogService } from '../../src/skills/services/skill-catalog.service';
import { ExecutionContextService } from '../../src/skills/skill-runner/services/execution-context.service';
import { WorkspaceService } from '../../src/skills/skill-runner/services/workspace.service';
import { SchemaValidatorService } from '../../src/skills/skill-runner/services/schema-validator.service';
import { LlmGenerationService } from '../../src/skills/skill-runner/services/llm-generation.service';
import { SkillDescriptor } from '@agentic-template/dto/src/skills/skill-descriptor.interface';
import { EnhancedSkillExecutionContext } from '../../src/skills/skill-runner/interfaces/execution-context.interface';
import { SkillHandler } from '../../src/skills/interfaces/skill-handler.interface';
import { TenantClsService } from '@agentic-template/common/src/tenant/tenant-cls.service';

describe('SkillRunnerService', () => {
  let service: SkillRunnerService;
  let catalogService: jest.Mocked<SkillCatalogService>;
  let contextService: jest.Mocked<ExecutionContextService>;
  let workspaceService: jest.Mocked<WorkspaceService>;
  let schemaValidatorService: jest.Mocked<SchemaValidatorService>;

  const mockDescriptor: SkillDescriptor = {
    skill_id: 'test_skill',
    version: '1.0.0',
    title: 'Test Skill',
    description: 'A test skill',
    tags: ['test'],
    input_schema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string' },
      },
    },
    output_schema: {
      type: 'object',
      required: ['result'],
      properties: {
        result: { type: 'string' },
      },
    },
    implementation: {
      type: 'ts_function',
      handler: 'handlers/test.handler',
    },
    produces_artifacts: [],
    policy: {
      max_runtime_sec: 60,
      network: 'none',
    },
    observability: {
      log_level_default: 'info',
      emit_metrics: true,
    },
  };

  const mockContext: EnhancedSkillExecutionContext = {
    tenantId: 'test-tenant',
    executionId: 'exec-123',
    skillId: 'test_skill',
    runId: 'run-456',
    workspaceDir: '/tmp/workspace',
    artifactBaseUri: 'file:///tmp/artifacts/',
    logger: new Logger('TestSkill'),
    secrets: {
      get: jest.fn(),
      has: jest.fn(),
      keys: jest.fn().mockReturnValue([]),
    },
    policy: {
      timeout_ms: 60000,
    },
  };

  const mockHandler: SkillHandler = {
    execute: jest.fn().mockResolvedValue({
      ok: true,
      data: { result: 'success' },
      artifacts: [],
      debug: {
        run_id: 'run-456',
        skill_id: 'test_skill',
        version: '1.0.0',
        duration_ms: 100,
        timing: {
          input_validation_ms: 10,
          execution_ms: 80,
          output_validation_ms: 10,
          artifact_registration_ms: 0,
        },
      },
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SkillRunnerService,
        {
          provide: SkillCatalogService,
          useValue: {
            getSkill: jest.fn(),
            getHandler: jest.fn(),
            hasSkill: jest.fn(),
          },
        },
        {
          provide: ExecutionContextService,
          useValue: {
            createContext: jest.fn(),
          },
        },
        {
          provide: WorkspaceService,
          useValue: {
            createWorkspace: jest.fn(),
            cleanupWorkspace: jest.fn(),
          },
        },
        {
          provide: SchemaValidatorService,
          useValue: {
            validateInput: jest.fn(),
            validateOutput: jest.fn(),
          },
        },
        {
          provide: TenantClsService,
          useValue: {
            getTenantId: jest.fn().mockReturnValue('test-tenant'),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: LlmGenerationService,
          useValue: {
            generate: jest.fn().mockResolvedValue({
              success: true,
              data: {},
              attempts: 1,
              timings_ms: { total: 100 },
            }),
          },
        },
      ],
    }).compile();

    service = module.get<SkillRunnerService>(SkillRunnerService);
    catalogService = module.get(SkillCatalogService);
    contextService = module.get(ExecutionContextService);
    workspaceService = module.get(WorkspaceService);
    schemaValidatorService = module.get(SchemaValidatorService);
  });

  describe('execute', () => {
    it('should execute a skill successfully', async () => {
      catalogService.getSkill.mockReturnValue(mockDescriptor);
      catalogService.getHandler.mockReturnValue(mockHandler);
      contextService.createContext.mockReturnValue(mockContext);
      workspaceService.createWorkspace.mockResolvedValue('/tmp/workspace');
      schemaValidatorService.validateInput.mockReturnValue({ valid: true, errors: [] });
      schemaValidatorService.validateOutput.mockReturnValue({ valid: true, errors: [] });

      const result = await service.execute('test_skill', { name: 'test' });

      expect(result.ok).toBe(true);
      expect(result.data).toEqual({ result: 'success' });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(catalogService.getSkill).toHaveBeenCalledWith('test_skill', undefined);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(workspaceService.cleanupWorkspace).toHaveBeenCalled();
    });

    it('should return error when skill not found', async () => {
      catalogService.getSkill.mockReturnValue(undefined);

      const result = await service.execute('non_existent_skill', { name: 'test' });

      expect(result.ok).toBe(false);
      expect(result.error_code).toBe('SKILL_NOT_FOUND');
    });

    it('should return error when handler not found', async () => {
      catalogService.getSkill.mockReturnValue(mockDescriptor);
      catalogService.getHandler.mockReturnValue(undefined);

      const result = await service.execute('test_skill', { name: 'test' });

      expect(result.ok).toBe(false);
      expect(result.error_code).toBe('HANDLER_NOT_FOUND');
    });

    it('should execute specific version when requested', async () => {
      catalogService.getSkill.mockReturnValue(mockDescriptor);
      catalogService.getHandler.mockReturnValue(mockHandler);
      contextService.createContext.mockReturnValue(mockContext);
      workspaceService.createWorkspace.mockResolvedValue('/tmp/workspace');
      schemaValidatorService.validateInput.mockReturnValue({ valid: true, errors: [] });
      schemaValidatorService.validateOutput.mockReturnValue({ valid: true, errors: [] });

      await service.execute('test_skill', { name: 'test' }, { version: '1.0.0' });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(catalogService.getSkill).toHaveBeenCalledWith('test_skill', '1.0.0');
    });

    it('should cleanup workspace even on failure', async () => {
      catalogService.getSkill.mockReturnValue(mockDescriptor);
      catalogService.getHandler.mockReturnValue({
        execute: jest.fn().mockRejectedValue(new Error('Handler error')),
      });
      contextService.createContext.mockReturnValue(mockContext);
      workspaceService.createWorkspace.mockResolvedValue('/tmp/workspace');
      schemaValidatorService.validateInput.mockReturnValue({ valid: true, errors: [] });

      await service.execute('test_skill', { name: 'test' });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(workspaceService.cleanupWorkspace).toHaveBeenCalled();
    });

    it('should include timing info in result debug info', async () => {
      catalogService.getSkill.mockReturnValue(mockDescriptor);
      catalogService.getHandler.mockReturnValue(mockHandler);
      contextService.createContext.mockReturnValue(mockContext);
      workspaceService.createWorkspace.mockResolvedValue('/tmp/workspace');
      schemaValidatorService.validateInput.mockReturnValue({ valid: true, errors: [] });
      schemaValidatorService.validateOutput.mockReturnValue({ valid: true, errors: [] });

      const result = await service.execute('test_skill', { name: 'test' });

      expect(result.debug).toBeDefined();
      expect(result.debug.timings_ms).toBeDefined();
      expect(result.debug.timings_ms.total).toBeGreaterThanOrEqual(0);
    });
  });

  describe('timeout handling', () => {
    it('should timeout slow skill execution', async () => {
      const slowHandler: SkillHandler = {
        execute: jest.fn().mockImplementation(
          () =>
            new Promise((resolve) => {
              setTimeout(
                () =>
                  resolve({
                    ok: true,
                    data: { result: 'slow' },
                    artifacts: [],
                    debug: { run_id: 'run-456', skill_id: 'test_skill', version: '1.0.0', duration_ms: 5000, timing: {} },
                  }),
                5000,
              );
            }),
        ),
      };

      const shortTimeoutDescriptor = {
        ...mockDescriptor,
        policy: { ...mockDescriptor.policy, max_runtime_sec: 0.1 }, // 100ms timeout
      };

      // Create a context with the short timeout
      const shortTimeoutContext = {
        ...mockContext,
        policy: {
          ...mockContext.policy,
          timeout_ms: 100, // 100ms to match the descriptor
        },
      };

      catalogService.getSkill.mockReturnValue(shortTimeoutDescriptor);
      catalogService.getHandler.mockReturnValue(slowHandler);
      contextService.createContext.mockReturnValue(shortTimeoutContext);
      workspaceService.createWorkspace.mockResolvedValue('/tmp/workspace');
      schemaValidatorService.validateInput.mockReturnValue({ valid: true, errors: [] });

      const result = await service.execute('test_skill', { name: 'test' });

      expect(result.ok).toBe(false);
      expect(result.error_code).toBe('TIMEOUT');
    }, 10000);
  });
});
