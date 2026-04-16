export class AudioPlayer {
  private audioCtx: AudioContext | null = null

  constructor(private onVolume: (volume: number) => void) {}

  play(buffer: ArrayBuffer, onEnded: () => void): void {
    this.audioCtx?.close()
    this.audioCtx = new AudioContext()

    this.audioCtx.decodeAudioData(buffer.slice(0), (decoded) => {
      const source = this.audioCtx!.createBufferSource()
      const analyser = this.audioCtx!.createAnalyser()
      analyser.fftSize = 256

      source.buffer = decoded
      source.connect(analyser)
      analyser.connect(this.audioCtx!.destination)
      source.start()

      source.onended = () => {
        this.onVolume(0)
        onEnded()
      }

      this.trackVolume(analyser)
    })
  }

  private trackVolume(analyser: AnalyserNode): void {
    const data = new Uint8Array(analyser.frequencyBinCount)
    const tick = () => {
      if (!this.audioCtx || this.audioCtx.state === 'closed') return
      analyser.getByteTimeDomainData(data)
      const rms = Math.sqrt(data.reduce((s, v) => s + ((v - 128) / 128) ** 2, 0) / data.length)
      this.onVolume(rms)
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }
}
