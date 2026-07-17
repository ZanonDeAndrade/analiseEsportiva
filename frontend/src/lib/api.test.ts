import { afterEach, describe, expect, it, vi } from 'vitest'
import { authenticatedFetchJson, cachedAuthenticatedFetchJson, invalidateApiCache } from './api'

const token = async () => 'test-token'

afterEach(() => { invalidateApiCache(); vi.unstubAllGlobals() })

describe('cliente HTTP tipado', () => {
  it('reutiliza cache dentro do TTL e invalida explicitamente', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ value: 7 }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const first = await cachedAuthenticatedFetchJson<{ value: number }>('unit:key', '/v1/me', token, { ttlMs: 10_000 })
    const second = await cachedAuthenticatedFetchJson<{ value: number }>('unit:key', '/v1/me', token, { ttlMs: 10_000 })
    expect(first.value).toBe(7)
    expect(second).toEqual(first)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    invalidateApiCache('unit:')
    await cachedAuthenticatedFetchJson('unit:key', '/v1/me', token, { ttlMs: 10_000 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('propaga cancelamento sem converter em backend offline', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError')
      return new Response('{}')
    }))
    const controller = new AbortController()
    controller.abort()
    await expect(authenticatedFetchJson('/v1/me', token, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('sinaliza sessao expirada quando a API retorna 401', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ detail: 'Sessao revogada', code: 'session_revoked' }), { status: 401, headers: { 'content-type': 'application/json' } })))
    const listener = vi.fn()
    window.addEventListener('betintel:session-expired', listener)
    await expect(authenticatedFetchJson('/v1/me', token)).rejects.toMatchObject({ status: 401, code: 'session_revoked' })
    expect(listener).toHaveBeenCalledOnce()
    window.removeEventListener('betintel:session-expired', listener)
  })
})
