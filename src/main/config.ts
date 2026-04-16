import { readFileSync } from 'fs'

export interface STTConfig {
  type: 'openai_compatible' | 'custom'
  url: string
  model?: string
  method?: string
  body_template?: Record<string, unknown>
  response_type?: string
}

export interface TTSConfig {
  type: 'openai_compatible' | 'custom'
  url: string
  model?: string
  method?: string
  body_template?: Record<string, unknown>
  response_type?: string
}

export interface LLMConfig {
  type: 'openai_compatible' | 'custom'
  url: string
  model?: string
  system_prompt?: string
  method?: string
  body_template?: Record<string, unknown>
}

export interface VADConfig {
  silence_threshold: number
  silence_duration_ms: number
}

export interface AppConfig {
  stt: STTConfig
  tts: TTSConfig
  llm: LLMConfig
  vad: VADConfig
}

export function loadConfig(path: string): AppConfig {
  const raw = JSON.parse(readFileSync(path, 'utf-8'))
  if (!raw.stt) throw new Error('Missing stt config')
  if (!raw.tts) throw new Error('Missing tts config')
  if (!raw.llm) throw new Error('Missing llm config')
  return {
    stt: raw.stt,
    tts: raw.tts,
    llm: raw.llm,
    vad: raw.vad ?? { silence_threshold: 0.01, silence_duration_ms: 1500 }
  }
}
