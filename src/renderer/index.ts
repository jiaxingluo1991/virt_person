import { Live2DController } from './live2d'
import { AudioPlayer } from './audio-player'
import { Recorder } from './recorder'

declare global {
  interface Window {
    electronAPI: {
      sendAudio: (buf: ArrayBuffer) => void
      clearDialog: () => void
      onTtsAudio: (cb: (buf: ArrayBuffer) => void) => void
      onSpeakStart: (cb: () => void) => void
      onSpeakEnd: (cb: () => void) => void
      onDialogError: (cb: (msg: string) => void) => void
    }
  }
}

async function main() {
  const container = document.getElementById('canvas-container')!
  const statusEl = document.getElementById('status')!

  const live2d = new Live2DController(container)
  await live2d.loadModel('../../resources/models/Haru/Haru.model3.json')

  const player = new AudioPlayer((volume) => live2d.setLipSync(volume))
  const recorder = new Recorder({ silenceThreshold: 0.01, silenceDurationMs: 1500 })

  recorder.onAudioReady((buffer) => {
    statusEl.textContent = '识别中...'
    window.electronAPI.sendAudio(buffer)
  })

  window.electronAPI.onTtsAudio((buf) => {
    statusEl.textContent = '说话中...'
    live2d.playMotion('Speak', 0)
    player.play(buf, () => {
      statusEl.textContent = '按住空格键说话'
      live2d.playMotion('Idle', 0)
      live2d.setLipSync(0)
      window.electronAPI.onSpeakEnd(() => {})
    })
  })

  window.electronAPI.onSpeakStart(() => {
    live2d.setExpression('happy')
  })

  window.electronAPI.onDialogError((msg) => {
    statusEl.textContent = `错误: ${msg}`
    live2d.playMotion('Idle', 0)
  })

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.repeat) {
      recorder.start()
      statusEl.textContent = '录音中...'
      live2d.setExpression('normal')
    }
  })
  document.addEventListener('keyup', (e) => {
    if (e.code === 'Space') recorder.stop()
  })
}

main().catch(console.error)
