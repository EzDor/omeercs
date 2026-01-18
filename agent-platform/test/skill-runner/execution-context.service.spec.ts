import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ExecutionContextService } from '../../src/skills/skill-runner/services/execution-context.service';
import { SecretsService } from '../../src/skills/skill-runner/services/secrets.service';
import { WorkspaceService } from '../../src/skills/skill-runner/services/workspace.service';
import { SkillDescriptor } from '@agentic-template/dto/src/skills';
import { TenantClsService } from '@agentic-template/common/src/tenant/tenant-cls.service';

describe('ExecutionContextService', () => {
  let service: ExecutionContextService;
  let secretsService: jest.Mocked<SecretsService>;
  let tenantClsService: jest.Mocked<TenantClsService>;

  const mockDescriptor: SkillDescriptor = {
    skill_id: 'test_skill',
    version: '1.0.0',
    title: 'Test Skill',
    description: 'A test skill',
    tags: ['test'],
    input_schema: { type: 'object' },
    output_schema: { type: 'object' },
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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExecutionContextService,
        {
          provide: SecretsService,
          useValue: {
            createAccessor: jest.fn().mockReturnValue({
              get: jest.fn(),
              has: jest.fn(),
              keys: jest.fn().mockReturnValue([]),
            }),
          },
        },
        {
          provide: WorkspaceService,
          useValue: {
            createWorkspace: jest.fn().mockResolvedValue('/tmp/workspace-test'),
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
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'SKILLS_OUTPUT_DIR') return '/tmp/artifacts';
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<ExecutionContextService>(ExecutionContextService);
    secretsService = module.get(SecretsService);
    tenantClsService = module.get(TenantClsService);
  });

  describe('createContext', () => {
    it('should create context with unique runId', () => {
      const context = service.createContext(mockDescriptor, '/tmp/workspace');

      expect(context.runId).toBeDefined();
      expect(context.runId).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('should include tenantId from CLS', () => {
      const context = service.createContext(mockDescriptor, '/tmp/workspace');

      expect(context.tenantId).toBe('test-tenant');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(tenantClsService.getTenantId).toHaveBeenCalled();
    });

    it('should include skillId from descriptor', () => {
      const context = service.createContext(mockDescriptor, '/tmp/workspace');

      expect(context.skillId).toBe('test_skill');
    });

    it('should include workspaceDir', () => {
      const context = service.createContext(mockDescriptor, '/tmp/workspace-custom');

      expect(context.workspaceDir).toBe('/tmp/workspace-custom');
    });

    it('should create scoped logger', () => {
      const context = service.createContext(mockDescriptor, '/tmp/workspace');

      expect(context.logger).toBeDefined();
    });

    it('should include secrets accessor', () => {
      const context = service.createContext(mockDescriptor, '/tmp/workspace');

      expect(context.secrets).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(secretsService.createAccessor).toHaveBeenCalled();
    });

    it('should include policy from descriptor', () => {
      const context = service.createContext(mockDescriptor, '/tmp/workspace');

      expect(context.policy).toBeDefined();
      expect(context.policy.timeout_ms).toBe(60000); // 60 * 1000
    });

    it('should include artifactBaseUri', () => {
      const context = service.createContext(mockDescriptor, '/tmp/workspace');

      expect(context.artifactBaseUri).toBeDefined();
      expect(context.artifactBaseUri).toContain(context.runId);
    });

    it('should include AbortSignal when provided', () => {
      const controller = new AbortController();
      const context = service.createContext(mockDescriptor, '/tmp/workspace', controller.signal);

      expect(context.signal).toBe(controller.signal);
    });

    it('should use default policy values when descriptor policy is missing fields', () => {
      const descriptorWithoutPolicy = {
        ...mockDescriptor,
        policy: undefined,
      } as unknown as SkillDescriptor;

      const context = service.createContext(descriptorWithoutPolicy, '/tmp/workspace');

      expect(context.policy.timeout_ms).toBe(60000); // default
    });
  });

  describe('execution ID', () => {
    it('should create unique execution IDs for each call', () => {
      const context1 = service.createContext(mockDescriptor, '/tmp/workspace1');
      const context2 = service.createContext(mockDescriptor, '/tmp/workspace2');

      expect(context1.runId).not.toBe(context2.runId);
      expect(context1.executionId).not.toBe(context2.executionId);
    });
  });
});
