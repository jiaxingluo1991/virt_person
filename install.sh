#!/usr/bin/env bash
# install.sh - virt-person 一键安装脚本
#
# 用法：bash install.sh
#
# 前提：
#   - 已安装 conda（miniconda 或 anaconda）
#   - 已安装 nvm（Node.js 版本管理）
#   - CUDA 12.x 驱动已就绪（GPU 推理需要）

set -e

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONDA_ENV="virt-person"

# ── 自动检测 CUDA 版本 ────────────────────────────────────────
detect_cuda_version() {
    # 优先用 nvidia-smi 读取驱动支持的最高 CUDA 版本
    if command -v nvidia-smi &>/dev/null; then
        local cuda_ver
        cuda_ver=$(nvidia-smi --query-gpu=driver_version --format=csv,noheader 2>/dev/null | head -1)
        # nvidia-smi 也直接报告 CUDA 版本
        local cuda_str
        cuda_str=$(nvidia-smi 2>/dev/null | grep -oP "CUDA Version: \K[0-9]+\.[0-9]+" | head -1)
        if [ -n "$cuda_str" ]; then
            local major minor
            major=$(echo "$cuda_str" | cut -d. -f1)
            minor=$(echo "$cuda_str" | cut -d. -f2)
            # 映射到 PyTorch 支持的最近 wheel 版本
            if   [ "$major" -gt 12 ]; then echo "cu128"   # CUDA 13+ 用最新 wheel
            elif [ "$major" -eq 12 ] && [ "$minor" -ge 8 ]; then echo "cu128"
            elif [ "$major" -eq 12 ] && [ "$minor" -ge 4 ]; then echo "cu124"
            elif [ "$major" -eq 12 ] && [ "$minor" -ge 1 ]; then echo "cu121"
            elif [ "$major" -eq 11 ] && [ "$minor" -ge 8 ]; then echo "cu118"
            else echo "cpu"
            fi
            return
        fi
    fi
    # 回退：读取 /usr/local/cuda/version.txt 或 nvcc
    if command -v nvcc &>/dev/null; then
        local cuda_str
        cuda_str=$(nvcc --version 2>/dev/null | grep -oP "release \K[0-9]+\.[0-9]+")
        if [ -n "$cuda_str" ]; then
            local major minor
            major=$(echo "$cuda_str" | cut -d. -f1)
            minor=$(echo "$cuda_str" | cut -d. -f2)
            if   [ "$major" -gt 12 ]; then echo "cu128"
            elif [ "$major" -eq 12 ] && [ "$minor" -ge 8 ]; then echo "cu128"
            elif [ "$major" -eq 12 ] && [ "$minor" -ge 4 ]; then echo "cu124"
            elif [ "$major" -eq 12 ] && [ "$minor" -ge 1 ]; then echo "cu121"
            elif [ "$major" -eq 11 ] && [ "$minor" -ge 8 ]; then echo "cu118"
            else echo "cpu"
            fi
            return
        fi
    fi
    # 没有 GPU
    echo "cpu"
}

CUDA_VERSION=$(detect_cuda_version)

echo "========================================"
echo "  virt-person 安装脚本"
echo "  仓库目录：$REPO_DIR"
echo "  conda 环境：$CONDA_ENV"
if [ "$CUDA_VERSION" = "cpu" ]; then
    echo "  GPU：未检测到，使用 CPU 模式（STT 推理会较慢）"
else
    echo "  CUDA：$CUDA_VERSION（自动检测）"
fi
echo "========================================"
echo ""

# ── 1. 系统依赖 ──────────────────────────────────────────────
echo "[1/5] 安装系统依赖..."
sudo apt-get update -qq
sudo apt-get install -y \
    libportaudio2 \
    mecab libmecab-dev mecab-ipadic-utf8 \
    libgbm1 libnss3 libatk-bridge2.0-0 libxss1 \
    wget curl git

# Ubuntu 22.04+ PipeWire 音频支持
if lsb_release -rs 2>/dev/null | grep -qE "^(22|24)"; then
    sudo apt-get install -y pipewire-pulse || true
fi

echo "  ✓ 系统依赖安装完成"
echo ""

# ── 2. conda 环境 ─────────────────────────────────────────────
echo "[2/5] 创建 conda 环境 '$CONDA_ENV'..."

# 初始化 conda（兼容不同安装路径）
CONDA_BASE=$(conda info --base 2>/dev/null || echo "$HOME/miniconda3")
source "$CONDA_BASE/etc/profile.d/conda.sh"

if conda env list | grep -q "^$CONDA_ENV "; then
    echo "  环境已存在，跳过创建"
else
    conda create -n "$CONDA_ENV" python=3.10 -y
    echo "  ✓ 环境创建完成"
fi

conda activate "$CONDA_ENV"
echo "  ✓ 已激活环境 $CONDA_ENV"
echo ""

# ── 3. Python 依赖 ────────────────────────────────────────────
echo "[3/5] 安装 Python 依赖..."

# 基础音频和工具库
pip install \
    sounddevice \
    numpy \
    scipy \
    openai \
    "websockets>=12.0" \
    requests \
    fastapi \
    uvicorn \
    pydantic

# 唤醒词检测
pip install sherpa-onnx

# 语音识别
pip install faster-whisper

# PyTorch（silero-vad 依赖）
echo "  安装 PyTorch（$CUDA_VERSION）..."
if [ "$CUDA_VERSION" = "cpu" ]; then
    pip install torch torchaudio
else
    pip install torch torchaudio \
        --index-url "https://download.pytorch.org/whl/$CUDA_VERSION"
fi

# MeloTTS（PyPI 包有 bug，从 GitHub 安装）
if python -c "import melo" 2>/dev/null; then
    echo "  ✓ MeloTTS 已安装，跳过"
else
    echo "  安装 MeloTTS..."
    pip install "git+https://github.com/myshell-ai/MeloTTS.git"
fi

# unidic 只在未安装时下载（约 500MB，避免重复下载）
if python -c "import unidic; import os; assert os.path.exists(unidic.DICDIR)" 2>/dev/null; then
    echo "  ✓ unidic 词典已就绪，跳过下载"
else
    echo "  下载 unidic 词典（约 500MB）..."
    python -m unidic download
fi

echo "  ✓ Python 依赖安装完成"
echo ""

# ── 4. Node.js 依赖 ───────────────────────────────────────────
echo "[4/5] 安装 Node.js 依赖..."

# 加载 nvm
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
    source "$NVM_DIR/nvm.sh"
else
    echo "  ⚠ 未找到 nvm，请先安装：https://github.com/nvm-sh/nvm"
    echo "    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash"
    exit 1
fi

cd "$REPO_DIR"
nvm install   # 读取 .nvmrc
nvm use
npm install

echo "  ✓ Node.js 依赖安装完成"
echo ""

# ── 5. 模型文件下载 ───────────────────────────────────────────
echo "[5/5] 检查并下载模型文件..."

MODELS_DIR="$REPO_DIR/interaction/models"
mkdir -p "$MODELS_DIR"

WAKE_MODEL_DIR="$MODELS_DIR/sherpa-onnx-kws-zipformer-wenetspeech-3.3M-2024-01-01"
STT_MODEL_DIR="$MODELS_DIR/faster-whisper-large-v3"

# 唤醒词模型（sherpa-onnx，约 30MB）
if [ -d "$WAKE_MODEL_DIR" ]; then
    echo "  ✓ 唤醒词模型已就绪"
else
    echo "  下载唤醒词模型（sherpa-onnx，约 30MB）..."
    WAKE_TARBALL="$MODELS_DIR/sherpa-onnx-kws-zipformer-wenetspeech-3.3M-2024-01-01.tar.bz2"
    wget -q --show-progress \
        -O "$WAKE_TARBALL" \
        "https://github.com/k2-fsa/sherpa-onnx/releases/download/kws-models/sherpa-onnx-kws-zipformer-wenetspeech-3.3M-2024-01-01.tar.bz2"
    tar xf "$WAKE_TARBALL" -C "$MODELS_DIR"
    rm "$WAKE_TARBALL"
    echo "  ✓ 唤醒词模型下载完成"
fi

# STT 模型（faster-whisper large-v3，约 3GB）
if [ -d "$STT_MODEL_DIR" ]; then
    echo "  ✓ STT 模型已就绪"
else
    echo "  下载 STT 模型（faster-whisper large-v3，约 3GB，需要一些时间）..."
    STT_MODEL_DIR="$STT_MODEL_DIR" python - <<'PYEOF'
import sys
from huggingface_hub import snapshot_download
import os

dst = os.environ.get("STT_MODEL_DIR")
try:
    snapshot_download(
        repo_id="Systran/faster-whisper-large-v3",
        local_dir=dst,
        local_dir_use_symlinks=False,
        resume_download=True,
    )
    print("下载完成")
except Exception as e:
    print(f"\n✗ 下载失败：{e}", file=sys.stderr)
    print(f"\n请手动下载后重新运行 install.sh：", file=sys.stderr)
    print(f"  python -c \"from huggingface_hub import snapshot_download; snapshot_download('Systran/faster-whisper-large-v3', local_dir='{dst}', resume_download=True)\"", file=sys.stderr)
    sys.exit(1)
PYEOF
    echo "  ✓ STT 模型下载完成"
fi

echo ""
echo "========================================"
echo "  安装完成！"
echo ""
echo "  启动步骤："
echo "  1. conda activate $CONDA_ENV"
echo "  2. python interaction/tts_server.py   # 终端 1"
echo "  3. python interaction/main.py         # 终端 2"
echo "  4. npm run build && npm run electron  # 终端 3"
echo "========================================"
