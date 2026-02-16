import type { PerpsErrorBody } from '@lifi/perps-types'
import { PerpsErrorCode } from '@lifi/perps-types'
import { PerpsErrorName } from './constants.js'
import { PerpsError } from './PerpsError.js'

const statusCodeToErrorCode = new Map<number, PerpsErrorCode>([
  [400, PerpsErrorCode.ValidationError],
  [401, PerpsErrorCode.SignatureInvalid],
  [403, PerpsErrorCode.AgentUnauthorized],
  [404, PerpsErrorCode.MarketNotFound],
  [422, PerpsErrorCode.ValidationError],
  [424, PerpsErrorCode.ThirdPartyError],
  [429, PerpsErrorCode.ServerError],
  [500, PerpsErrorCode.ServerError],
  [502, PerpsErrorCode.ServerError],
  [503, PerpsErrorCode.ServerError],
  [504, PerpsErrorCode.TimeoutError],
])

function getErrorCodeFromStatus(status: number): PerpsErrorCode {
  return statusCodeToErrorCode.get(status) ?? PerpsErrorCode.ServerError
}

function createInitialMessage(response: Response): string {
  const statusCode =
    response.status || response.status === 0 ? response.status : ''
  const title = response.statusText || ''
  const status = `${statusCode} ${title}`.trim()
  const reason = status ? `status code ${status}` : 'an unknown error'
  return `Request failed with ${reason}`
}

export class HTTPError extends PerpsError {
  response: Response
  status: number
  url: string
  responseBody?: PerpsErrorBody

  constructor(response: Response, url: string) {
    const code = getErrorCodeFromStatus(response.status)
    const message = createInitialMessage(response)

    super(code, message)

    this.name = PerpsErrorName.HTTPError
    this.response = response
    this.status = response.status
    this.url = url
  }

  async buildAdditionalDetails(): Promise<this> {
    try {
      this.responseBody = (await this.response.json()) as PerpsErrorBody

      if (this.responseBody) {
        // Update code from response body if available
        if (this.responseBody.code) {
          this.code = this.responseBody.code
        }

        // Append server message
        if (this.responseBody.message) {
          this.message = `${this.message}. ${this.responseBody.message}`
        }
      }
    } catch {
      // Response body parsing failed - use defaults
    }

    return this
  }
}
