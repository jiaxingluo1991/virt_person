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

1. 下载 Cubism SDK for Web（Core）
2. 将 `Core/live2dcubismcore.min.js` 放到 `resources/cubism-core/`
3. 将模型目录放到 `resources/models/<model_name>/`

> 当前项目使用 `pixi-live2d-display@0.4` + `pixi.js@6`。不要升级到 pixi.js v7。

## 配置

复制配置示例并填入本地服务地址：
```bash
cp config.example.json config.json
# 编辑 config.json，填入 STT/TTS/LLM 服务 URL
```

## 运行

```bash
# 开发模式（两个终端分别运行）
npm run dev:main
npm run dev:renderer

# 启动 Electron
npm run electron
```

## 当前交互快捷键

- `Space`：按住录音，松开后发送 STT
- `1/2/3/4`：切换模型
  - `1` = Miku Pro JP
  - `2` = Miku
  - `3` = Hiyori Pro EN
  - `4` = Miara Pro EN
- `8`：全身视图
- `9`：半身视图
- 鼠标左键拖拽：移动透明窗口位置

## 当前窗口行为

- 无边框透明窗口（`frame: false`, `transparent: true`）
- 启动即置顶（`alwaysOnTop: true`）
- 不再自动打开 DevTools

## 构建打包

```bash
npm run pack
# 输出到 dist/release/（AppImage 和 .deb）
```

## 测试

```bash
npm test
```

## 已知说明

- 部分模型没有 `Motions` 配置，只能静态展示（无法播放动作）
- 部分模型口型参数名不一致，项目已兼容常见参数：
  - `PARAM_MOUTH_OPEN_Y`
  - `ParamMouthOpenY`
- 构建产物体积较大是正常现象（Live2D runtime + 模型资源）
