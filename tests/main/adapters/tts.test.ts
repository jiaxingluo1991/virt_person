import { describe, it, expect, vi } from 'vitest'
import { OpenAITTSAdapter } from '../../../src/main/adapters/tts/openai'

vi.stubGlobal('fetch', vi.fn())

describe('OpenAITTSAdapter', () => {
  it('sends text and returns audio buffer', async () => {
    const fakeAudio = Buffer.from('fake-wav')
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => fakeAudio.buffer
    } as unknown as Response)

    const adapter = new OpenAITTSAdapter({ url: 'http://localhost:8080/v1/audio/speech', model: 'tts-1' })
    const result = await adapter.synthesize('hello')
    expect(result).toBeInstanceOf(Buffer)
    expect(result.length).toBeGreaterThan(0)
  })
})
