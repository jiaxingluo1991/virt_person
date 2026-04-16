import { STTAdapter } from './adapters/stt/base'
import { TTSAdapter } from './adapters/tts/base'
import { LLMAdapter, Message } from './adapters/llm/base'
import { convertToWav } from './audio'

export class DialogManager {
  private history: Message[] = []

  constructor(
    private stt: STTAdapter,
    private tts: TTSAdapter,
    private llm: LLMAdapter
  ) {}

  async processAudio(webmBuffer: Buffer): Promise<Buffer> {
    const wav = await convertToWav(webmBuffer)
    const text = await this.stt.transcribe(wav)
    if (!text.trim()) throw new Error('Empty transcription')

    this.history.push({ role: 'user', content: text })
    const reply = await this.llm.chat(this.history)
    this.history.push({ role: 'assistant', content: reply })

    return this.tts.synthesize(reply)
  }

  clearHistory(): void {
    this.history = []
  }
}
