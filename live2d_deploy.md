# Live2D in Electron + Vite 部署要点

> 基于 pixi-live2d-display@0.4 + pixi.js@6 + Electron 28 + Vite 5 的实战经验总结

---

## 1. 版本锁定（最关键）

| 包 | 版本 | 原因 |
|----|------|------|
| `pixi-live2d-display` | `^0.4.0` | 最新稳定版，仅支持 pixi v6 |
| `pixi.js` | `^6.5.10` | **必须用 v6**，v7 破坏了 `isInteractive` 等 API，导致渲染崩溃 |
| Cubism Core | 6.x（官方最新） | 需要额外补丁，见第 5 节 |

---

## 2. 导入路径

```ts
// 必须从 cubism4 子路径导入，否则会报 "Could not find Cubism 4 runtime"
import { Live2DModel } from 'pixi-live2d-display/cubism4'

// 必须注册 Ticker，否则报 "No Ticker registered"，动画不更新
Live2DModel.registerTicker(PIXI.Ticker)
```

---

## 3. Cubism Core 加载顺序（动态导入）

Cubism Core 必须在 `pixi-live2d-display` 模块代码执行**之前**注入到 `window`。
模块级代码在 bundle 加载时立即执行，因此不能在同一 bundle 里先 `import` 再加载 Core。

**正确做法：**

```ts
// index.ts（渲染进程入口）
// Step 1: 动态注入 Cubism Core script
await new Promise<void>((resolve, reject) => {
  const script = document.createElement('script')
  script.src = './cubism-core/live2dcubismcore.min.js'  // 相对路径
  script.onload = () => resolve()
  script.onerror = () => reject(new Error('Failed to load Cubism Core'))
  document.head.appendChild(script)
})

// Step 2: Core 加载完后再动态 import Live2DController
const { Live2DController } = await import('./live2d')
```

**错误做法：**
```ts
// 顶层 import 会在 Core 加载前执行模块代码，导致 "Could not find Cubism 4 runtime"
import { Live2DController } from './live2d'
```

---

## 4. Cubism Core 文件的构建处理

Electron 的 `file://` 协议下，动态加载外部 `file://` 路径的脚本会被安全策略拦截（ERR_FAILED）。

**解决方案：** 构建时将 Core 文件复制到 renderer 输出目录，用相对路径加载。

```ts
// vite.renderer.config.ts
plugins: [{
  name: 'copy-cubism-core',
  closeBundle() {
    const dest = resolve(__dirname, 'dist/renderer/cubism-core')
    mkdirSync(dest, { recursive: true })
    copyFileSync(
      resolve(__dirname, 'resources/cubism-core/live2dcubismcore.min.js'),
      resolve(dest, 'live2dcubismcore.min.js')
    )
  }
}]
```

同时 `base: './'` 必须设置，否则 Vite 生成的 asset 路径是 `/assets/...`，在 `file://` 下无法加载：

```ts
// vite.renderer.config.ts
base: './'
```

---

## 5. Cubism Core 6.x 兼容补丁

**问题：** Cubism Core 6.x 将 `renderOrders` 从 `model.drawables.renderOrders` 移到了 `model.renderOrders`（model 顶层）。pixi-live2d-display@0.4 仍访问旧路径，导致每帧渲染时报：

```
TypeError: Cannot read properties of undefined (reading '0')
    at CubismRenderer_WebGL.doDrawModel
```

**定位方法：**
- 错误在 `doDrawModel` → `getDrawableRenderOrders()` → `this._model.drawables.renderOrders` 为 undefined
- `internalModel.coreModel` 就是 `CubismModel` 实例（不是 raw core model）
- 需要补丁 `CubismModel.prototype.getDrawableRenderOrders`

**修复代码（在 `Live2DModel.from()` 之后调用）：**

```ts
function patchRenderOrders(model: Live2DModel) {
  const coreModel = (model.internalModel as any).coreModel
  if (!coreModel) return
  const proto = Object.getPrototypeOf(coreModel)
  if (proto && !proto.__renderOrdersPatched) {
    const orig = proto.getDrawableRenderOrders
    proto.getDrawableRenderOrders = function () {
      const r = orig?.call(this)
      if (r !== undefined) return r
      // Cubism Core 6.x: renderOrders 在 _model 顶层
      return this._model?.renderOrders
    }
    proto.__renderOrdersPatched = true
  }
}

// 使用
this.model = await Live2DModel.from(modelPath, { autoInteract: false })
patchRenderOrders(this.model)  // 必须在 addChild 之前
```

**注意：** 补丁要打在 `coreModel` 自身的原型上，不是 `coreModel.getModel()` 返回的 raw model 原型。

---

## 6. 模型加载选项

```ts
// autoInteract: false 必须设置
// pixi-live2d-display@0.4 的默认交互使用了 pixi v6 已废弃的 API
// 不设置会报 "t.isInteractive is not a function"
this.model = await Live2DModel.from(modelPath, { autoInteract: false })
```

---

## 7. 模型路径（Electron file:// 协议）

```ts
// 开发环境：resourcesPath = process.cwd()/resources
// 打包后：resourcesPath = process.resourcesPath
const modelPath = `file://${resourcesPath}/models/Haru/Haru.model3.json`
```

`resourcesPath` 通过 `additionalArguments` 从 main process 传入 preload，再通过 contextBridge 暴露给 renderer（不能用 `process.env`，沙箱下不可靠）。

---

## 8. 口型同步

```ts
// 直接设置 Cubism 参数驱动口型
model.internalModel.coreModel.setParameterValueById(
  'ParamMouthOpenY',
  Math.min(1, volume * 2)  // volume 是 0~1 的音量值
)
```

---

## 9. 常见错误速查

| 错误信息 | 原因 | 解决 |
|---------|------|------|
| `Could not find Cubism 2 runtime` | 从默认路径导入而非 `/cubism4` | 改为 `from 'pixi-live2d-display/cubism4'` |
| `Could not find Cubism 4 runtime` | Cubism Core 未在模块加载前注入 window | 动态 import Live2DController，在 Core script 加载后 |
| `No Ticker registered` | 未调用 registerTicker | 加 `Live2DModel.registerTicker(PIXI.Ticker)` |
| `t.isInteractive is not a function` | pixi.js v7 与 pixi-live2d-display@0.4 不兼容 | 降级到 pixi.js@6 |
| `doDrawModel: Cannot read ... '0'` | Cubism Core 6.x API 变更 | 应用第 5 节的 patchRenderOrders 补丁 |
| `ERR_FAILED` 加载 Core | Electron 安全策略阻止 file:// 动态脚本 | 构建时复制 Core 到 dist，用相对路径加载 |
| `preload.js not found` | Vite lib 模式只支持单入口 | 改用 `rollupOptions.input` 多入口 |
