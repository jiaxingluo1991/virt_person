import { describe, it, expect, vi } from 'vitest'
import { OpenAISTTAdapter } from '../../../src/main/adapters/stt/openai'

vi.stubGlobal('fetch', vi.fn())

describe('OpenAISTTAdapter', () => {
  it('sends audio as form-data and returns transcript', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: 'hello world' })
    } as Response)

    const adapter = new OpenAISTTAdapter({ url: 'http://localhost:9000/v1/audio/transcriptions', model: 'whisper-1' })
    const result = await adapter.transcribe(Buffer.from('fake-audio'))
    expect(result).toBe('hello world')
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:9000/v1/audio/transcriptions',
      expect.objectContaining({ method: 'POST' })
    )
  })
})
