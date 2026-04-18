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
      moveWindow: (dx: number, dy: number) => void
    }
  }
}

async function main() {
  const container = document.getElementById('canvas-container')!
  const statusEl = document.getElementById('status')!

  statusEl.textContent = '加载模型中...'

  const resourcesPath = window.electronAPI.resourcesPath

  const models = {
    miku_pro_jp: {
      name: 'Miku Pro JP',
      relativePath: 'models/miku_pro_jp/miku_sample_t04.model3.json'
    },
    miku: {
      name: 'Miku',
      relativePath: 'models/miku/miku.model3.json'
    },
    hiyori_pro_en: {
      name: 'Hiyori Pro EN',
      relativePath: 'models/hiyori_pro_en/hiyori_pro_t11.model3.json'
    },
    miara_pro_en: {
      name: 'Miara Pro EN',
      relativePath: 'models/miara_pro_en/miara_pro_t03.model3.json'
    }
  } as const

  type ModelId = keyof typeof models
  type ViewMode = 'full' | 'half'

  const savedModelId = localStorage.getItem('live2d:model') as ModelId | null
  const activeModelId: ModelId = savedModelId && models[savedModelId]
    ? savedModelId
    : 'miku_pro_jp'
  const activeModel = models[activeModelId]

  const savedViewMode = localStorage.getItem('live2d:view') as ViewMode | null
  const activeViewMode: ViewMode = savedViewMode === 'full' ? 'full' : 'half'

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

  const modelPath = `file://${resourcesPath}/${activeModel.relativePath}`

  const live2d = new Live2DController(container, activeViewMode)
  const setReadyStatus = () => {
    const viewText = activeViewMode === 'half' ? '半身' : '全身'
    statusEl.textContent = `模型: ${activeModel.name} | 视图: ${viewText} | 空格说话 | 1/2/3/4切模型 | 8全身 9半身`
  }
  try {
    await live2d.loadModel(modelPath)
    setReadyStatus()
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
    live2d.onSpeakStart()
    player.play(buf, () => {
      setReadyStatus()
      live2d.onSpeakEnd()
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
    if (e.code === 'Digit1') {
      localStorage.setItem('live2d:model', 'miku_pro_jp')
      location.reload()
      return
    }
    if (e.code === 'Digit2') {
      localStorage.setItem('live2d:model', 'miku')
      location.reload()
      return
    }
    if (e.code === 'Digit3') {
      localStorage.setItem('live2d:model', 'hiyori_pro_en')
      location.reload()
      return
    }

    if (e.code === 'Digit4') {
      localStorage.setItem('live2d:model', 'miara_pro_en')
      location.reload()
      return
    }

    if (e.code === 'Digit8') {
      localStorage.setItem('live2d:view', 'full')
      location.reload()
      return
    }
    if (e.code === 'Digit9') {
      localStorage.setItem('live2d:view', 'half')
      location.reload()
      return
    }

    if (e.code === 'Space' && !e.repeat) {
      recorder.start()
      statusEl.textContent = '录音中...'
      live2d.setExpression('normal')
    }
  })
  document.addEventListener('keyup', (e) => {
    if (e.code === 'Space') recorder.stop()
  })

  // 拖拽移动窗口（鼠标左键按住拖动）
  let dragStart: { x: number; y: number } | null = null
  document.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return
    dragStart = { x: e.screenX, y: e.screenY }
  })
  document.addEventListener('mousemove', (e) => {
    if (!dragStart) return
    const dx = e.screenX - dragStart.x
    const dy = e.screenY - dragStart.y
    if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return
    window.electronAPI.moveWindow(dx, dy)
    dragStart = { x: e.screenX, y: e.screenY }
  })
  document.addEventListener('mouseup', () => { dragStart = null })
}

main().catch(console.error)
