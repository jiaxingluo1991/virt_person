export interface TTSAdapter {
  synthesize(text: string): Promise<Buffer>
}
