import { afterEach, describe, expect, it, vi } from 'vitest'
import { wsLog } from './wsLog.js'

describe('wsLog', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('parseFailure', () => {
    it('warns with the provider key and the raw payload', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      wsLog.parseFailure('hyperliquid', 'not json')

      expect(warn).toHaveBeenCalledOnce()
      const [message, payload] = warn.mock.calls[0]
      expect(message).toContain('hyperliquid')
      expect(payload).toBe('not json')
    })

    it('truncates an oversized payload and notes the original length', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const raw = 'x'.repeat(1000)

      wsLog.parseFailure('lighter', raw)

      const payload = warn.mock.calls[0][1] as string
      expect(payload.length).toBeLessThan(raw.length)
      expect(payload).toContain('1000 chars')
    })
  })

  describe('handlerFailure', () => {
    it('logs the error at error level with the provider key', () => {
      const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
      const err = new Error('mapper blew up')

      wsLog.handlerFailure('lighter', err)

      expect(errorLog).toHaveBeenCalledOnce()
      const [message, logged] = errorLog.mock.calls[0]
      expect(message).toContain('lighter')
      expect(logged).toBe(err)
    })
  })

  describe('subscribeFailure', () => {
    it('logs the error at error level with the provider key and channel', () => {
      const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
      const err = new Error('RO token revoked')

      wsLog.subscribeFailure('lighter', 'account_all_orders/42', err)

      expect(errorLog).toHaveBeenCalledOnce()
      const [message, logged] = errorLog.mock.calls[0]
      expect(message).toContain('lighter')
      expect(message).toContain('account_all_orders/42')
      expect(logged).toBe(err)
    })
  })
})
