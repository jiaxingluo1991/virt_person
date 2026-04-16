import { AppConfig } from '../config'
import { STTAdapter } from './stt/base'
import { TTSAdapter } from './tts/base'
import { LLMAdapter } from './llm/base'
import { OpenAISTTAdapter } from './stt/openai'
import { CustomSTTAdapter } from './stt/custom'
import { OpenAITTSAdapter } from './tts/openai'
import { CustomTTSAdapter } from './tts/custom'
import { OpenAILLMAdapter } from './llm/openai'
import { CustomLLMAdapter } from './llm/custom'

export function createAdapters(cfg: AppConfig): { stt: STTAdapter; tts: TTSAdapter; llm: LLMAdapter } {
  const stt: STTAdapter = cfg.stt.type === 'openai_compatible'
    ? new OpenAISTTAdapter(cfg.stt)
    : new CustomSTTAdapter(cfg.stt)

  const tts: TTSAdapter = cfg.tts.type === 'openai_compatible'
    ? new OpenAITTSAdapter(cfg.tts)
    : new CustomTTSAdapter(cfg.tts)

  const llm: LLMAdapter = cfg.llm.type === 'openai_compatible'
    ? new OpenAILLMAdapter(cfg.llm)
    : new CustomLLMAdapter(cfg.llm)

  return { stt, tts, llm }
}
