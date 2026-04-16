import { TTSAdapter } from './base'
import { TTSConfig } from '../../config'

function renderTemplate(template: Record<string, unknown>, text: string): Record<string, unknown> {
  return JSON.parse(JSON.stringify(template).replace(/\{\{text\}\}/g, text))
}

export class CustomTTSAdapter implements TTSAdapter {
  constructor(private cfg: TTSConfig) {}

  async synthesize(text: string): Promise<Buffer> {
    const body = this.cfg.body_template
      ? renderTemplate(this.cfg.body_template, text)
      : { text }

    const res = await fetch(this.cfg.url, {
      method: this.cfg.method ?? 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!res.ok) throw new Error(`TTS error: ${res.status}`)
    return Buffer.from(await res.arrayBuffer())
  }
}
