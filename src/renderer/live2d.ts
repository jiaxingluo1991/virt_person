import * as PIXI from 'pixi.js'
import { Live2DModel } from 'pixi-live2d-display/cubism4'

// 注册 Ticker，驱动 Live2D 动画更新
Live2DModel.registerTicker(PIXI.Ticker)

// Cubism Core 6.x 将 renderOrders 从 drawables 移到了 model 顶层
// pixi-live2d-display@0.4 的 CubismModel.getDrawableRenderOrders 访问 drawables.renderOrders
// 但 Core 6.x 将其放在 model 顶层，需要打补丁
function patchRenderOrders(model: Live2DModel) {
  // internalModel.coreModel 就是 CubismModel 实例
  const coreModel = (model.internalModel as any).coreModel
  if (!coreModel) return
  const proto = Object.getPrototypeOf(coreModel)
  if (proto && !proto.__renderOrdersPatched) {
    const orig = proto.getDrawableRenderOrders
    proto.getDrawableRenderOrders = function () {
      const r = orig?.call(this)
      if (r !== undefined) return r
      // Cubism Core 6.x: renderOrders 在 _model 顶层（非 drawables 子属性）
      return this._model?.renderOrders
    }
    proto.__renderOrdersPatched = true
  }
}

type MotionProfile = {
  idle?: number
  tap?: number
  tapBody?: number
  flick?: number
  flickBody?: number
  flickDown?: number
  flic?: number
  flick3?: number
  flickUp?: number
}

export type ViewMode = 'full' | 'half'

export class Live2DController {
  private app: PIXI.Application
  private model: Live2DModel | null = null
  private speaking = false
  private ambientTimer: number | null = null
  private motionProfile: MotionProfile = { idle: 1, tap: 1, flick: 1 }
  private viewMode: ViewMode

  constructor(container: HTMLElement, viewMode: ViewMode = 'half') {
    this.viewMode = viewMode
    this.app = new PIXI.Application({
      width: container.clientWidth,
      height: container.clientHeight,
      backgroundAlpha: 0,
      antialias: true,
      forceCanvas: !PIXI.utils.isWebGLSupported()
    })
    container.appendChild(this.app.view as HTMLCanvasElement)
  }

  async loadModel(modelPath: string): Promise<void> {
    this.motionProfile = await this.loadMotionProfile(modelPath)

    // autoInteract: false 避免使用已废弃的 v6 交互 API
    this.model = await Live2DModel.from(modelPath, { autoInteract: false })
    patchRenderOrders(this.model)
    this.app.stage.addChild(this.model as unknown as PIXI.DisplayObject)

    this.model.anchor.set(0.5, 0.5)
    this.applyViewMode()

    this.playMotion('Idle', 0)
    this.startAmbientMotionLoop()
  }

  setViewMode(mode: ViewMode): void {
    this.viewMode = mode
    this.applyViewMode()
  }

  private applyViewMode(): void {
    if (!this.model) return

    this.model.x = this.app.renderer.width / 2

    if (this.viewMode === 'half') {
      // For half-body: scale to fill height; width clips naturally since the window is narrow
      const baseScale = this.app.renderer.height / this.model.height
      this.model.y = this.app.renderer.height * 0.72
      this.model.scale.set(baseScale * 1.35)
      return
    }

    // full body: fit entire model within the window
    const baseScale = Math.min(
      this.app.renderer.width / this.model.width,
      this.app.renderer.height / this.model.height
    )
    this.model.y = this.app.renderer.height * 0.55
    this.model.scale.set(baseScale * 0.95)
  }

  setExpression(name: string): void {
    this.model?.expression(name)
  }

  playMotion(group: string, index: number): void {
    this.model?.motion(group, index)
  }

  onSpeakStart(): void {
    this.speaking = true
    this.playSpeakMotion()
  }

  onSpeakEnd(): void {
    this.speaking = false
    this.playMotion('Idle', 0)
  }

  playSpeakMotion(): void {
    if (!this.model) return

    const speakCandidates: Array<{ group: string; max: number }> = []
    if ((this.motionProfile.tap ?? 0) > 0)
      speakCandidates.push({ group: 'Tap', max: this.motionProfile.tap! })
    if ((this.motionProfile.tapBody ?? 0) > 0)
      speakCandidates.push({ group: 'Tap@Body', max: this.motionProfile.tapBody! })
    if ((this.motionProfile.flick ?? 0) > 0)
      speakCandidates.push({ group: 'Flick', max: this.motionProfile.flick! })
    if ((this.motionProfile.flickBody ?? 0) > 0)
      speakCandidates.push({ group: 'Flick@Body', max: this.motionProfile.flickBody! })
    if ((this.motionProfile.flickDown ?? 0) > 0)
      speakCandidates.push({ group: 'FlickDown', max: this.motionProfile.flickDown! })
    if ((this.motionProfile.flic ?? 0) > 0)
      speakCandidates.push({ group: 'Flic', max: this.motionProfile.flic! })
    if ((this.motionProfile.flick3 ?? 0) > 0)
      speakCandidates.push({ group: 'Flick3', max: this.motionProfile.flick3! })
    if ((this.motionProfile.flickUp ?? 0) > 0)
      speakCandidates.push({ group: 'FlickUp', max: this.motionProfile.flickUp! })

    if (speakCandidates.length === 0) {
      this.playMotion('Idle', 0)
      return
    }

    const chosen = speakCandidates[Math.floor(Math.random() * speakCandidates.length)]
    const index = Math.floor(Math.random() * chosen.max)
    this.model.motion(chosen.group, index)
  }

  private startAmbientMotionLoop(): void {
    if (this.ambientTimer !== null) {
      window.clearInterval(this.ambientTimer)
    }

    this.ambientTimer = window.setInterval(() => {
      if (!this.model || this.speaking) return

      const idleCount = this.motionProfile.idle ?? 1
      const tapCount      = this.motionProfile.tap      ?? 0
      const tapBodyCount  = this.motionProfile.tapBody  ?? 0
      const flickCount    = this.motionProfile.flick    ?? 0
      const flickBodyCount = this.motionProfile.flickBody ?? 0
      const flickDownCount = this.motionProfile.flickDown ?? 0
      const flicCount     = this.motionProfile.flic     ?? 0
      const flick3Count   = this.motionProfile.flick3   ?? 0
      const flickUpCount  = this.motionProfile.flickUp  ?? 0

      const pool: Array<{ group: string; max: number; weight: number }> = [
        { group: 'Idle', max: Math.max(1, idleCount), weight: 50 }
      ]
      if (tapCount > 0)       pool.push({ group: 'Tap',        max: tapCount,       weight: 12 })
      if (tapBodyCount > 0)   pool.push({ group: 'Tap@Body',   max: tapBodyCount,   weight: 8  })
      if (flickCount > 0)     pool.push({ group: 'Flick',      max: flickCount,     weight: 12 })
      if (flickBodyCount > 0) pool.push({ group: 'Flick@Body', max: flickBodyCount, weight: 8  })
      if (flickDownCount > 0) pool.push({ group: 'FlickDown',  max: flickDownCount, weight: 6  })
      if (flicCount > 0)      pool.push({ group: 'Flic',       max: flicCount,      weight: 10 })
      if (flick3Count > 0)    pool.push({ group: 'Flick3',     max: flick3Count,    weight: 8  })
      if (flickUpCount > 0)   pool.push({ group: 'FlickUp',    max: flickUpCount,   weight: 8  })

      const totalWeight = pool.reduce((s, e) => s + e.weight, 0)
      let r = Math.random() * totalWeight
      const chosen = pool.find(e => (r -= e.weight) < 0) ?? pool[0]
      this.playMotion(chosen.group, Math.floor(Math.random() * chosen.max))
    }, 4500)
  }

  private async loadMotionProfile(modelPath: string): Promise<MotionProfile> {
    try {
      const resp = await fetch(modelPath)
      if (!resp.ok) return { idle: 1, tap: 1, flick: 1 }
      const data = await resp.json() as {
        FileReferences?: {
          Motions?: Record<string, unknown[]>
        }
      }
      const motions = data.FileReferences?.Motions ?? {}
      return {
        idle:      motions.Idle?.length      ?? 1,
        tap:       motions.Tap?.length       ?? 0,
        tapBody:   motions['Tap@Body']?.length ?? 0,
        flick:     motions.Flick?.length     ?? 0,
        flickBody: motions['Flick@Body']?.length ?? 0,
        flickDown: motions.FlickDown?.length ?? 0,
        flic:      motions.Flic?.length      ?? 0,
        flick3:    motions.Flick3?.length    ?? 0,
        flickUp:   motions.FlickUp?.length   ?? 0
      }
    } catch {
      return { idle: 1, tap: 1, flick: 1 }
    }
  }

  setLipSync(volume: number): void {
    if (!this.model) return
    const v = Math.min(1, volume * 2)
    this.model.internalModel.coreModel.setParameterValueById('PARAM_MOUTH_OPEN_Y', v)
    this.model.internalModel.coreModel.setParameterValueById('ParamMouthOpenY', v)
  }

  playEnvelope(envelope: number[], durationMs: number): void {
    if (!this.model || envelope.length === 0) return

    const frameMs = durationMs / envelope.length
    let index = 0
    let lastTime = performance.now()

    const tick = () => {
      if (index >= envelope.length) {
        this.setLipSync(0)
        return
      }
      const now = performance.now()
      if (now - lastTime >= frameMs) {
        this.setLipSync(envelope[index])
        index++
        lastTime = now
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }
}
