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
export type InteractionState = 'idle' | 'triggered' | 'listening' | 'processing' | 'speaking'

// Motion sequences per state (hiyori_pro_en)
const STATE_MOTIONS: Record<InteractionState, Array<[string, number]>> = {
  idle:       [['Idle', 0], ['Idle', 1], ['Idle', 2]],
  triggered:  [['Tap', 0], ['Tap', 1]],
  listening:  [['Idle', 0], ['Idle', 1], ['Idle', 2]],
  processing: [['FlickDown', 0], ['Flick@Body', 0]],
  speaking:   [['Flick', 0], ['FlickUp', 0]],
}

export class Live2DController {
  private app: PIXI.Application
  private model: Live2DModel | null = null
  private motionProfile: MotionProfile = { idle: 1, tap: 1, flick: 1 }
  private viewMode: ViewMode
  private loopToken = 0
  private _lipSyncActive = false
  private _lipSyncVolume = 0

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

    this.model = await Live2DModel.from(modelPath, { autoInteract: false })
    patchRenderOrders(this.model)
    this.app.stage.addChild(this.model as unknown as PIXI.DisplayObject)

    this.model.anchor.set(0.5, 0.5)
    this.applyViewMode()

    // Override ParamMouthOpenY after motion update so lip sync beats baked motion curves
    this.model.internalModel.on('beforeModelUpdate', () => {
      if (!this._lipSyncActive) return
      const core = (this.model!.internalModel as any).coreModel
      core.setParameterValueById('ParamMouthOpenY', this._lipSyncVolume)
      core.setParameterValueById('PARAM_MOUTH_OPEN_Y', this._lipSyncVolume)
    })

    this.setState('idle')
  }

  setViewMode(mode: ViewMode): void {
    this.viewMode = mode
    this.applyViewMode()
  }

  setState(state: InteractionState): void {
    this.loopToken++
    const token = this.loopToken
    const options = STATE_MOTIONS[state]
    const [group, index] = options[Math.floor(Math.random() * options.length)]

    const playOne = () => {
      if (this.loopToken !== token || !this.model) return
      this.model.motion(group, index, 3) // priority FORCE=3, interrupts current motion immediately
      setTimeout(() => { if (this.loopToken === token) playOne() }, 3000)
    }

    playOne()
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
    this._lipSyncVolume = Math.min(1, Math.max(0, volume))
  }

  playEnvelope(envelope: number[], durationMs: number): void {
    if (!this.model || envelope.length === 0) return

    this._lipSyncActive = true
    const frameMs = durationMs / envelope.length
    const startTime = performance.now()

    const tick = () => {
      const elapsed = performance.now() - startTime
      if (elapsed >= durationMs) {
        this._lipSyncActive = false
        this._lipSyncVolume = 0
        return
      }
      const index = Math.min(Math.floor(elapsed / frameMs), envelope.length - 1)
      this.setLipSync(envelope[index])
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }
}
