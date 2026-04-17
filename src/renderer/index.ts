import { AudioPlayer } from './audio-player'
import { Recorder } from './recorder'

declare global {
  interface Window {
    electronAPI: {
      resourcesPath: string
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

  statusEl.textContent = '加载模型中...'

  const resourcesPath = window.electronAPI.resourcesPath

  // 加载 Cubism Core（构建时已复制到 dist/renderer/cubism-core/）
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = './cubism-core/live2dcubismcore.min.js'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Cubism Core'))
    document.head.appendChild(script)
  })

  // Cubism Core 加载完后再动态导入 Live2DController
  const { Live2DController } = await import('./live2d')

  const modelPath = `file://${resourcesPath}/models/Haru/Haru.model3.json`

  const live2d = new Live2DController(container)
  try {
    await live2d.loadModel(modelPath)
    statusEl.textContent = '按住空格键说话'
  } catch (err) {
    statusEl.textContent = `模型加载失败: ${err}`
    console.error('Live2D load error:', err)
    return
  }

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
