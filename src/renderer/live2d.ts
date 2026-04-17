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

export class Live2DController {
  private app: PIXI.Application
  private model: Live2DModel | null = null

  constructor(container: HTMLElement) {
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
    // autoInteract: false 避免使用已废弃的 v6 交互 API
    this.model = await Live2DModel.from(modelPath, { autoInteract: false })
    patchRenderOrders(this.model)
    this.app.stage.addChild(this.model as unknown as PIXI.DisplayObject)

    this.model.x = this.app.renderer.width / 2
    this.model.y = this.app.renderer.height / 2
    this.model.anchor.set(0.5, 0.5)
    const scale = Math.min(
      this.app.renderer.width / this.model.width,
      this.app.renderer.height / this.model.height
    ) * 0.8
    this.model.scale.set(scale)

    this.playMotion('Idle', 0)
  }

  setExpression(name: string): void {
    this.model?.expression(name)
  }

  playMotion(group: string, index: number): void {
    this.model?.motion(group, index)
  }

  setLipSync(volume: number): void {
    if (!this.model) return
    this.model.internalModel.coreModel.setParameterValueById(
      'ParamMouthOpenY',
      Math.min(1, volume * 2)
    )
  }
}
