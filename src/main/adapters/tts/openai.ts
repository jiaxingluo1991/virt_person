import { TTSAdapter } from './base'
import { TTSConfig } from '../../config'

export class OpenAITTSAdapter implements TTSAdapter {
  constructor(private cfg: Pick<TTSConfig, 'url' | 'model'>) {}

  async synthesize(text: string): Promise<Buffer> {
    const res = await fetch(this.cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.cfg.model ?? 'tts-1', input: text, voice: 'alloy' })
    })
    if (!res.ok) throw new Error(`TTS error: ${res.status}`)
    return Buffer.from(await res.arrayBuffer())
  }
}
