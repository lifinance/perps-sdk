import { PerpsErrorCode } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { AgentError } from './AgentError.js'
import { PerpsError } from './PerpsError.js'
import { PerpsSDKError } from './PerpsSDKError.js'
import { ServerError } from './ServerError.js'
import {
  findErrorType,
  getErrorChain,
  getRootCause,
  getRootCauseMessage,
  hasErrorType,
} from './utils/rootCause.js'
import { ValidationError } from './ValidationError.js'

describe('ValidationError', () => {
  it('should create with message', () => {
    const error = new ValidationError('Invalid input')

    expect(error.name).toBe('ValidationError')
    expect(error.code).toBe(PerpsErrorCode.ValidationError)
    expect(error.message).toContain('Invalid input')
    expect(error.message).toContain('SDK version')
  })

  it('should create for field validation', () => {
    const error = ValidationError.field('dex', 'must be a string')

    expect(error.message).toContain('Invalid dex')
    expect(error.message).toContain('must be a string')
  })

  it('should create for required field', () => {
    const error = ValidationError.required('integrator')

    expect(error.message).toContain('integrator is required')
  })
})

describe('AgentError', () => {
  it('should create with message', () => {
    const error = new AgentError('Agent operation failed')

    expect(error.name).toBe('AgentError')
    expect(error.code).toBe(PerpsErrorCode.AgentUnauthorized)
    expect(error.message).toContain('Agent operation failed')
  })

  it('should create for not found', () => {
    const error = AgentError.notFound('0x1234', 'hyperliquid')

    expect(error.message).toContain('Agent not found')
    expect(error.message).toContain('0x1234')
    expect(error.message).toContain('hyperliquid')
  })

  it('should create for unauthorized', () => {
    const error = AgentError.unauthorized('0x1234', 'hyperliquid')

    expect(error.message).toContain('not authorized')
  })
})

describe('ServerError', () => {
  it('should create with message', () => {
    const error = new ServerError('Server unavailable')

    expect(error.name).toBe('ServerError')
    expect(error.code).toBe(PerpsErrorCode.ServerError)
  })

  it('should create for network error', () => {
    const cause = new Error('ECONNREFUSED')
    const error = ServerError.networkError(cause)

    expect(error.message).toContain('ECONNREFUSED')
  })

  it('should create for timeout', () => {
    const error = ServerError.timeout('Request')

    expect(error.message).toContain('Request')
    expect(error.message).toContain('timed out')
    expect(error.code).toBe(PerpsErrorCode.TimeoutError)
  })
})

describe('PerpsSDKError', () => {
  it('should wrap PerpsError', () => {
    const inner = new PerpsError(PerpsErrorCode.ValidationError, 'Bad input')
    const error = new PerpsSDKError(inner)

    expect(error.name).toBe('PerpsSDKError')
    expect(error.code).toBe(PerpsErrorCode.ValidationError)
    expect(error.cause).toBe(inner)
    expect(error.message).toContain('Bad input')
    expect(error.message).toContain('SDK version')
  })

  it('should preserve stack trace', () => {
    const inner = new ValidationError('Test error')
    const error = new PerpsSDKError(inner)

    expect(error.stack).toContain('Caused by')
  })

  it('should wrap any error via static method', () => {
    const inner = new Error('Unknown error')
    const error = PerpsSDKError.wrap(inner)

    expect(error).toBeInstanceOf(PerpsSDKError)
    expect(error.code).toBe(PerpsErrorCode.DefaultError)
  })

  it('should wrap non-Error values', () => {
    const error = PerpsSDKError.wrap('string error')

    expect(error).toBeInstanceOf(PerpsSDKError)
    expect(error.message).toContain('string error')
  })

  it('should return same PerpsSDKError when wrapping', () => {
    const original = new PerpsSDKError(new Error('test'))
    const wrapped = PerpsSDKError.wrap(original)

    expect(wrapped).toBe(original)
  })
})

describe('Root Cause Utilities', () => {
  it('getRootCause should find root cause', () => {
    const root = new Error('Root')
    const middle = new Error('Middle', { cause: root })
    const outer = new PerpsSDKError(middle)

    expect(getRootCause(outer)).toBe(root)
  })

  it('getRootCause should return same error if no cause', () => {
    const error = new Error('Single')

    expect(getRootCause(error)).toBe(error)
  })

  it('getRootCauseMessage should get root message', () => {
    const root = new Error('Root message')
    const outer = new PerpsSDKError(root)

    expect(getRootCauseMessage(outer)).toBe('Root message')
  })

  it('getErrorChain should return full chain', () => {
    const root = new Error('Root')
    const middle = new Error('Middle', { cause: root })
    const outer = new PerpsSDKError(middle)

    const chain = getErrorChain(outer)

    expect(chain).toHaveLength(3)
    expect(chain[0]).toBe(outer)
    expect(chain[1]).toBe(middle)
    expect(chain[2]).toBe(root)
  })

  it('hasErrorType should find error type in chain', () => {
    const validation = new ValidationError('Bad input')
    const outer = new PerpsSDKError(validation)

    expect(hasErrorType(outer, ValidationError)).toBe(true)
    expect(hasErrorType(outer, AgentError)).toBe(false)
  })

  it('findErrorType should return first matching error', () => {
    const validation = new ValidationError('Bad input')
    const outer = new PerpsSDKError(validation)

    const found = findErrorType(outer, ValidationError)

    expect(found).toBe(validation)
  })

  it('findErrorType should return undefined if not found', () => {
    const error = new PerpsSDKError(new Error('test'))

    const found = findErrorType(error, AgentError)

    expect(found).toBeUndefined()
  })
})
