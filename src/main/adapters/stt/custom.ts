import { STTAdapter } from './base'
import { STTConfig } from '../../config'

export class CustomSTTAdapter implements STTAdapter {
  constructor(private cfg: STTConfig) {}

  async transcribe(audioBuffer: Buffer): Promise<string> {
    const form = new FormData()
    form.append('file', new Blob([audioBuffer], { type: 'audio/wav' }), 'audio.wav')
    if (this.cfg.body_template) {
      for (const [k, v] of Object.entries(this.cfg.body_template)) {
        if (k !== 'file') form.append(k, String(v))
      }
    }
    const res = await fetch(this.cfg.url, { method: this.cfg.method ?? 'POST', body: form })
    if (!res.ok) throw new Error(`STT error: ${res.status}`)
    const data = await res.json() as { text?: string; result?: string; transcript?: string }
    return data.text ?? data.result ?? data.transcript ?? ''
  }
}
