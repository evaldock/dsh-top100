/** Only these codes may cross from child processes into durable operational reports. */
export type OperationErrorCode = 'github-auth-required' | 'collect-timeout' | 'publish-timeout' | 'discovery-timeout';
export class OperationError extends Error {
  constructor(public readonly code: OperationErrorCode) { super(code); }
}
