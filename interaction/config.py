import os

# 项目根目录
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE_DIR, "models")

# ── 音频参数 ──────────────────────────────────────────────
SAMPLE_RATE = 16000       # Hz，唤醒词检测和 STT 要求 16kHz
DEVICE_SAMPLE_RATE = 48000  # Yundea 8MICA 硬件采样率
CHANNELS = 1              # 单声道
CHUNK_SIZE = 512          # samples per block @ 16kHz，约 32ms
DTYPE = "float32"

# 音频设备（用设备名匹配，避免 USB 重插后设备号变化）
AUDIO_DEVICE_NAME = "Yundea 8MICA"  # 模糊匹配，大小写不敏感
AUDIO_OUTPUT_GAIN = 50.0             # 播放增益，>1 放大，<1 缩小

# ── 唤醒词检测（sherpa-onnx）─────────────────────────────
WAKE_WORD_MODEL_DIR = os.path.join(
    MODELS_DIR, "sherpa-onnx-kws-zipformer-wenetspeech-3.3M-2024-01-01"
)
WAKE_WORD_ENCODER = os.path.join(WAKE_WORD_MODEL_DIR, "encoder-epoch-12-avg-2-chunk-16-left-64.onnx")
WAKE_WORD_DECODER = os.path.join(WAKE_WORD_MODEL_DIR, "decoder-epoch-12-avg-2-chunk-16-left-64.onnx")
WAKE_WORD_JOINER  = os.path.join(WAKE_WORD_MODEL_DIR, "joiner-epoch-12-avg-2-chunk-16-left-64.onnx")
WAKE_WORD_TOKENS  = os.path.join(WAKE_WORD_MODEL_DIR, "tokens.txt")
WAKE_WORD_KEYWORDS_FILE = os.path.join(WAKE_WORD_MODEL_DIR, "keywords_custom.txt")
WAKE_WORDS        = "你好龙虾"   # 仅用于显示
WAKE_WORD_THRESHOLD = 0.25      # 检测阈值，越高越严格

# ── VAD（silero-vad）─────────────────────────────────────
VAD_THRESHOLD        = 0.5    # 人声概率阈值
VAD_SILENCE_DURATION = 1.5    # 连续静音多少秒后判定说话结束
VAD_MAX_DURATION     = 30.0   # 单次录音最长秒数，防止意外不停录

# ── 语音识别（faster-whisper）────────────────────────────
STT_MODEL_DIR    = os.path.join(MODELS_DIR, "faster-whisper-large-v3")
STT_DEVICE       = "cuda"
STT_COMPUTE_TYPE = "float16"
STT_LANGUAGE     = "zh"

# ── LLM（OpenClaw / 龙虾）────────────────────────────────────
LLM_BASE_URL    = "http://192.168.3.61:18789/v1"
LLM_API_KEY     = "21986d6065866ad6ad32a6c342828a5f330b9e2666428f55"
LLM_MODEL       = "openclaw"
LLM_MAX_TOKENS  = 8192
LLM_SESSION_KEY = "main"   # x-openclaw-session-key header
LLM_SYSTEM_PROMPT = ""     # 系统提示词通过 OpenClaw session 配置，留空

# ── 语音合成（CosyVoice2）────────────────────────────────
TTS_MODEL_DIR  = os.path.join(MODELS_DIR, "CosyVoice2-0.5B")
TTS_SPEAKER    = "中文女"    # 预设音色，可选：中文女、中文男、英文女、英文男
TTS_SAMPLE_RATE = 22050      # CosyVoice2 输出采样率

# ── 提示音──────────────────────────────────────────────
# 唤醒成功后播放的提示音文件（可选，None 则不播放）
BEEP_FILE = None

# ── 状态机 ───────────────────────────────────────────────
STOP_PHRASES     = ["好了就这样", "就这样", "好了", "发送", "提交"]
LISTENING_TIMEOUT = 5.0   # 秒，最后一段语音后等待新语音的时间
LLM_TIMEOUT       = 600   # 秒，LLM 最长思考时间（10 分钟）
