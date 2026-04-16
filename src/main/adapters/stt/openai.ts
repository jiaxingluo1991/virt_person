import { STTAdapter } from './base'
import { STTConfig } from '../../config'

export class OpenAISTTAdapter implements STTAdapter {
  constructor(private cfg: Pick<STTConfig, 'url' | 'model'>) {}

  async transcribe(audioBuffer: Buffer): Promise<string> {
    const form = new FormData()
    form.append('file', new Blob([audioBuffer], { type: 'audio/wav' }), 'audio.wav')
    if (this.cfg.model) form.append('model', this.cfg.model)

    const res = await fetch(this.cfg.url, { method: 'POST', body: form })
    if (!res.ok) throw new Error(`STT error: ${res.status}`)
    const data = await res.json() as { text: string }
    return data.text
  }
}
