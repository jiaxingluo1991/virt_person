import { describe, it, expect } from 'vitest'
import { loadConfig } from '../../src/main/config'
import { writeFileSync, unlinkSync } from 'fs'
import { resolve } from 'path'

const TMP = resolve(__dirname, 'tmp-config.json')

describe('loadConfig', () => {
  it('loads valid config', () => {
    const cfg = {
      stt: { type: 'openai_compatible', url: 'http://localhost:9000/v1/audio/transcriptions', model: 'whisper-1' },
      tts: { type: 'custom', url: 'http://localhost:8080/tts', method: 'POST', body_template: { text: '{{text}}' }, response_type: 'audio/wav' },
      llm: { type: 'openai_compatible', url: 'http://localhost:11434/v1/chat/completions', model: 'qwen2.5' },
      vad: { silence_threshold: 0.01, silence_duration_ms: 1500 }
    }
    writeFileSync(TMP, JSON.stringify(cfg))
    const result = loadConfig(TMP)
    expect(result.stt.url).toBe('http://localhost:9000/v1/audio/transcriptions')
    expect(result.vad.silence_threshold).toBe(0.01)
    unlinkSync(TMP)
  })

  it('throws on missing stt config', () => {
    writeFileSync(TMP, JSON.stringify({ tts: {}, llm: {} }))
    expect(() => loadConfig(TMP)).toThrow('stt')
    unlinkSync(TMP)
  })

  it('uses default vad when not provided', () => {
    const cfg = {
      stt: { type: 'openai_compatible', url: 'http://localhost:9000/v1/audio/transcriptions' },
      tts: { type: 'openai_compatible', url: 'http://localhost:8080/tts' },
      llm: { type: 'openai_compatible', url: 'http://localhost:11434/v1/chat/completions' }
    }
    writeFileSync(TMP, JSON.stringify(cfg))
    const result = loadConfig(TMP)
    expect(result.vad.silence_threshold).toBe(0.01)
    expect(result.vad.silence_duration_ms).toBe(1500)
    unlinkSync(TMP)
  })
})
