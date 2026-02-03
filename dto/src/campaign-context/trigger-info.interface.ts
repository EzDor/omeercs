export type TriggerType = 'manual' | 'scheduled' | 'api';

export interface TriggerInfo {
  type: TriggerType;
  payload?: Record<string, unknown>;
  timestamp: string;
  initiatedBy?: string;
}
