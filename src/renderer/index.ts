declare global {
  interface Window {
    electronAPI: {
      resourcesPath: string
      moveWindow: (dx: number, dy: number) => void
    }
  }
}

const WS_URL = 'ws://127.0.0.1:8766'

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

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = './cubism-core/live2dcubismcore.min.js'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Cubism Core'))
    document.head.appendChild(script)
  })

  const { Live2DController } = await import('./live2d')

  const modelPath = `file://${resourcesPath}/${activeModel.relativePath}`

  const live2d = new Live2DController(container, activeViewMode)
  const setReadyStatus = () => {
    const viewText = activeViewMode === 'half' ? '半身' : '全身'
    statusEl.textContent = `${activeModel.name} | ${viewText} | 待唤醒 | 1/2/3/4切模型 | 8全身 9半身`
  }
  try {
    await live2d.loadModel(modelPath)
    setReadyStatus()
  } catch (err) {
    statusEl.textContent = `模型加载失败: ${err}`
    console.error('Live2D load error:', err)
    return
  }

  // ── WebSocket：连接 interaction/main.py ──────────────────
  function connectWS() {
    const ws = new WebSocket(WS_URL)

    ws.onopen = () => {
      console.log('WebSocket connected to interaction server')
      statusEl.textContent = `${activeModel.name} | 待唤醒`
    }

    ws.onmessage = (event) => {
      let msg: { type: string; state?: string; envelope?: number[]; duration_ms?: number }
      try {
        msg = JSON.parse(event.data)
      } catch {
        return
      }

      if (msg.type === 'state') {
        switch (msg.state) {
          case 'idle':
            live2d.onSpeakEnd()
            setReadyStatus()
            break
          case 'listening':
            statusEl.textContent = '聆听中...'
            live2d.setExpression('normal')
            break
          case 'processing':
            statusEl.textContent = '思考中...'
            live2d.playMotion('Idle', 0)
            break
        }
      } else if (msg.type === 'lip_sync' && msg.envelope && msg.duration_ms) {
        live2d.playEnvelope(msg.envelope, msg.duration_ms)
      } else if (msg.type === 'speak_start') {
        statusEl.textContent = '说话中...'
        live2d.onSpeakStart()
      } else if (msg.type === 'speak_end') {
        live2d.onSpeakEnd()
        setReadyStatus()
      }
    }

    ws.onclose = () => {
      console.log('WebSocket disconnected, retrying in 3s...')
      statusEl.textContent = `${activeModel.name} | 未连接语音服务`
      setTimeout(connectWS, 3000)
    }

    ws.onerror = () => ws.close()
  }

  connectWS()

  // ── 键盘：切换模型和视图 ──────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Digit1') { localStorage.setItem('live2d:model', 'miku_pro_jp'); location.reload() }
    if (e.code === 'Digit2') { localStorage.setItem('live2d:model', 'miku'); location.reload() }
    if (e.code === 'Digit3') { localStorage.setItem('live2d:model', 'hiyori_pro_en'); location.reload() }
    if (e.code === 'Digit4') { localStorage.setItem('live2d:model', 'miara_pro_en'); location.reload() }
    if (e.code === 'Digit8') { localStorage.setItem('live2d:view', 'full'); location.reload() }
    if (e.code === 'Digit9') { localStorage.setItem('live2d:view', 'half'); location.reload() }
  })

  // ── 拖拽移动窗口 ──────────────────────────────────────────
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
