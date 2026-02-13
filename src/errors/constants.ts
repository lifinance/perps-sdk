export enum PerpsErrorName {
  PerpsError = 'PerpsError',
  HTTPError = 'HTTPError',
  ValidationError = 'ValidationError',
  ServerError = 'ServerError',
  ConfigError = 'ConfigError',
  AgentError = 'AgentError',
}

export enum PerpsErrorMessage {
  UnknownError = 'Unknown error occurred.',
  ConfigNotInitialized = 'SDK not configured. Call createPerpsConfig() first.',
  AgentNotFound = 'Agent not found. Call setSigningMode() first.',
  InvalidSigningMode = 'Invalid signing mode for this operation.',
}
