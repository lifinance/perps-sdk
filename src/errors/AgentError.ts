import { PerpsErrorCode } from '@lifi/perps-types'
import { version } from '../version.js'
import { PerpsErrorName } from './constants.js'
import { PerpsError } from './PerpsError.js'

/**
 * Error thrown when agent-related operations fail (agent not found, authorization issues, etc.)
 */
export class AgentError extends PerpsError {
  override name = PerpsErrorName.AgentError

  constructor(message: string, code = PerpsErrorCode.AgentUnauthorized) {
    super(code, message)
    this.name = PerpsErrorName.AgentError

    // Override message format
    this.message = `[${PerpsErrorName.AgentError}] ${message}\nLI.FI Perps SDK version: ${version}`
  }

  /**
   * Create an AgentError for a missing agent.
   *
   * @param address - The user address
   * @param dex - The DEX identifier
   */
  static notFound(address: string, dex: string): AgentError {
    return new AgentError(
      `Agent not found for ${address} on ${dex}. Call setSigningMode() first.`
    )
  }

  /**
   * Create an AgentError for an unauthorized agent.
   *
   * @param address - The agent address
   * @param dex - The DEX identifier
   */
  static unauthorized(address: string, dex: string): AgentError {
    return new AgentError(
      `Agent ${address} is not authorized on ${dex}. Submit authorization first.`
    )
  }
}
