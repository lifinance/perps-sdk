import { HttpResponse, http } from 'msw'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { mockMeta, server } from '../../test/handlers.js'
import {
  createPerpsClient,
  DEFAULT_API_URL,
} from '../client/createPerpsClient.js'
import type {
  Meta,
  Notice,
  NoticeAffectedComponent,
  NoticeKind,
  NoticeSeverity,
  NoticeSource,
  NoticeStatus,
} from '../index.js'
import { getMeta } from './getMeta.js'

const legacyNotice: Notice = {
  timestamp: 1735689600000,
  title: 'Scheduled maintenance',
  message: 'Trading paused 02:00–03:00 UTC for an upgrade.',
  link: 'https://status.li.fi/maintenance',
}

const providerMaintenanceNotice: Notice = {
  timestamp: 1767225600000,
  title: 'Hyperliquid scheduled maintenance',
  message: 'Hyperliquid order entry pauses during the network upgrade.',
  link: 'https://hyperliquid.statuspage.io/incidents/abc123',
  id: 'notice-42',
  revision: 'r3',
  providerKeys: ['hyperliquid'],
  kind: 'maintenance',
  status: 'upcoming',
  severity: 'warning',
  validFrom: 1767225600000,
  validTo: 1767398400000,
  startsAt: 1767312000000,
  endsAt: 1767319200000,
  affectedComponents: [
    { id: 'cmp-api', name: 'API', status: 'under_maintenance' },
    { id: 'cmp-ws', name: 'WebSocket' },
  ],
  source: {
    eventId: 'abc123',
    url: 'https://hyperliquid.statuspage.io/incidents/abc123',
  },
  sourceUpdatedAt: 1767225000000,
  lastCheckedAt: 1767225500000,
  sourceStale: false,
}

describe('getMeta', () => {
  const client = createPerpsClient({
    integrator: 'test-app',
    apiKey: 'test-key',
  })

  it('should return platform version and notices', async () => {
    const result = await getMeta(client)

    expect(result).toEqual(mockMeta)
    expect(result.version).toBe('1.4.2')
    expect(result.notices).toHaveLength(2)
  })

  it('should return notices with and without a link', async () => {
    const result = await getMeta(client)

    expect(result.notices[0].link).toBe('https://status.li.fi/maintenance')
    expect(result.notices[1].link).toBeUndefined()
  })

  it('returns global and provider-scoped notices as served, without visibility filtering', async () => {
    const expiredNotice: Notice = {
      ...providerMaintenanceNotice,
      id: 'notice-7',
      status: 'resolved',
      resolvedAt: 1735700000000,
      validTo: 1735786400000,
    }
    const served: Meta = {
      version: '1.5.0',
      notices: [legacyNotice, providerMaintenanceNotice, expiredNotice],
    }
    server.use(
      http.get(`${DEFAULT_API_URL}/meta`, () => HttpResponse.json(served))
    )

    const result = await getMeta(client)

    expect(result).toEqual(served)
  })

  it('should support AbortSignal', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      getMeta(client, { signal: controller.signal })
    ).rejects.toThrow()
  })
})

describe('Notice contract', () => {
  it('keeps every extension optional, so a legacy notice stays assignable', () => {
    expectTypeOf<Meta>().toEqualTypeOf<{
      version: string
      notices: Notice[]
    }>()
    expectTypeOf(getMeta).returns.resolves.toEqualTypeOf<Meta>()
    expectTypeOf(legacyNotice).toEqualTypeOf<Notice>()
    expectTypeOf<
      Pick<Notice, 'timestamp' | 'title' | 'message' | 'link'>
    >().toEqualTypeOf<{
      timestamp: number
      title: string
      message: string
      link?: string
    }>()
    expectTypeOf<
      Omit<Notice, 'timestamp' | 'title' | 'message'>
    >().toEqualTypeOf<
      Partial<Omit<Notice, 'timestamp' | 'title' | 'message'>>
    >()
  })

  it('types provider scope, lifecycle, times, and source context', () => {
    expectTypeOf(providerMaintenanceNotice).toEqualTypeOf<Notice>()
    expectTypeOf<Notice['providerKeys']>().toEqualTypeOf<string[] | undefined>()
    expectTypeOf<NoticeKind>().toEqualTypeOf<
      'info' | 'maintenance' | 'incident'
    >()
    expectTypeOf<NoticeStatus>().toEqualTypeOf<
      'upcoming' | 'active' | 'resolved'
    >()
    expectTypeOf<NoticeSeverity>().toEqualTypeOf<
      'info' | 'warning' | 'critical'
    >()
    expectTypeOf<
      Notice[
        | 'validFrom'
        | 'validTo'
        | 'startsAt'
        | 'endsAt'
        | 'resolvedAt'
        | 'sourceUpdatedAt'
        | 'lastCheckedAt']
    >().toEqualTypeOf<number | undefined>()
    expectTypeOf<NoticeAffectedComponent>().toEqualTypeOf<{
      id: string
      name: string
      status?: string
    }>()
    expectTypeOf<NoticeSource>().toEqualTypeOf<{
      eventId: string
      url: string
    }>()
  })
})
