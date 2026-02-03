import { RunContext } from './run-context.interface';

export type CompiledInputSelector = (ctx: RunContext) => Record<string, unknown>;

export interface CompiledSelectorField {
  key: string;
  resolve: (ctx: RunContext) => unknown;
}
