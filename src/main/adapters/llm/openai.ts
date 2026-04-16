import { LLMAdapter, Message } from './base'
import { LLMConfig } from '../../config'

export class OpenAILLMAdapter implements LLMAdapter {
  constructor(private cfg: Pick<LLMConfig, 'url' | 'model' | 'system_prompt'>) {}

  async chat(messages: Message[]): Promise<string> {
    const allMessages: Message[] = this.cfg.system_prompt
      ? [{ role: 'system', content: this.cfg.system_prompt }, ...messages]
      : messages

    const res = await fetch(this.cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.cfg.model, messages: allMessages })
    })
    if (!res.ok) throw new Error(`LLM error: ${res.status}`)
    const data = await res.json() as { choices: { message: { content: string } }[] }
    return data.choices[0].message.content
  }
}
