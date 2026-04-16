# 虚拟人物桌面应用 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个运行在 Ubuntu 桌面的 Electron 应用，展示 Live2D 动漫角色，通过本地 STT/TTS/LLM 服务实现语音对话，角色有口型同步和表情动作响应。

**Architecture:** Electron 28 双进程架构——Main Process 负责调用本地 STT/TTS/LLM HTTP 服务，Renderer Process 负责 Live2D 渲染和音频 I/O，两者通过 IPC 通信。外部服务通过 Adapter 层对接，支持 OpenAI 兼容接口和自定义 HTTP 接口，配置文件驱动。

**Tech Stack:** Electron 28, TypeScript, pixi.js, pixi-live2d-display, ffmpeg-static, electron-builder, Vitest

---

## 文件结构总览

```
07_virt_person/
├── src/
│   ├── main/
│   │   ├── index.ts                    # Main Process 入口，窗口创建
│   │   ├── config.ts                   # 配置文件加载与验证
│   │   ├── dialog.ts                   # 对话流程编排（STT→LLM→TTS）
│   │   ├── audio.ts                    # 音频转码（WebM→WAV via ffmpeg）
│   │   ├── ipc-handlers.ts             # IPC 事件注册
│   │   └── adapters/
│   │       ├── stt/
│   │       │   ├── base.ts             # STTAdapter 接口
│   │       │   ├── openai.ts           # OpenAI 兼容 STT
│   │       │   └── custom.ts           # 自定义 HTTP STT
│   │       ├── tts/
│   │       │   ├── base.ts             # TTSAdapter 接口
│   │       │   ├── openai.ts           # OpenAI 兼容 TTS
│   │       │   └── custom.ts           # 自定义 HTTP TTS
│   │       └── llm/
│   │           ├── base.ts             # LLMAdapter 接口
│   │           ├── openai.ts           # OpenAI 兼容 LLM
│   │           └── custom.ts           # 自定义 HTTP LLM
│   └── renderer/
│       ├── index.html                  # 渲染进程 HTML 入口
│       ├── index.ts                    # 渲染进程入口，IPC 监听
│       ├── live2d.ts                   # Live2D 模型加载与控制
│       ├── recorder.ts                 # 麦克风录音 + VAD
│       └── audio-player.ts            # TTS 播放 + 口型同步
├── resources/
│   ├── models/                         # Live2D 模型（用户自备）
│   └── cubism-core/                    # CubismSdkForWeb-4-r.7 的 .js 文件
├── tests/
│   ├── main/
│   │   ├── config.test.ts
│   │   ├── audio.test.ts
│   │   └── adapters/
│   │       ├── stt.test.ts
│   │       ├── tts.test.ts
│   │       └── llm.test.ts
│   └── renderer/
│       └── live2d.test.ts
├── config.json                         # 服务配置（用户填写）
├── config.example.json                 # 配置示例
├── package.json
├── tsconfig.json
├── tsconfig.main.json
├── tsconfig.renderer.json
├── vite.renderer.config.ts
├── vite.main.config.ts
└── electron-builder.yml
```

---

## Task 1: 项目脚手架与构建配置

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.main.json`
- Create: `tsconfig.renderer.json`
- Create: `vite.main.config.ts`
- Create: `vite.renderer.config.ts`
- Create: `electron-builder.yml`

- [ ] **Step 1: 初始化 npm 项目**

```bash
cd /home/jaredluo/01_repo/07_virt_person
npm init -y
```

- [ ] **Step 2: 安装依赖**

```bash
npm install --save-dev electron@28 typescript vite electron-builder vitest
npm install pixi.js@7 pixi-live2d-display@0.4 ffmpeg-static
npm install --save-dev @types/node
```

- [ ] **Step 3: 写 package.json**

```json
{
  "name": "virt-person",
  "version": "1.0.0",
  "main": "dist/main/index.js",
  "scripts": {
    "dev:main": "vite build --config vite.main.config.ts --watch",
    "dev:renderer": "vite --config vite.renderer.config.ts",
    "build": "vite build --config vite.main.config.ts && vite build --config vite.renderer.config.ts",
    "electron": "electron dist/main/index.js",
    "test": "vitest run",
    "pack": "npm run build && electron-builder"
  }
}
```

- [ ] **Step 4: 写 tsconfig.json（基础）**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

- [ ] **Step 5: 写 tsconfig.main.json**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "dist/main",
    "types": ["node"]
  },
  "include": ["src/main/**/*"]
}
```

- [ ] **Step 6: 写 tsconfig.renderer.json**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "dist/renderer",
    "lib": ["ES2020", "DOM"]
  },
  "include": ["src/renderer/**/*"]
}
```

- [ ] **Step 7: 写 vite.main.config.ts**

```typescript
import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/main/index.ts'),
      formats: ['cjs'],
      fileName: () => 'index.js'
    },
    outDir: 'dist/main',
    rollupOptions: {
      external: ['electron', 'ffmpeg-static', 'fs', 'path', 'child_process', 'os']
    }
  }
})
```

- [ ] **Step 8: 写 vite.renderer.config.ts**

```typescript
import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  build: {
    outDir: resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true
  }
})
```

- [ ] **Step 9: 写 electron-builder.yml**

```yaml
appId: com.virtperson.app
productName: virt-person
directories:
  output: dist/release
files:
  - dist/main/**
  - dist/renderer/**
extraResources:
  - from: resources/
    to: resources/
  - from: config.json
    to: config.json
linux:
  target:
    - AppImage
    - deb
  category: Utility
```

- [ ] **Step 10: 创建目录结构**

```bash
mkdir -p src/main/adapters/stt src/main/adapters/tts src/main/adapters/llm
mkdir -p src/renderer
mkdir -p resources/models resources/cubism-core
mkdir -p tests/main/adapters tests/renderer
```

- [ ] **Step 11: Commit**

```bash
git init
git add package.json tsconfig*.json vite.*.config.ts electron-builder.yml
git commit -m "chore: project scaffold and build config"
```

---

## Task 2: 配置文件加载模块

**Files:**
- Create: `src/main/config.ts`
- Create: `config.example.json`
- Test: `tests/main/config.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// tests/main/config.test.ts
import { describe, it, expect } from 'vitest'
import { loadConfig, AppConfig } from '../../src/main/config'
import { writeFileSync, unlinkSync } from 'fs'
import { resolve } from 'path'

const TMP = resolve(__dirname, 'tmp-config.json')

describe('loadConfig', () => {
  it('loads valid config', () => {
    const cfg = {
      stt: { type: 'openai_compatible', url: 'http://localhost:9000/v1/audio/transcriptions', model: 'whisper-1' },
      tts: { type: 'custom', url: 'http://localhost:8080/tts', method: 'POST', body_template: { text: '{{text}}' }, response_type: 'audio/wav' },
      llm: { type: 'openai_compatible', url: 'http://localhost:11434/v1/chat/completions', model: 'qwen2.5' },
      vad: { silence_threshold: 0.01, silence_duration_ms: 1500 }
    }
    writeFileSync(TMP, JSON.stringify(cfg))
    const result = loadConfig(TMP)
    expect(result.stt.url).toBe('http://localhost:9000/v1/audio/transcriptions')
    expect(result.vad.silence_threshold).toBe(0.01)
    unlinkSync(TMP)
  })

  it('throws on missing stt config', () => {
    writeFileSync(TMP, JSON.stringify({ tts: {}, llm: {} }))
    expect(() => loadConfig(TMP)).toThrow('stt')
    unlinkSync(TMP)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run tests/main/config.test.ts
```
Expected: FAIL — `loadConfig` not found

- [ ] **Step 3: 实现 config.ts**

```typescript
// src/main/config.ts
import { readFileSync } from 'fs'

export interface STTConfig {
  type: 'openai_compatible' | 'custom'
  url: string
  model?: string
  method?: string
  body_template?: Record<string, unknown>
  response_type?: string
}

export interface TTSConfig {
  type: 'openai_compatible' | 'custom'
  url: string
  model?: string
  method?: string
  body_template?: Record<string, unknown>
  response_type?: string
}

export interface LLMConfig {
  type: 'openai_compatible' | 'custom'
  url: string
  model?: string
  method?: string
  body_template?: Record<string, unknown>
}

export interface VADConfig {
  silence_threshold: number
  silence_duration_ms: number
}

export interface AppConfig {
  stt: STTConfig
  tts: TTSConfig
  llm: LLMConfig
  vad: VADConfig
}

export function loadConfig(path: string): AppConfig {
  const raw = JSON.parse(readFileSync(path, 'utf-8'))
  if (!raw.stt) throw new Error('Missing stt config')
  if (!raw.tts) throw new Error('Missing tts config')
  if (!raw.llm) throw new Error('Missing llm config')
  return {
    stt: raw.stt,
    tts: raw.tts,
    llm: raw.llm,
    vad: raw.vad ?? { silence_threshold: 0.01, silence_duration_ms: 1500 }
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run tests/main/config.test.ts
```
Expected: PASS

- [ ] **Step 5: 写 config.example.json**

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
  },
  "vad": {
    "silence_threshold": 0.01,
    "silence_duration_ms": 1500
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add src/main/config.ts config.example.json tests/main/config.test.ts
git commit -m "feat: config loader with validation"
```

---

## Task 3: Adapter 接口定义与 OpenAI 兼容实现

**Files:**
- Create: `src/main/adapters/stt/base.ts`
- Create: `src/main/adapters/stt/openai.ts`
- Create: `src/main/adapters/tts/base.ts`
- Create: `src/main/adapters/tts/openai.ts`
- Create: `src/main/adapters/llm/base.ts`
- Create: `src/main/adapters/llm/openai.ts`
- Test: `tests/main/adapters/stt.test.ts`
- Test: `tests/main/adapters/tts.test.ts`
- Test: `tests/main/adapters/llm.test.ts`

- [ ] **Step 1: 写 STT 接口**

```typescript
// src/main/adapters/stt/base.ts
export interface STTAdapter {
  transcribe(audioBuffer: Buffer): Promise<string>
}
```

- [ ] **Step 2: 写 TTS 接口**

```typescript
// src/main/adapters/tts/base.ts
export interface TTSAdapter {
  synthesize(text: string): Promise<Buffer>
}
```

- [ ] **Step 3: 写 LLM 接口**

```typescript
// src/main/adapters/llm/base.ts
export interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LLMAdapter {
  chat(messages: Message[]): Promise<string>
}
```

- [ ] **Step 4: 写 STT 测试（mock fetch）**

```typescript
// tests/main/adapters/stt.test.ts
import { describe, it, expect, vi } from 'vitest'
import { OpenAISTTAdapter } from '../../../src/main/adapters/stt/openai'

vi.stubGlobal('fetch', vi.fn())

describe('OpenAISTTAdapter', () => {
  it('sends audio as form-data and returns transcript', async () => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: 'hello world' })
    } as Response)

    const adapter = new OpenAISTTAdapter({ url: 'http://localhost:9000/v1/audio/transcriptions', model: 'whisper-1' })
    const result = await adapter.transcribe(Buffer.from('fake-audio'))
    expect(result).toBe('hello world')
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:9000/v1/audio/transcriptions',
      expect.objectContaining({ method: 'POST' })
    )
  })
})
```

- [ ] **Step 5: 运行 STT 测试确认失败**

```bash
npx vitest run tests/main/adapters/stt.test.ts
```
Expected: FAIL

- [ ] **Step 6: 实现 OpenAI STT Adapter**

```typescript
// src/main/adapters/stt/openai.ts
import { STTAdapter } from './base'
import { STTConfig } from '../../config'

export class OpenAISTTAdapter implements STTAdapter {
  constructor(private cfg: Pick<STTConfig, 'url' | 'model'>) {}

  async transcribe(audioBuffer: Buffer): Promise<string> {
    const form = new FormData()
    form.append('file', new Blob([audioBuffer], { type: 'audio/wav' }), 'audio.wav')
    if (this.cfg.model) form.append('model', this.cfg.model)

    const res = await fetch(this.cfg.url, { method: 'POST', body: form })
    if (!res.ok) throw new Error(`STT error: ${res.status}`)
    const data = await res.json() as { text: string }
    return data.text
  }
}
```

- [ ] **Step 7: 写 TTS 测试**

```typescript
// tests/main/adapters/tts.test.ts
import { describe, it, expect, vi } from 'vitest'
import { OpenAITTSAdapter } from '../../../src/main/adapters/tts/openai'

vi.stubGlobal('fetch', vi.fn())

describe('OpenAITTSAdapter', () => {
  it('sends text and returns audio buffer', async () => {
    const fakeAudio = Buffer.from('fake-wav')
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => fakeAudio.buffer
    } as unknown as Response)

    const adapter = new OpenAITTSAdapter({ url: 'http://localhost:8080/v1/audio/speech', model: 'tts-1' })
    const result = await adapter.synthesize('hello')
    expect(result).toBeInstanceOf(Buffer)
    expect(result.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 8: 实现 OpenAI TTS Adapter**

```typescript
// src/main/adapters/tts/openai.ts
import { TTSAdapter } from './base'
import { TTSConfig } from '../../config'

export class OpenAITTSAdapter implements TTSAdapter {
  constructor(private cfg: Pick<TTSConfig, 'url' | 'model'>) {}

  async synthesize(text: string): Promise<Buffer> {
    const res = await fetch(this.cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.cfg.model ?? 'tts-1', input: text, voice: 'alloy' })
    })
    if (!res.ok) throw new Error(`TTS error: ${res.status}`)
    return Buffer.from(await res.arrayBuffer())
  }
}
```

- [ ] **Step 9: 写 LLM 测试**

```typescript
// tests/main/adapters/llm.test.ts
import { describe, it, expect, vi } from 'vitest'
import { OpenAILLMAdapter } from '../../../src/main/adapters/llm/openai'

vi.stubGlobal('fetch', vi.fn())

describe('OpenAILLMAdapter', () => {
  it('sends messages and returns reply', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'hi there' } }]
      })
    } as Response)

    const adapter = new OpenAILLMAdapter({ url: 'http://localhost:11434/v1/chat/completions', model: 'qwen2.5' })
    const result = await adapter.chat([{ role: 'user', content: 'hello' }])
    expect(result).toBe('hi there')
  })
})
```

- [ ] **Step 10: 实现 OpenAI LLM Adapter**

```typescript
// src/main/adapters/llm/openai.ts
import { LLMAdapter, Message } from './base'
import { LLMConfig } from '../../config'

export class OpenAILLMAdapter implements LLMAdapter {
  constructor(private cfg: Pick<LLMConfig, 'url' | 'model'>) {}

  async chat(messages: Message[]): Promise<string> {
    const res = await fetch(this.cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.cfg.model, messages })
    })
    if (!res.ok) throw new Error(`LLM error: ${res.status}`)
    const data = await res.json() as { choices: { message: { content: string } }[] }
    return data.choices[0].message.content
  }
}
```

- [ ] **Step 11: 运行所有 adapter 测试**

```bash
npx vitest run tests/main/adapters/
```
Expected: 3 test files, all PASS

- [ ] **Step 12: Commit**

```bash
git add src/main/adapters/ tests/main/adapters/
git commit -m "feat: STT/TTS/LLM adapter interfaces and OpenAI-compatible implementations"
```

---

## Task 4: 自定义 HTTP Adapter 实现

**Files:**
- Create: `src/main/adapters/stt/custom.ts`
- Create: `src/main/adapters/tts/custom.ts`
- Create: `src/main/adapters/llm/custom.ts`
- Create: `src/main/adapters/factory.ts`

- [ ] **Step 1: 实现 Custom STT Adapter**

```typescript
// src/main/adapters/stt/custom.ts
import { STTAdapter } from './base'
import { STTConfig } from '../../config'

function renderTemplate(template: Record<string, unknown>, text: string): Record<string, unknown> {
  return JSON.parse(JSON.stringify(template).replace(/\{\{text\}\}/g, text))
}

export class CustomSTTAdapter implements STTAdapter {
  constructor(private cfg: STTConfig) {}

  async transcribe(audioBuffer: Buffer): Promise<string> {
    // Custom STT: POST multipart with audio file
    const form = new FormData()
    form.append('file', new Blob([audioBuffer], { type: 'audio/wav' }), 'audio.wav')
    if (this.cfg.body_template) {
      for (const [k, v] of Object.entries(this.cfg.body_template)) {
        if (k !== 'file') form.append(k, String(v))
      }
    }
    const res = await fetch(this.cfg.url, { method: this.cfg.method ?? 'POST', body: form })
    if (!res.ok) throw new Error(`STT error: ${res.status}`)
    const data = await res.json() as { text?: string; result?: string; transcript?: string }
    return data.text ?? data.result ?? data.transcript ?? ''
  }
}
```

- [ ] **Step 2: 实现 Custom TTS Adapter**

```typescript
// src/main/adapters/tts/custom.ts
import { TTSAdapter } from './base'
import { TTSConfig } from '../../config'

function renderTemplate(template: Record<string, unknown>, text: string): Record<string, unknown> {
  return JSON.parse(JSON.stringify(template).replace(/\{\{text\}\}/g, text))
}

export class CustomTTSAdapter implements TTSAdapter {
  constructor(private cfg: TTSConfig) {}

  async synthesize(text: string): Promise<Buffer> {
    const body = this.cfg.body_template
      ? renderTemplate(this.cfg.body_template, text)
      : { text }

    const res = await fetch(this.cfg.url, {
      method: this.cfg.method ?? 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!res.ok) throw new Error(`TTS error: ${res.status}`)
    return Buffer.from(await res.arrayBuffer())
  }
}
```

- [ ] **Step 3: 实现 Custom LLM Adapter**

```typescript
// src/main/adapters/llm/custom.ts
import { LLMAdapter, Message } from './base'
import { LLMConfig } from '../../config'

function renderTemplate(template: Record<string, unknown>, text: string): Record<string, unknown> {
  return JSON.parse(JSON.stringify(template).replace(/\{\{text\}\}/g, text))
}

export class CustomLLMAdapter implements LLMAdapter {
  constructor(private cfg: LLMConfig) {}

  async chat(messages: Message[]): Promise<string> {
    const lastUserMsg = messages.filter(m => m.role === 'user').pop()?.content ?? ''
    const body = this.cfg.body_template
      ? renderTemplate(this.cfg.body_template, lastUserMsg)
      : { messages }

    const res = await fetch(this.cfg.url, {
      method: this.cfg.method ?? 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!res.ok) throw new Error(`LLM error: ${res.status}`)
    const data = await res.json() as { text?: string; response?: string; choices?: { message: { content: string } }[] }
    return data.text ?? data.response ?? data.choices?.[0]?.message?.content ?? ''
  }
}
```

- [ ] **Step 4: 实现 Adapter Factory**

```typescript
// src/main/adapters/factory.ts
import { AppConfig } from '../config'
import { STTAdapter } from './stt/base'
import { TTSAdapter } from './tts/base'
import { LLMAdapter } from './llm/base'
import { OpenAISTTAdapter } from './stt/openai'
import { CustomSTTAdapter } from './stt/custom'
import { OpenAITTSAdapter } from './tts/openai'
import { CustomTTSAdapter } from './tts/custom'
import { OpenAILLMAdapter } from './llm/openai'
import { CustomLLMAdapter } from './llm/custom'

export function createAdapters(cfg: AppConfig): {
  stt: STTAdapter
  tts: TTSAdapter
  llm: LLMAdapter
} {
  const stt: STTAdapter = cfg.stt.type === 'openai_compatible'
    ? new OpenAISTTAdapter(cfg.stt)
    : new CustomSTTAdapter(cfg.stt)

  const tts: TTSAdapter = cfg.tts.type === 'openai_compatible'
    ? new OpenAITTSAdapter(cfg.tts)
    : new CustomTTSAdapter(cfg.tts)

  const llm: LLMAdapter = cfg.llm.type === 'openai_compatible'
    ? new OpenAILLMAdapter(cfg.llm)
    : new CustomLLMAdapter(cfg.llm)

  return { stt, tts, llm }
}
```

- [ ] **Step 5: Commit**

```bash
git add src/main/adapters/
git commit -m "feat: custom HTTP adapters and adapter factory"
```

---

## Task 5: 音频转码模块

**Files:**
- Create: `src/main/audio.ts`
- Test: `tests/main/audio.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// tests/main/audio.test.ts
import { describe, it, expect } from 'vitest'
import { convertToWav } from '../../src/main/audio'
import { readFileSync } from 'fs'
import { resolve } from 'path'

describe('convertToWav', () => {
  it('returns a Buffer', async () => {
    // 用一个最小的 WebM 文件（或直接用 WAV 测试转码路径）
    // 这里用空 buffer 测试函数签名，实际转码需要真实音频
    const input = Buffer.alloc(100)
    // 期望抛出错误（空 buffer 不是合法音频），但函数本身存在
    await expect(convertToWav(input)).rejects.toThrow()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run tests/main/audio.test.ts
```
Expected: FAIL — `convertToWav` not found

- [ ] **Step 3: 实现 audio.ts**

```typescript
// src/main/audio.ts
import { execFile } from 'child_process'
import { promisify } from 'util'
import { writeFileSync, readFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import ffmpegPath from 'ffmpeg-static'

const execFileAsync = promisify(execFile)

export async function convertToWav(inputBuffer: Buffer): Promise<Buffer> {
  const tmpIn = join(tmpdir(), `vp-in-${Date.now()}.webm`)
  const tmpOut = join(tmpdir(), `vp-out-${Date.now()}.wav`)

  try {
    writeFileSync(tmpIn, inputBuffer)
    await execFileAsync(ffmpegPath!, [
      '-y', '-i', tmpIn,
      '-ar', '16000',
      '-ac', '1',
      '-f', 'wav',
      tmpOut
    ])
    return readFileSync(tmpOut)
  } finally {
    try { unlinkSync(tmpIn) } catch {}
    try { unlinkSync(tmpOut) } catch {}
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run tests/main/audio.test.ts
```
Expected: PASS（空 buffer 抛出 ffmpeg 错误，符合预期）

- [ ] **Step 5: Commit**

```bash
git add src/main/audio.ts tests/main/audio.test.ts
git commit -m "feat: audio transcoding WebM to WAV via ffmpeg"
```

---

## Task 6: Main Process 入口与 IPC 处理

**Files:**
- Create: `src/main/index.ts`
- Create: `src/main/dialog.ts`
- Create: `src/main/ipc-handlers.ts`

- [ ] **Step 1: 实现 dialog.ts（对话流程编排）**

```typescript
// src/main/dialog.ts
import { STTAdapter } from './adapters/stt/base'
import { TTSAdapter } from './adapters/tts/base'
import { LLMAdapter, Message } from './adapters/llm/base'
import { convertToWav } from './audio'

export class DialogManager {
  private history: Message[] = []

  constructor(
    private stt: STTAdapter,
    private tts: TTSAdapter,
    private llm: LLMAdapter
  ) {}

  async processAudio(webmBuffer: Buffer): Promise<Buffer> {
    const wav = await convertToWav(webmBuffer)
    const text = await this.stt.transcribe(wav)
    if (!text.trim()) throw new Error('Empty transcription')

    this.history.push({ role: 'user', content: text })
    const reply = await this.llm.chat(this.history)
    this.history.push({ role: 'assistant', content: reply })

    const audio = await this.tts.synthesize(reply)
    return audio
  }

  clearHistory(): void {
    this.history = []
  }
}
```

- [ ] **Step 2: 实现 ipc-handlers.ts**

```typescript
// src/main/ipc-handlers.ts
import { ipcMain, IpcMainEvent } from 'electron'
import { DialogManager } from './dialog'

export function registerIpcHandlers(dialog: DialogManager): void {
  ipcMain.on('audio:chunk', async (event: IpcMainEvent, data: ArrayBuffer) => {
    const buffer = Buffer.from(data)
    try {
      const audioBuffer = await dialog.processAudio(buffer)
      event.reply('tts:play', audioBuffer.buffer.slice(
        audioBuffer.byteOffset,
        audioBuffer.byteOffset + audioBuffer.byteLength
      ))
      event.reply('live2d:speak_start')
    } catch (err) {
      console.error('Dialog error:', err)
      event.reply('dialog:error', String(err))
    }
  })

  ipcMain.on('dialog:clear', () => {
    dialog.clearHistory()
  })
}
```

- [ ] **Step 3: 实现 Main Process 入口**

```typescript
// src/main/index.ts
import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { loadConfig } from './config'
import { createAdapters } from './adapters/factory'
import { DialogManager } from './dialog'
import { registerIpcHandlers } from './ipc-handlers'

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, 'preload.js')
    }
  })

  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  const configPath = join(process.resourcesPath ?? __dirname, '../../config.json')
  const cfg = loadConfig(configPath)
  const { stt, tts, llm } = createAdapters(cfg)
  const dialog = new DialogManager(stt, tts, llm)
  registerIpcHandlers(dialog)
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 4: 创建 preload.ts**

```typescript
// src/main/preload.ts
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  sendAudio: (buffer: ArrayBuffer) => ipcRenderer.send('audio:chunk', buffer),
  clearDialog: () => ipcRenderer.send('dialog:clear'),
  onTtsPlay: (cb: (buf: ArrayBuffer) => void) =>
    ipcRenderer.on('tts:play', (_e, buf) => cb(buf)),
  onSpeakStart: (cb: () => void) =>
    ipcRenderer.on('live2d:speak_start', cb),
  onDialogError: (cb: (msg: string) => void) =>
    ipcRenderer.on('dialog:error', (_e, msg) => cb(msg))
})
```

- [ ] **Step 5: Commit**

```bash
git add src/main/index.ts src/main/dialog.ts src/main/ipc-handlers.ts src/main/preload.ts
git commit -m "feat: main process entry, dialog manager, IPC handlers"
```

---

## Task 7: Renderer — Live2D 渲染

**Files:**
- Create: `src/renderer/index.html`
- Create: `src/renderer/index.ts`
- Create: `src/renderer/live2d.ts`

- [ ] **Step 1: 写 index.html**

```html
<!-- src/renderer/index.html -->
<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Virtual Person</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #1a1a2e; overflow: hidden; }
    #canvas-container { width: 100vw; height: 100vh; }
    #status { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
      color: #fff; font-family: sans-serif; font-size: 14px; opacity: 0.7; }
  </style>
</head>
<body>
  <div id="canvas-container"></div>
  <div id="status">按住空格键说话</div>
  <script type="module" src="./index.ts"></script>
</body>
</html>
```

- [ ] **Step 2: 实现 live2d.ts**

```typescript
// src/renderer/live2d.ts
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

    // 居中并缩放适配窗口
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
    // volume: 0.0 ~ 1.0 → ParamMouthOpenY
    this.model.internalModel.coreModel.setParameterValueById(
      'ParamMouthOpenY',
      Math.min(1, volume * 2)
    )
  }
}
```

- [ ] **Step 3: 实现 renderer/index.ts**

```typescript
// src/renderer/index.ts
import { Live2DController } from './live2d'
import { AudioPlayer } from './audio-player'
import { Recorder } from './recorder'

declare global {
  interface Window {
    electronAPI: {
      sendAudio: (buf: ArrayBuffer) => void
      clearDialog: () => void
      onTtsPlay: (cb: (buf: ArrayBuffer) => void) => void
      onSpeakStart: (cb: () => void) => void
      onDialogError: (cb: (msg: string) => void) => void
    }
  }
}

async function main() {
  const container = document.getElementById('canvas-container')!
  const statusEl = document.getElementById('status')!

  const live2d = new Live2DController(container)
  // 模型路径从 resources 目录加载
  await live2d.loadModel('./resources/models/Haru/Haru.model3.json')

  const player = new AudioPlayer((volume) => live2d.setLipSync(volume))
  const recorder = new Recorder({ silenceThreshold: 0.01, silenceDurationMs: 1500 })

  // 录音完成 → 发给 Main Process
  recorder.onAudioReady((buffer) => {
    statusEl.textContent = '识别中...'
    window.electronAPI.sendAudio(buffer)
  })

  // TTS 音频回来 → 播放
  window.electronAPI.onTtsPlay((buf) => {
    statusEl.textContent = '说话中...'
    live2d.playMotion('Speak', 0)
    player.play(buf, () => {
      statusEl.textContent = '按住空格键说话'
      live2d.playMotion('Idle', 0)
      live2d.setLipSync(0)
    })
  })

  window.electronAPI.onSpeakStart(() => {
    live2d.setExpression('happy')
  })

  window.electronAPI.onDialogError((msg) => {
    statusEl.textContent = `错误: ${msg}`
    live2d.playMotion('Idle', 0)
  })

  // 空格键触发录音
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.repeat) {
      recorder.start()
      statusEl.textContent = '录音中...'
      live2d.setExpression('normal')
    }
  })
  document.addEventListener('keyup', (e) => {
    if (e.code === 'Space') recorder.stop()
  })
}

main().catch(console.error)
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/
git commit -m "feat: renderer Live2D controller and main entry"
```

---

## Task 8: Renderer — 录音与 TTS 播放

**Files:**
- Create: `src/renderer/recorder.ts`
- Create: `src/renderer/audio-player.ts`

- [ ] **Step 1: 实现 recorder.ts（麦克风录音 + VAD）**

```typescript
// src/renderer/recorder.ts
interface RecorderOptions {
  silenceThreshold: number
  silenceDurationMs: number
}

export class Recorder {
  private mediaRecorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private analyser: AnalyserNode | null = null
  private silenceTimer: ReturnType<typeof setTimeout> | null = null
  private audioCtx: AudioContext | null = null
  private onReady: ((buf: ArrayBuffer) => void) | null = null

  constructor(private opts: RecorderOptions) {}

  onAudioReady(cb: (buf: ArrayBuffer) => void): void {
    this.onReady = cb
  }

  async start(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    this.audioCtx = new AudioContext()
    const source = this.audioCtx.createMediaStreamSource(stream)
    this.analyser = this.audioCtx.createAnalyser()
    this.analyser.fftSize = 256
    source.connect(this.analyser)

    this.chunks = []
    this.mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data)
    }
    this.mediaRecorder.start(100)
    this.monitorSilence()
  }

  stop(): void {
    this.clearSilenceTimer()
    if (this.mediaRecorder?.state === 'recording') {
      this.mediaRecorder.onstop = async () => {
        const blob = new Blob(this.chunks, { type: 'audio/webm' })
        const buf = await blob.arrayBuffer()
        this.onReady?.(buf)
      }
      this.mediaRecorder.stop()
    }
    this.audioCtx?.close()
  }

  private monitorSilence(): void {
    if (!this.analyser) return
    const data = new Uint8Array(this.analyser.frequencyBinCount)

    const check = () => {
      if (!this.analyser || this.mediaRecorder?.state !== 'recording') return
      this.analyser.getByteTimeDomainData(data)
      const rms = Math.sqrt(data.reduce((s, v) => s + ((v - 128) / 128) ** 2, 0) / data.length)

      if (rms < this.opts.silenceThreshold) {
        if (!this.silenceTimer) {
          this.silenceTimer = setTimeout(() => this.stop(), this.opts.silenceDurationMs)
        }
      } else {
        this.clearSilenceTimer()
      }
      requestAnimationFrame(check)
    }
    requestAnimationFrame(check)
  }

  private clearSilenceTimer(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer)
      this.silenceTimer = null
    }
  }
}
```

- [ ] **Step 2: 实现 audio-player.ts（TTS 播放 + 口型同步）**

```typescript
// src/renderer/audio-player.ts
export class AudioPlayer {
  private ctx: AudioContext
  private analyser: AnalyserNode
  private currentSource: AudioBufferSourceNode | null = null
  private rafId: number | null = null

  constructor(private onVolume: (v: number) => void) {
    this.ctx = new AudioContext()
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 256
    this.analyser.connect(this.ctx.destination)
  }

  async play(buffer: ArrayBuffer, onEnd: () => void): Promise<void> {
    this.stop()
    const audioBuffer = await this.ctx.decodeAudioData(buffer.slice(0))
    const source = this.ctx.createBufferSource()
    source.buffer = audioBuffer
    source.connect(this.analyser)
    source.onended = () => {
      this.stopLipSync()
      onEnd()
    }
    source.start()
    this.currentSource = source
    this.startLipSync()
  }

  stop(): void {
    try { this.currentSource?.stop() } catch {}
    this.currentSource = null
    this.stopLipSync()
  }

  private startLipSync(): void {
    const data = new Uint8Array(this.analyser.frequencyBinCount)
    const tick = () => {
      this.analyser.getByteTimeDomainData(data)
      const rms = Math.sqrt(data.reduce((s, v) => s + ((v - 128) / 128) ** 2, 0) / data.length)
      this.onVolume(Math.min(1, rms * 4))
      this.rafId = requestAnimationFrame(tick)
    }
    this.rafId = requestAnimationFrame(tick)
  }

  private stopLipSync(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.onVolume(0)
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/recorder.ts src/renderer/audio-player.ts
git commit -m "feat: microphone recorder with VAD and TTS audio player with lip sync"
```

---

## Task 9: 集成测试与首次运行验证

**Files:**
- Modify: `package.json` (scripts)

- [ ] **Step 1: 运行全部单元测试**

```bash
npx vitest run
```
Expected: 全部 PASS

- [ ] **Step 2: 复制示例配置**

```bash
cp config.example.json config.json
# 编辑 config.json，填入你的本地服务地址
```

- [ ] **Step 3: 下载 Cubism Core**

从 Live2D 官网下载 CubismSdkForWeb，将 `Core/live2dcubismcore.min.js` 复制到：
```
resources/cubism-core/live2dcubismcore.min.js
```

在 `src/renderer/index.html` 的 `<head>` 中添加：
```html
<script src="./resources/cubism-core/live2dcubismcore.min.js"></script>
```

- [ ] **Step 4: 下载示例模型**

从 Live2D 官方示例下载 Haru 模型，放入：
```
resources/models/Haru/
```

- [ ] **Step 5: 构建并启动**

```bash
npm run build
npm run electron
```
Expected: 窗口打开，Live2D 角色显示，按空格键可录音对话

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "chore: integration verified, ready for packaging"
```

---

## Task 10: 打包与 Ubuntu 兼容性验证

**Files:**
- Modify: `electron-builder.yml`

- [ ] **Step 1: 完善 electron-builder.yml**

```yaml
appId: com.virtperson.app
productName: virt-person
directories:
  output: dist/release
files:
  - dist/main/**
  - dist/renderer/**
extraResources:
  - from: resources/
    to: resources/
  - from: config.json
    to: config.json
linux:
  target:
    - target: AppImage
      arch: [x64]
    - target: deb
      arch: [x64]
  category: Utility
  executableName: virt-person
```

- [ ] **Step 2: 打包**

```bash
npm run pack
```
Expected: `dist/release/` 下生成 `.AppImage` 和 `.deb`

- [ ] **Step 3: Ubuntu 20.04 验证清单**

在 20.04 环境执行：
```bash
# 安装系统依赖
sudo apt install libgbm1 libnss3 libatk-bridge2.0-0 libxss1

# 运行 AppImage
chmod +x virt-person-1.0.0.AppImage
./virt-person-1.0.0.AppImage
```
Expected: 应用正常启动

- [ ] **Step 4: Ubuntu 22.04 验证清单**

```bash
# 确认 pipewire-pulse 已安装
sudo apt install pipewire-pulse

# 运行 AppImage 或 deb
sudo dpkg -i virt-person_1.0.0_amd64.deb
virt-person
```
Expected: 应用正常启动，麦克风可用

- [ ] **Step 5: Ubuntu 24.04 验证清单**

```bash
# 直接运行 deb
sudo dpkg -i virt-person_1.0.0_amd64.deb
virt-person
```
Expected: 应用正常启动，PipeWire 音频正常

- [ ] **Step 6: Final commit**

```bash
git add electron-builder.yml
git commit -m "chore: packaging config for Ubuntu 20.04/22.04/24.04"
```
