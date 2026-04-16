import { LLMAdapter, Message } from './base'
import { LLMConfig } from '../../config'

function renderTemplate(template: Record<string, unknown>, text: string): Record<string, unknown> {
  return JSON.parse(JSON.stringify(template).replace(/\{\{text\}\}/g, text))
}

export class CustomLLMAdapter implements LLMAdapter {
  constructor(private cfg: LLMConfig) {}

  async chat(messages: Message[]): Promise<string> {
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')?.content ?? ''
    const body = this.cfg.body_template
      ? renderTemplate(this.cfg.body_template, lastUserMessage)
      : { messages }

    const res = await fetch(this.cfg.url, {
      method: this.cfg.method ?? 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!res.ok) throw new Error(`LLM error: ${res.status}`)
    const data = await res.json() as { text?: string; response?: string; choices?: { message: { content: string } }[] }
    return data.text ?? data.response ?? data.choices?.[0]?.message?.content ?? ''
  }
}
