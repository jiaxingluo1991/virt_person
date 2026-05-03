"""
test_stt.py - 语音识别测试

使用 VADRecorder 自动检测说话结束，然后识别为中文文本。

运行方式：
  python test/test_stt.py
"""

import sys
import os
import time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import config
from audio import AudioStream, VADRecorder
from stt import SpeechRecognizer


def main():
    print("=" * 50)
    print("【语音识别测试（VAD）】")
    print("=" * 50)
    print("加载模型...")
    recognizer = SpeechRecognizer()
    recorder = VADRecorder()
    print("模型加载完成\n")

    stream = AudioStream()
    stream.start()

    try:
        while True:
            print("请说话（停顿 1.5 秒后自动结束，Ctrl+C 退出）...")
            t_start = time.time()
            audio_16k = recorder.record(stream)
            t_record = time.time()

            duration = len(audio_16k) / config.SAMPLE_RATE
            print(f"录音时长：{duration:.1f} 秒，正在识别...")

            text = recognizer.transcribe(audio_16k)
            t_end = time.time()

            print(f"识别结果：{text}")
            print(f"识别用时：{t_end - t_record:.2f} 秒\n")
    except KeyboardInterrupt:
        print("\n退出")
    finally:
        stream.stop()


if __name__ == "__main__":
    main()
