# virt-person — 架构与方案设计

## 项目概述

Ubuntu 桌面虚拟人物应用：Live2D 动漫角色渲染 + 本地 STT/TTS/LLM 语音对话，支持口型同步和表情动作响应。目标平台：Ubuntu 20.04 / 22.04 / 24.04。

## 技术栈

| 层次 | 选型 |
|------|------|
| 桌面框架 | Electron 28.x |
| 语言 | TypeScript |
| Live2D 渲染 | pixi-live2d-display + pixi.js 7 |
| 音频转码 | ffmpeg-static（WebM → WAV） |
| 打包 | electron-builder（AppImage + deb） |
| 测试 | Vitest |
| 构建 | Vite（main/renderer 各一份配置） |

## 整体架构

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
         ▼ HTTP
┌─────────────────────────┐
│  本地服务（用户自备）     │
│  - STT 服务              │
│  - TTS 服务              │
│  - LLM 服务              │
└─────────────────────────┘
```

**核心原则：**
- Main Process 负责所有 I/O（HTTP 调用外部服务、音频转码）
- Renderer Process 只负责 Live2D 渲染和音频 I/O（录音/播放）
- 两者通过 Electron IPC 通信，职责严格分离
- 外部服务通过 Adapter 层对接，屏蔽接口差异，配置文件驱动

## 目录结构

```
src/
├── main/
│   ├── index.ts              # Main Process 入口，窗口创建
│   ├── config.ts             # 配置文件加载与验证
│   ├── dialog.ts             # 对话流程编排（STT→LLM→TTS）
│   ├── audio.ts              # 音频转码（WebM→WAV via ffmpeg）
│   ├── ipc-handlers.ts       # IPC 事件注册
│   └── adapters/
│       ├── stt/
│       │   ├── base.ts       # STTAdapter 接口
│       │   ├── openai.ts     # OpenAI 兼容 STT
│       │   └── custom.ts     # 自定义 HTTP STT
│       ├── tts/
│       │   ├── base.ts       # TTSAdapter 接口
│       │   ├── openai.ts     # OpenAI 兼容 TTS
│       │   └── custom.ts     # 自定义 HTTP TTS
│       └── llm/
│           ├── base.ts       # LLMAdapter 接口
│           ├── openai.ts     # OpenAI 兼容 LLM
│           └── custom.ts     # 自定义 HTTP LLM
└── renderer/
    ├── index.html            # 渲染进程 HTML 入口
    ├── index.ts              # 渲染进程入口，IPC 监听
    ├── live2d.ts             # Live2D 模型加载与控制
    ├── recorder.ts           # 麦克风录音 + VAD
    └── audio-player.ts       # TTS 播放 + 口型同步
```

## IPC 通信协议

| 事件 | 方向 | 说明 |
|------|------|------|
| `audio:data` | Renderer → Main | 录音完成，发送 WebM buffer |
| `dialog:response` | Main → Renderer | LLM 回复文字 |
| `tts:audio` | Main → Renderer | TTS 音频 buffer |
| `speak:start` | Main → Renderer | 开始播放，触发口型同步 |
| `speak:end` | Main → Renderer | 播放结束，切回 Idle |
| `live2d:expression` | Main → Renderer | 设置表情 |
| `live2d:motion` | Main → Renderer | 触发动作 |

## 对话完整流程

```
1. 应用启动 → 加载 Live2D 模型 → 播放 Idle 动作
2. 用户按住空格键 → 开始录音
3. 松开空格 / VAD 静音检测触发 → 停止录音 → 发送音频给 STT
4. STT 返回文字 → 发送给 LLM
5. LLM 返回回复 → 发送给 TTS
6. TTS 返回音频 → 触发 speak_start → 播放音频 + 口型同步
7. 音频播放完毕 → 触发 speak_end → 切回 Idle
8. 回到步骤 2
```

## Adapter 层设计

所有外部服务通过统一接口对接，支持两种类型：

- `openai_compatible`：标准 OpenAI HTTP 接口
- `custom`：自定义 HTTP 接口，通过 `body_template` 配置请求体，`{{text}}` 为占位符

配置文件 `config.json` 驱动 Adapter 选择，无需改代码切换服务。

## Ubuntu 兼容性

| 项目 | 20.04 | 22.04 | 24.04 |
|------|-------|-------|-------|
| 音频系统 | PulseAudio | PulseAudio/PipeWire | PipeWire |
| Node.js | 需 NodeSource 安装 18+ | 需 NodeSource 安装 18+ | 内置 18.x |
| Electron 28 | 需补装系统库 | 开箱即用 | 开箱即用 |

## 构建配置

- `vite.main.config.ts`：将 main 进程编译为 CommonJS，external 掉 electron 和 Node 内置模块
- `vite.renderer.config.ts`：将 renderer 打包为浏览器 bundle
- `electron-builder.yml`：打包为 AppImage + deb，resources/ 目录随包分发
