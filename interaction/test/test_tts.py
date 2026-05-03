"""
test_tts.py - TTS 测试脚本

测试 tts_server.py 通信，验证语音合成与播放。

运行前提：tts_server.py 已在 cosyvoice 环境中启动（端口 8081）
运行方式：
  python test/test_tts.py
"""

import sys
import os
import time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tts import TTSClient


def main():
    print("=" * 50)
    print("【TTS 语音合成测试】")
    print("=" * 50)

    client = TTSClient()

    # 检查服务是否在线
    print("检查 tts_server 状态...", end=" ", flush=True)
    if not client.is_ready():
        print("❌ 未连接")
        print("请先启动 tts_server：")
        print("  conda activate cosyvoice")
        print("  cd /home/jiaxingluo/workspace/CosyVoice")
        print("  python tts_server.py")
        return
    print("✅ 在线\n")

    sentences = [
        "你好，我是你的语音助手。",
        "今天天气怎么样？",
        "这是一段测试语音，用来验证语音合成是否正常工作。",
    ]

    for i, text in enumerate(sentences, 1):
        print(f"【测试 {i}】{text}")
        t0 = time.time()
        client.speak(text)
        elapsed = time.time() - t0
        print(f"  合成+播放用时：{elapsed:.2f} 秒\n")

    # 交互模式
    print("=" * 50)
    print("【交互模式】输入文字播放语音，直接回车退出")
    print("=" * 50)
    while True:
        try:
            text = input("\n输入文字：").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n退出")
            break
        if not text:
            break
        t0 = time.time()
        client.speak(text)
        elapsed = time.time() - t0
        print(f"（合成+播放用时 {elapsed:.2f} 秒）")


if __name__ == "__main__":
    main()
