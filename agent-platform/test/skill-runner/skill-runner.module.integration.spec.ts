import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { SkillRunnerModule } from '../../src/skills/skill-runner/skill-runner.module';
import { SkillRunnerService } from '../../src/skills/skill-runner/skill-runner.service';
import { ImageProviderRegistry } from '@agentic-template/common/src/providers/registries/image-provider.registry';
import { AudioProviderRegistry } from '@agentic-template/common/src/providers/registries/audio-provider.registry';

describe('SkillRunnerModule - Integration', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), SkillRunnerModule],
    }).compile();
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
