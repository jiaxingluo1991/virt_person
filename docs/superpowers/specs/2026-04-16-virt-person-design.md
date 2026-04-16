# 虚拟人物桌面应用 — 技术设计文档

**日期：** 2026-04-16  
**状态：** 待实现

---

## 1. 项目概述

在 Ubuntu 桌面上运行的虚拟人物应用，具备：
- Live2D 动漫角色渲染（表情、动作、口型同步）
- 本地 STT 语音识别
- 本地 TTS 语音合成
- 本地 LLM 对话（可选，接口预留）
- 支持 Ubuntu 20.04 / 22.04 / 24.04

---

## 2. 技术栈

| 层次 | 技术选型 |
|------|---------|
| 桌面框架 | Electron 28.x |
| 语言 | TypeScript |
| Live2D 渲染 | pixi-live2d-display + pixi.js |
| 音频转码 | ffmpeg-static |
| 打包工具 | electron-builder |
| 外部服务对接 | 自定义 Adapter 层（HTTP） |

---

## 3. 整体架构

```
┌─────────────────────────────────────────────────────┐
│                  Electron App                        │
│                                                      │
│  ┌─────────────┐        ┌──────────────────────┐    │
│  │  Main Process│        │  Renderer Process    │    │
│  │  (Node.js)  │◄──IPC──►│  (Chromium)          │    │
│  │             │        │                      │    │
│  │ - STT 调用  │        │ - Live2D 渲染         │    │
│  │ - TTS 调用  │        │   (pixi-live2d)      │    │
│  │ - LLM 调用  │        │ - 表情/动作控制        │    │
│  │ - 服务配置   │        │ - 麦克风录音           │    │
│  │             │        │ - TTS 播放 + 口型同步  │    │
│  └─────────────┘        └──────────────────────┘    │
└─────────────────────────────────────────────────────┘
         │
         ▼ HTTP / WebSocket
┌─────────────────────────┐
│  本地服务（用户自备）     │
│  - STT 服务              │
│  - TTS 服务              │
│  - LLM 服务              │
└─────────────────────────┘
```

- Main Process 负责所有 I/O（麦克风录音、HTTP 调用外部服务）
- Renderer Process 只负责 Live2D 渲染和 UI
- 两者通过 Electron IPC 通信
- 外部服务通过统一 Adapter 层对接，屏蔽接口差异

---

## 4. Ubuntu 版本兼容性

### 版本差异对比

| 项目 | Ubuntu 20.04 | Ubuntu 22.04 | Ubuntu 24.04 |
|------|-------------|-------------|-------------|
| 音频系统 | PulseAudio | PulseAudio / PipeWire | PipeWire（默认） |
| 默认 Node.js | 10.x（不可用） | 12.x（不可用） | 18.x |
| glibc 版本 | 2.31 | 2.35 | 2.39 |
| Wayland 支持 | 不稳定 | 部分 | 较好 |
| Electron 28 兼容 | 需补装系统库 | 开箱即用 | 开箱即用 |

### Ubuntu 20.04 关键技术点

- 通过 NodeSource 安装 Node.js 18+：
  ```bash
  curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
  sudo apt install -y nodejs
  ```
- 补装 Electron 依赖库：
  ```bash
  sudo apt install libgbm1 libnss3 libatk-bridge2.0-0 libxss1
  ```
- glibc 2.31 满足 Electron 28 最低要求，锁定 Electron ≤ 30
- 音频：PulseAudio，`getUserMedia` 直接可用
- 打包产物：优先使用 AppImage（无需安装，兼容性最好）

### Ubuntu 22.04 关键技术点

- 通过 NodeSource 安装 Node.js 18+（同上）
- 音频：PulseAudio 或 PipeWire，需确保 `pipewire-pulse` 已安装：
  ```bash
  sudo apt install pipewire-pulse
  ```
- glibc 2.35，Electron 版本无额外限制
- 打包产物：AppImage 或 `.deb` 均可

### Ubuntu 24.04 关键技术点

- Node.js 18 可直接安装：
  ```bash
  sudo apt install nodejs npm
  ```
- 音频：PipeWire 默认，`pipewire-pulse` 兼容层已内置，行为与 PulseAudio 一致
- glibc 2.39，无版本限制
- 打包产物：推荐 `.deb`

### 统一策略

- Electron 版本锁定 **28.x**，三个系统全部支持
- 音频捕获统一使用 Electron Renderer 的 `getUserMedia`，不直接调用 ALSA/PulseAudio
- 打包同时输出 AppImage（通用）和 `.deb`（Ubuntu 专用）

---

## 5. Live2D 渲染与动作控制

### 核心库

- `pixi.js` — WebGL 渲染引擎
- `pixi-live2d-display` — Live2D Cubism 4 SDK 封装

### 模型资源结构

```
resources/models/
└── character/
    ├── character.model3.json   # 模型描述文件
    ├── character.moc3          # 模型数据
    ├── character.physics3.json # 物理模拟
    ├── textures/               # 贴图
    ├── motions/                # 动作文件 (.motion3.json)
    └── expressions/            # 表情文件 (.exp3.json)
```

初始使用 Cubism 官方示例模型（Haru、Natori 等），License 允许免费非商业使用。

### IPC 消息协议

Main Process → Renderer：

```typescript
// 表情切换
{ type: 'expression', name: 'happy' | 'sad' | 'surprised' | ... }

// 动作播放
{ type: 'motion', group: 'Idle' | 'TapBody' | 'Speak', index: number }

// 口型同步（实时，每帧）
{ type: 'lipsync', volume: number }  // 0.0 ~ 1.0

// 说话状态
{ type: 'speak_start' }
{ type: 'speak_end' }
```

### 口型同步方案

- TTS 返回音频后，Renderer 用 Web Audio API 的 `AnalyserNode` 实时提取音量 RMS
- 将音量值映射到 Live2D 的 `ParamMouthOpenY` 参数（0.0 ~ 1.0）
- 不做音素分析，简单音量驱动，效果足够自然

---

## 6. 音频管道

### 录音流程

```
Renderer Process
└── getUserMedia({ audio: true })
    └── MediaRecorder (WebM/Opus)
        └── IPC (arraybuffer) → Main Process
            └── ffmpeg-static 转码为 WAV (16kHz, mono)
                └── STT Adapter → 文字
```

### VAD（静音检测）

- 录音时实时计算音量 RMS
- 连续 1.5 秒低于阈值 → 停止录音，触发 STT
- 阈值默认值 0.01，可在 `config.json` 配置

### TTS 播放流程

```
Main Process
└── TTS Adapter → WAV Buffer
    └── IPC → Renderer Process
        └── Web Audio API
            ├── AudioContext.decodeAudioData
            ├── AnalyserNode → 实时音量 → 口型同步
            └── AudioBufferSourceNode.play()
```

### 打断机制

1. 用户说话时（RMS 超过阈值）
2. 立即停止当前 TTS 播放（`AudioBufferSourceNode.stop()`）
3. 发送 `speak_end` IPC → Live2D 切回 Idle 动作
4. 重新开始录音流程

---

## 7. 服务 Adapter 层

### 目录结构

```
src/main/adapters/
├── stt/
│   ├── base.ts          # 统一接口
│   ├── openai.ts        # OpenAI 兼容接口
│   └── custom.ts        # 自定义 HTTP 接口
├── tts/
│   ├── base.ts
│   ├── openai.ts
│   └── custom.ts
└── llm/
    ├── base.ts
    ├── openai.ts
    └── custom.ts
```

### 统一接口定义

```typescript
interface STTAdapter {
  transcribe(audioBuffer: Buffer): Promise<string>
}

interface TTSAdapter {
  synthesize(text: string): Promise<Buffer>  // 返回 WAV Buffer
}

interface LLMAdapter {
  chat(messages: { role: string; content: string }[]): Promise<string>
}
```

### 配置文件（`config.json`）

```json
{
  "stt": {
    "type": "openai_compatible",
    "url": "http://localhost:9000/v1/audio/transcriptions",
    "model": "whisper-1"
  },
  "tts": {
    "type": "custom",
    "url": "http://localhost:8080/tts",
    "method": "POST",
    "body_template": { "text": "{{text}}", "speaker": "default" },
    "response_type": "audio/wav"
  },
  "llm": {
    "type": "openai_compatible",
    "url": "http://localhost:11434/v1/chat/completions",
    "model": "qwen2.5"
  }
}
```

`body_template` 支持 `{{text}}` 占位符，无需改代码即可适配不同自定义接口。

---

## 8. 打包与分发

### 构建工具

`electron-builder`

### 输出产物

```
dist/
├── virt-person-1.0.0.AppImage     # 通用，三个 Ubuntu 版本全支持
└── virt-person_1.0.0_amd64.deb   # Ubuntu 专用
```

### 依赖打包策略

| 依赖 | 打包方式 |
|------|---------|
| Node.js 运行时 | Electron 内置 |
| pixi-live2d-display | npm 依赖，打包进 asar |
| Live2D Cubism Core (.wasm) | extraResources |
| Live2D 模型文件 | extraResources/models/ |
| ffmpeg | ffmpeg-static npm 包（含 Linux 二进制） |

### Cubism Core 说明

`pixi-live2d-display` 需要 Live2D 官方 Cubism Core 运行时（`.wasm` 文件），需从 Live2D 官网单独下载。License 允许免费非商业使用。

---

## 9. 项目目录结构

```
07_virt_person/
├── src/
│   ├── main/                    # Main Process
│   │   ├── index.ts             # 入口
│   │   ├── audio.ts             # 音频管道
│   │   ├── dialog.ts            # 对话流程编排
│   │   └── adapters/            # 服务 Adapter 层
│   └── renderer/                # Renderer Process
│       ├── index.html
│       ├── index.ts             # 入口
│       ├── live2d.ts            # Live2D 渲染控制
│       └── audio-player.ts      # TTS 播放 + 口型同步
├── resources/
│   ├── models/                  # Live2D 模型
│   └── cubism-core/             # Cubism Core .wasm
├── config.json                  # 服务配置
├── package.json
├── tsconfig.json
└── electron-builder.yml
```

---

## 10. 对话完整流程

```
1. 应用启动 → 加载 Live2D 模型 → 播放 Idle 动作
2. 用户按下说话键（或自动 VAD）→ 开始录音
3. 静音检测触发 → 停止录音 → 发送音频给 STT
4. STT 返回文字 → 发送给 LLM
5. LLM 返回回复 → 发送给 TTS
6. TTS 返回音频 → 触发 speak_start → 播放音频 + 口型同步
7. 音频播放完毕 → 触发 speak_end → 切回 Idle
8. 回到步骤 2
```

---

## 11. 待定事项

- Live2D 模型具体选型（Cubism 官方示例 or 社区模型）
- TTS / STT / LLM 服务的具体接口参数（部署后填入 config.json）
- 是否需要 GUI 配置界面（当前方案为手动编辑 config.json）
