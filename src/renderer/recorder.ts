interface RecorderOptions {
  silenceThreshold: number
  silenceDurationMs: number
}

export class Recorder {
  private mediaRecorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private analyser: AnalyserNode | null = null
  private silenceTimer: ReturnType<typeof setTimeout> | null = null
  private audioCtx: AudioContext | null = null
  private onReady: ((buf: ArrayBuffer) => void) | null = null

  constructor(private opts: RecorderOptions) {}

  onAudioReady(cb: (buf: ArrayBuffer) => void): void {
    this.onReady = cb
  }

  async start(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    this.audioCtx = new AudioContext()
    const source = this.audioCtx.createMediaStreamSource(stream)
    this.analyser = this.audioCtx.createAnalyser()
    this.analyser.fftSize = 256
    source.connect(this.analyser)

    this.chunks = []
    this.mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data)
    }
    this.mediaRecorder.start(100)
    this.monitorSilence()
  }

  stop(): void {
    this.clearSilenceTimer()
    if (this.mediaRecorder?.state === 'recording') {
      this.mediaRecorder.onstop = async () => {
        const blob = new Blob(this.chunks, { type: 'audio/webm' })
        const buf = await blob.arrayBuffer()
        this.onReady?.(buf)
      }
      this.mediaRecorder.stop()
    }
    this.audioCtx?.close()
  }

  private monitorSilence(): void {
    if (!this.analyser) return
    const data = new Uint8Array(this.analyser.frequencyBinCount)

    const check = () => {
      if (!this.analyser || this.mediaRecorder?.state !== 'recording') return
      this.analyser.getByteTimeDomainData(data)
      const rms = Math.sqrt(data.reduce((s, v) => s + ((v - 128) / 128) ** 2, 0) / data.length)

      if (rms < this.opts.silenceThreshold) {
        if (!this.silenceTimer) {
          this.silenceTimer = setTimeout(() => this.stop(), this.opts.silenceDurationMs)
        }
      } else {
        this.clearSilenceTimer()
      }
      requestAnimationFrame(check)
    }
    requestAnimationFrame(check)
  }

  private clearSilenceTimer(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer)
      this.silenceTimer = null
    }
  }
}
