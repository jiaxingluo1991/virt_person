# virt-person

Ubuntu 桌面虚拟人物应用。Live2D 动漫角色 + 本地语音对话（STT/TTS/LLM）。

## 依赖

### 系统依赖

**Node.js 18+**（Ubuntu 20.04 需通过 NodeSource 安装）：
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
```

**Ubuntu 20.04 额外系统库：**
```bash
sudo apt install libgbm1 libnss3 libatk-bridge2.0-0 libxss1
```

**Ubuntu 22.04 音频（PipeWire 用户）：**
```bash
sudo apt install pipewire-pulse
```

### npm 依赖

```bash
npm install
```

### Live2D 资源（手动准备）

1. 下载 [CubismSdkForWeb-4-r.7](https://www.live2d.com/en/sdk/download/web/)
2. 将 `Core/live2dcubismcore.min.js` 放到 `resources/cubism-core/`
3. 将示例模型（如 `Samples/Resources/Haru/`）放到 `resources/models/Haru/`

## 配置

复制配置示例并填入本地服务地址：
```bash
cp config.example.json config.json
# 编辑 config.json，填入 STT/TTS/LLM 服务的实际 URL
```

## 运行

```bash
# 开发模式（两个终端分别运行）
npm run dev:main
npm run dev:renderer

# 启动 Electron
npm run electron
```

## 构建打包

```bash
npm run pack
# 输出到 dist/release/（AppImage 和 .deb）
```

## 测试

```bash
npm test
```
