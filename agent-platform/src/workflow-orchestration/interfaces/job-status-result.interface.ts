export interface JobStatusResult {
  jobId: string | undefined;
  state: string;
  progress: number | object;
  data: unknown;
  returnvalue: unknown;
  failedReason: string | undefined;
}
