# virt-person — 架构与方案设计

## 项目概述

Ubuntu 桌面虚拟人物应用：Live2D 渲染 + 本地 STT/TTS/LLM 语音对话，支持口型同步与动作响应。目标平台：Ubuntu 20.04 / 22.04 / 24.04。

## 技术栈

| 层次 | 选型 |
|------|------|
| 桌面框架 | Electron 28.x |
| 语言 | TypeScript |
| Live2D 渲染 | pixi-live2d-display@0.4 + pixi.js@6 |
| 音频转码 | ffmpeg-static（WebM → WAV） |
| 打包 | electron-builder（AppImage + deb） |
| 测试 | Vitest |
| 构建 | Vite（main/renderer 各一份配置） |

## 当前实现状态（已完成）

### 1) 进程职责
- Main Process：配置加载、STT/TTS/LLM 调用、音频转码、窗口控制
- Renderer Process：Live2D 渲染、录音、音频播放、口型同步、模型切换

### 2) Live2D 关键兼容项
- 使用 `pixi-live2d-display/cubism4` 子路径导入
- 注册 `Live2DModel.registerTicker(PIXI.Ticker)`
- `Live2DModel.from(..., { autoInteract: false })`
- 先动态加载 `live2dcubismcore.min.js`，再动态 import `live2d.ts`
- 已加入 Cubism Core 6.x `renderOrders` 兼容补丁

### 3) 窗口与交互
- 无边框透明窗口（`frame: false`, `transparent: true`）
- 启动置顶（`alwaysOnTop: true`）
- 不自动打开 DevTools
- 支持鼠标左键拖拽移动窗口（renderer → IPC `window:move`）

### 4) 模型与视图切换
- 支持快捷键切换模型：`1/2/3/4`
  - 1 = Miku Pro JP
  - 2 = Miku
  - 3 = Hiyori Pro EN
  - 4 = Miara Pro EN
- 支持视图切换：`8` 全身 / `9` 半身
- 模型与视图选择持久化在 `localStorage`

### 5) 动作系统
- 启动时读取 `.model3.json` 的 `Motions`，自动生成动作画像
- 说话动作池 + 待机动作池（按权重随机）
- 兼容分组命名差异：`Flick` / `Flic` / `FlickUp` / `FlickDown` / `Tap@Body` / `Flick@Body`

## IPC 通信协议（当前）

| 事件 | 方向 | 说明 |
|------|------|------|
| `audio:data` | Renderer → Main | 录音完成，发送 WebM buffer |
| `tts:audio` | Main → Renderer | TTS 音频 buffer |
| `speak:start` | Main → Renderer | 开始说话 |
| `speak:end` | Main → Renderer | 说话结束 |
| `dialog:error` | Main → Renderer | 对话链路错误 |
| `dialog:clear` | Renderer → Main | 清空上下文 |
| `window:move` | Renderer → Main | 拖拽移动窗口 |

## 目录结构

```text
src/
├── main/
│   ├── index.ts
│   ├── config.ts
│   ├── dialog.ts
│   ├── audio.ts
│   ├── ipc-handlers.ts
│   ├── preload.ts
│   └── adapters/
└── renderer/
    ├── index.html
    ├── index.ts
    ├── live2d.ts
    ├── recorder.ts
    └── audio-player.ts
```

## 构建与资源约定

- `vite.renderer.config.ts` 设置 `base: './'`，适配 `file://`
- 构建后自动复制 `resources/cubism-core/live2dcubismcore.min.js` 到 `dist/renderer/cubism-core/`
- 模型资源放在 `resources/models/<model_name>/`

## 未完成事项（待做）

1. **模型清单配置化**
   - 当前模型列表写死在 `src/renderer/index.ts`
   - 建议改为读取 `resources/models/manifest.json`，避免每次改代码

2. **窗口尺寸与位置持久化**
   - 当前支持拖拽，但重启后不保留上次位置
   - 建议持久化到本地配置文件

3. **置顶开关**
   - 当前固定 `alwaysOnTop: true`
   - 建议增加快捷键或配置项动态切换

4. **模型动态扫描**
   - 当前仅支持预定义快捷键 1/2/3/4
   - 建议启动时扫描 `resources/models/*/*.model3.json` 自动注册

5. **打包与发布验证**
   - 需做一次完整 AppImage/.deb 实机回归
   - 校验透明窗口、模型加载、语音链路在打包后行为一致

6. **语音链路稳定性测试**
   - 增加端到端测试（STT→LLM→TTS）
   - 覆盖服务异常、超时和恢复场景
