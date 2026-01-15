import { SensitiveDataPatternInterface } from './sensitive-data-pattern.interface';

export interface TracingConfigurationInterface {
  enabled: boolean;
  projectName: string;
  apiKey: string;
  endpoint: string;
  backgroundCallbacks: boolean;
  maskedFieldPatterns: SensitiveDataPatternInterface[];
}
