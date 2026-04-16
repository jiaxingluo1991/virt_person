export interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LLMAdapter {
  chat(messages: Message[]): Promise<string>
}
