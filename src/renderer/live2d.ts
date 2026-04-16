import * as PIXI from 'pixi.js'
import { Live2DModel } from 'pixi-live2d-display'

export class Live2DController {
  private app: PIXI.Application
  private model: Live2DModel | null = null

  constructor(container: HTMLElement) {
    this.app = new PIXI.Application({
      width: container.clientWidth,
      height: container.clientHeight,
      backgroundAlpha: 0,
      antialias: true
    })
    container.appendChild(this.app.view as HTMLCanvasElement)
  }

  async loadModel(modelPath: string): Promise<void> {
    this.model = await Live2DModel.from(modelPath)
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
