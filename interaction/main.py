"""
main.py - 离线中文语音交互系统主程序

状态机：
  IDLE       → 持续监听唤醒词
  LISTENING  → 累积用户语音（多轮），超时或说结束语后转 PROCESSING
  PROCESSING → 调用 LLM，TTS 播放回复，返回 IDLE
"""

import enum
import time
import concurrent.futures

import config
from audio import AudioStream, VADRecorder, play_beep
from wake_word import WakeWordDetector
from stt import SpeechRecognizer
from llm import LLMClient
from tts import TTSClient
from ws_server import get_server


def _speak(tts: TTSClient, stream: AudioStream, text: str) -> str:
    """播放 TTS 语音，返回播放的文本（供后续回声过滤使用）。"""
    try:
        tts.speak(text)
    except Exception as e:
        print(f"⚠ TTS 播放失败：{e}")
    return text


def _is_tts_echo(stt_text: str, recent_tts: list[str], threshold: float = 0.5) -> bool:
    """
    判断 STT 结果是否是 TTS 回声。
    检查 stt_text 中有多少字符出现在最近播放的 TTS 文本里。
    """
    if not stt_text or not recent_tts:
        return False
    combined_tts = "".join(recent_tts)
    matched = sum(1 for ch in stt_text if ch in combined_tts)
    ratio = matched / len(stt_text)
    return ratio >= threshold


class State(enum.Enum):
    IDLE       = "idle"
    LISTENING  = "listening"
    PROCESSING = "processing"


def _llm_with_timeout(llm: LLMClient, text: str, timeout: float):
    """在独立线程中调用 LLM，超时返回 None。返回 (tts_text, full_reply) 或 None。"""
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
        future = ex.submit(llm.chat, text)
        try:
            return future.result(timeout=timeout)
        except concurrent.futures.TimeoutError:
            return None


def main():
    print("=" * 50)
    print("离线中文语音交互系统")
    print("=" * 50)

    # ── 初始化组件 ────────────────────────────────────────
    print("初始化 TTS（加载 MeloTTS 模型）...")
    tts = TTSClient()

    print("初始化唤醒词检测...")
    wake_detector = WakeWordDetector()

    print("初始化 VAD 录音...")
    vad_recorder = VADRecorder()

    print("初始化语音识别...")
    recognizer = SpeechRecognizer()

    print("初始化 LLM 客户端...")
    llm = LLMClient()

    print("初始化音频流...")
    stream = AudioStream()
    stream.start()

    print("启动 WebSocket server...")
    ws = get_server()
    ws.start()

    print(f"\n✅ 系统就绪，说「{config.WAKE_WORDS}」唤醒（Ctrl+C 退出）\n")

    # ── 状态机 ───────────────────────────────────────────
    state            = State.IDLE
    accumulated_texts: list[str] = []
    recent_tts: list[str] = []   # 最近播放的 TTS 文本，用于回声过滤

    def set_state(new_state: State):
        nonlocal state
        state = new_state
        ws.send({"type": "state", "state": new_state.value})

    try:
        while True:

            # ── IDLE：监听唤醒词 ──────────────────────────
            if state == State.IDLE:
                chunk = stream.read(timeout=1.0)
                keyword = wake_detector.process(chunk)
                if keyword:
                    print(f"\n🔔 检测到唤醒词：{keyword}")
                    stream.clear()
                    play_beep()
                    accumulated_texts = []
                    recent_tts = []
                    llm.reset()
                    t = _speak(tts, stream, "你好，请问有什么事情吗？")
                    recent_tts = [t]
                    set_state(State.LISTENING)

            # ── LISTENING：累积用户语音 ───────────────────
            elif state == State.LISTENING:
                stop_hint = "、".join(f"「{p}」" for p in config.STOP_PHRASES[:3])
                print(f"🎤 请说话（说 {stop_hint} 等结束，或停顿 {config.LISTENING_TIMEOUT:.0f}s 自动提交）...")
                audio = vad_recorder.record(
                    stream,
                    wait_timeout=config.LISTENING_TIMEOUT,
                )

                # 超时：没有新语音
                if len(audio) == 0:
                    if accumulated_texts:
                        print(f"⏱ 超时，提交已累积内容（{len(accumulated_texts)} 段）")
                        set_state(State.PROCESSING)
                    else:
                        print("⏱ 超时，未检测到语音，返回待机")
                        set_state(State.IDLE)
                    continue

                # 语音识别
                duration = len(audio) / config.SAMPLE_RATE
                if duration < 0.5:
                    print(f"   音频过短（{duration:.1f}s），跳过")
                    continue

                print("   识别中...")
                text = recognizer.transcribe(audio)
                print(f"   识别结果：{text}")

                # 回声过滤：丢弃与最近 TTS 内容高度重叠的识别结果
                if _is_tts_echo(text, recent_tts):
                    print(f"   ⚡ 疑似 TTS 回声，跳过")
                    recent_tts = []
                    continue
                recent_tts = []

                if text.strip():
                    accumulated_texts.append(text.strip())

                # 检查结束语
                stop_triggered = any(p in text for p in config.STOP_PHRASES)
                if stop_triggered:
                    print("🛑 检测到结束语，转入处理")
                    set_state(State.PROCESSING)
                # 否则继续监听（等待下一段语音或超时）

            # ── PROCESSING：调用 LLM 并播放回复 ──────────
            elif state == State.PROCESSING:
                if not accumulated_texts:
                    set_state(State.IDLE)
                    continue

                full_text = "".join(accumulated_texts)
                print(f"\n💬 用户：{full_text}")
                t = _speak(tts, stream, "收到信息，请让我思考片刻")
                recent_tts = [t]

                print("🤖 龙虾思考中...")
                t0 = time.time()
                result = _llm_with_timeout(llm, full_text, timeout=config.LLM_TIMEOUT)
                elapsed = time.time() - t0

                if result is None:
                    print(f"⚠ 龙虾超时（{elapsed:.0f}s）")
                    t = _speak(tts, stream, "抱歉，本次思考超时，请重新提问")
                    recent_tts = [t]
                else:
                    tts_text, full_reply = result
                    print(f"🤖 龙虾（{elapsed:.1f}s）：{full_reply}")
                    t = _speak(tts, stream, tts_text)
                    recent_tts = [t]


                accumulated_texts = []
                set_state(State.IDLE)
                print(f"\n✅ 返回待机，说「{config.WAKE_WORDS}」再次唤醒\n")

    except KeyboardInterrupt:
        print("\n\n退出系统")
    finally:
        stream.stop()


if __name__ == "__main__":
    main()
