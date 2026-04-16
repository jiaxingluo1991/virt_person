export interface STTAdapter {
  transcribe(audioBuffer: Buffer): Promise<string>
}
