"""
test_wake_word.py - 唤醒词检测测试

运行后对麦克风说"你好龙虾"，检测到后会打印提示并播放提示音。
按 Ctrl+C 退出。

运行方式：
  python test/test_wake_word.py
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from audio import AudioStream, play_beep
from wake_word import WakeWordDetector
import config

def main():
    print("=" * 50)
    print("【唤醒词检测测试】")
    print("=" * 50)
    print(f"唤醒词：{config.WAKE_WORDS}")
    print(f"检测阈值：{config.WAKE_WORD_THRESHOLD}")
    print("请说话，按 Ctrl+C 退出...\n")

    detector = WakeWordDetector()
    stream = AudioStream()
    stream.start()

    try:
        count = 0
        while True:
            chunk = stream.read(timeout=1.0)
            if detector.process(chunk):
                count += 1
                print(f"✓ 检测到唤醒词！（第 {count} 次）")
                play_beep()
    except KeyboardInterrupt:
        print("\n退出")
    finally:
        stream.stop()

if __name__ == "__main__":
    main()
