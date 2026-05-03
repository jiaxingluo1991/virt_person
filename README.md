# virt-person

Ubuntu 桌面虚拟人物应用。Live2D 动漫角色作为视觉前端，配合本地语音交互管道（唤醒词 + STT + LLM + TTS）实现完整的语音对话体验。

## 架构

```
interaction/ (Python)                    src/ (Electron)
├── 唤醒词检测 (sherpa-onnx)              ├── Live2D 渲染
├── VAD 录音 (silero-vad)    WebSocket   ├── 状态动画
├── STT (faster-whisper)   ──────────▶  ├── 口型同步
├── LLM (Ollama HTTP)                   └── 透明悬浮窗口
└── TTS (MeloTTS) + 音频播放
```

说「你好龙虾」唤醒 → Python 管道处理全部语音逻辑 → 通过 WebSocket 推送状态和振幅包络 → Electron 驱动 Live2D 动画和口型。

---

## 环境准备

### Node.js（Electron 前端）

```bash
# 安装 nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc

# 安装项目指定版本（读取 .nvmrc）
nvm install && nvm use

# 安装依赖
npm install
```

Ubuntu 系统库：
```bash
# Ubuntu 20.04
sudo apt install libgbm1 libnss3 libatk-bridge2.0-0 libxss1
# Ubuntu 22.04（PipeWire 用户）
sudo apt install pipewire-pulse
```

### Python（语音交互管道）

```bash
# 一键安装（推荐）
bash install.sh
```

或手动：
```bash
conda create -n virt-person python=3.10 -y
conda activate virt-person
pip install sounddevice numpy scipy sherpa-onnx faster-whisper openai websockets fastapi uvicorn
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu128  # 按实际 CUDA 版本调整
pip install git+https://github.com/myshell-ai/MeloTTS.git
python -m unidic download
```

系统依赖：
```bash
sudo apt install libportaudio2 mecab libmecab-dev mecab-ipadic-utf8
```

### 模型文件（手动下载）

```bash
# 唤醒词模型（sherpa-onnx）
cd interaction/models
wget https://github.com/k2-fsa/sherpa-onnx/releases/download/kws-models/sherpa-onnx-kws-zipformer-wenetspeech-3.3M-2024-01-01.tar.bz2
tar xf sherpa-onnx-kws-zipformer-wenetspeech-3.3M-2024-01-01.tar.bz2

# STT 模型（faster-whisper large-v3）
hf download Systran/faster-whisper-large-v3 --local-dir interaction/models/faster-whisper-large-v3
```

### Live2D 资源

1. 下载 Cubism SDK for Web，将 `Core/live2dcubismcore.min.js` 放到 `resources/cubism-core/`
2. 将模型目录放到 `resources/models/<model_name>/`

---

## 配置

编辑 `interaction/config.py`，按需调整：

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `LLM_BASE_URL` | Ollama 服务地址 | `http://192.168.3.41:11434/v1` |
| `LLM_MODEL` | 模型名称 | `qwen3.5:9b` |
| `AUDIO_DEVICE_NAME` | 音频设备名（模糊匹配） | `Yundea 8MICA` |
| `WAKE_WORD_THRESHOLD` | 唤醒词灵敏度（越低越灵敏） | `0.25` |
| `AUDIO_OUTPUT_GAIN` | 播放音量增益 | `50.0` |

---

## 启动

```bash
./start.sh
```

或手动：

```bash
# 终端 1：语音交互管道（含 MeloTTS）
conda activate virt-person
python interaction/main.py

# 终端 2：虚拟人物前端
npm run build && npm run electron
```

---

## 使用方式

1. 说「**你好龙虾**」唤醒，听到提示音后开始说话
2. 停顿 **5 秒**自动提交，或说「**好了**」「**就这样**」等结束语
3. 等待 LLM 回复并播放语音，Live2D 角色同步口型动画
4. 播放完毕自动返回待机

### 快捷键

| 键 | 功能 |
|----|------|
| `1/2/3/4` | 切换模型（Miku Pro JP / Miku / Hiyori Pro EN / Miara Pro EN） |
| `8` | 全身视图 |
| `9` | 半身视图 |
| 鼠标左键拖拽 | 移动透明窗口 |

---

## 常见问题

**TTS 服务未启动**：先运行步骤 2

**LLM 超时**：检查 Ollama 服务是否可达

**唤醒词不灵敏**：调低 `config.py` 中 `WAKE_WORD_THRESHOLD`（试 0.15）

**Live2D 无动画**：确认 WebSocket 已连接（状态栏显示「待唤醒」而非「未连接语音服务」）

---

## 构建打包

```bash
npm run pack
# 输出到 dist/release/（AppImage 和 .deb）
```

## 测试

```bash
npm test                          # Electron 前端测试
cd interaction && python -m pytest test/  # Python 管道测试
```
