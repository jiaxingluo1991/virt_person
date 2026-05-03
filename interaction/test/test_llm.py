"""
test_llm.py - LLM 通信测试

测试与 llama-server 的 HTTP 通信，验证多轮对话功能。

运行前提：llama-server 已在 127.0.0.1:8080 启动
运行方式：
  python test/test_llm.py
"""

import sys
import os
import time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from llm import LLMClient


def main():
    print("=" * 50)
    print("【LLM 通信测试】")
    print("=" * 50)
    print(f"连接地址：http://127.0.0.1:8080")
    print("初始化客户端...")

    client = LLMClient()
    print("客户端初始化完成\n")

    # 测试 1：单次问答
    print("【测试 1】单次问答")
    question = "你好，请用一句话介绍你自己。"
    print(f"用户：{question}")
    t0 = time.time()
    reply = client.chat(question)
    elapsed = time.time() - t0
    print(f"助手：{reply}")
    print(f"用时：{elapsed:.2f} 秒\n")

    # 测试 2：多轮对话
    print("【测试 2】多轮对话（上文记忆）")
    question2 = "你刚才说的第一个词是什么？"
    print(f"用户：{question2}")
    t0 = time.time()
    reply2 = client.chat(question2)
    elapsed = time.time() - t0
    print(f"助手：{reply2}")
    print(f"用时：{elapsed:.2f} 秒\n")

    # 测试 3：重置后新对话
    print("【测试 3】重置对话历史")
    client.reset()
    question3 = "现在几点了？"
    print(f"用户：{question3}")
    t0 = time.time()
    reply3 = client.chat(question3)
    elapsed = time.time() - t0
    print(f"助手：{reply3}")
    print(f"用时：{elapsed:.2f} 秒\n")

    # 测试 4：交互模式
    print("=" * 50)
    print("【交互模式】直接输入问题，输入 'quit' 退出，输入 'reset' 重置对话")
    print("=" * 50)
    client.reset()
    while True:
        try:
            user_input = input("\n你：").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n退出")
            break

        if not user_input:
            continue
        if user_input.lower() == "quit":
            print("退出")
            break
        if user_input.lower() == "reset":
            client.reset()
            print("对话已重置")
            continue

        t0 = time.time()
        try:
            reply = client.chat(user_input)
            elapsed = time.time() - t0
            print(f"助手：{reply}")
            print(f"（用时 {elapsed:.2f} 秒）")
        except Exception as e:
            print(f"错误：{e}")


if __name__ == "__main__":
    main()
