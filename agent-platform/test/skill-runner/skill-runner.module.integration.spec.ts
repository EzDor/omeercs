import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { Global, Module } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GenerationJob } from '@agentic-template/dao/src/entities/generation-job.entity';
import { SkillRunnerModule } from '../../src/skills/skill-runner/skill-runner.module';
import { SkillRunnerService } from '../../src/skills/skill-runner/skill-runner.service';
import { TenantClsService } from '@agentic-template/common/src/tenant/tenant-cls.service';
import { ImageProviderRegistry } from '@agentic-template/common/src/providers/registries/image-provider.registry';
import { AudioProviderRegistry } from '@agentic-template/common/src/providers/registries/audio-provider.registry';

const mockTenantClsService = {
  getTenantId: jest.fn().mockReturnValue('test-tenant'),
  setTenantId: jest.fn(),
  getUserId: jest.fn().mockReturnValue('test-user'),
  setUserId: jest.fn(),
  getEntityManager: jest.fn(),
  setEntityManager: jest.fn(),
  get: jest.fn(),
};

const mockRepository = {
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  findOneBy: jest.fn().mockResolvedValue(null),
  findOneByOrFail: jest.fn().mockResolvedValue({}),
  save: jest.fn(),
  create: jest.fn(),
  manager: {
    connection: {
      createQueryRunner: jest.fn().mockReturnValue({
        connect: jest.fn(),
        startTransaction: jest.fn(),
        commitTransaction: jest.fn(),
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
        manager: { getRepository: jest.fn().mockReturnValue({ find: jest.fn().mockResolvedValue([]) }), save: jest.fn() },
      }),
    },
  },
};

@Global()
@Module({
  providers: [{ provide: TenantClsService, useValue: mockTenantClsService }],
  exports: [TenantClsService],
})
class MockTenantClsModule {}

describe('SkillRunnerModule - Integration', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              LITELLM_BASE_URL: 'http://localhost:4000',
              LITELLM_API_KEY: 'test-api-key',
              LITELLM_MODEL: 'test-model',
              SKILLS_CATALOG_PATH: '/tmp/skills',
            }),
          ],
        }),
        MockTenantClsModule,
        SkillRunnerModule,
      ],
    })
      .overrideProvider(getRepositoryToken(GenerationJob))
      .useValue(mockRepository)
      .compile();
  });

  afterEach(async () => {
    await module.close();
  });

  it('should initialize with ProvidersModule dependencies', () => {
    expect(module.get(SkillRunnerService)).toBeDefined();
    expect(module.get(ImageProviderRegistry)).toBeDefined();
    expect(module.get(AudioProviderRegistry)).toBeDefined();
  });

  it('should have ImageProviderRegistry properly initialized', () => {
    const registry = module.get(ImageProviderRegistry);
    expect(registry.getDefaultProviderId()).toBeDefined();
  });

  it('should have AudioProviderRegistry properly initialized', () => {
    const registry = module.get(AudioProviderRegistry);
    expect(registry.getDefaultProviderId()).toBeDefined();
  });
});
