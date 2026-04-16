import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OpenAILLMAdapter } from '../../../src/main/adapters/llm/openai'

vi.stubGlobal('fetch', vi.fn())

beforeEach(() => { vi.mocked(fetch).mockReset() })

describe('OpenAILLMAdapter', () => {
  it('sends messages and returns reply', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'hi there' } }] })
    } as Response)

    const adapter = new OpenAILLMAdapter({ url: 'http://localhost:11434/v1/chat/completions', model: 'qwen2.5' })
    const result = await adapter.chat([{ role: 'user', content: 'hello' }])
    expect(result).toBe('hi there')
  })

  it('prepends system prompt when configured', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] })
    } as Response)

    const adapter = new OpenAILLMAdapter({ url: 'http://localhost:11434/v1/chat/completions', model: 'qwen2.5', system_prompt: '你是助手' })
    await adapter.chat([{ role: 'user', content: 'hello' }])
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1].body as string)
    expect(body.messages[0]).toEqual({ role: 'system', content: '你是助手' })
  })
})
