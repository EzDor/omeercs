export type TriggerType = 'manual' | 'scheduled' | 'api' | 'continuation';

export interface TriggerInfo {
  type: TriggerType;
  payload?: Record<string, unknown>;
  timestamp: string;
  initiatedBy?: string;
}
