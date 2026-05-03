"""
llm.py - LLM 调用模块（OpenClaw / 龙虾）

通过 OpenClaw Gateway 与龙虾通信，维护多轮对话历史。
从回复中提取 [[tts:text]]...[[/tts:text]] 块作为 TTS 播放内容。
"""

import re
from openai import OpenAI
import config

_TTS_BLOCK_RE = re.compile(r'\[\[tts:text\]\]([\s\S]*?)\[\[/tts:text\]\]', re.IGNORECASE)


def _extract_tts_text(reply: str) -> str:
    """提取 [[tts:text]] 块内容；没有则返回完整回复。"""
    match = _TTS_BLOCK_RE.search(reply)
    if match:
        return match.group(1).strip()
    return reply.strip()


def _strip_tts_block(reply: str) -> str:
    """从回复中移除 [[tts:text]] 块（用于日志显示）。"""
    return _TTS_BLOCK_RE.sub('', reply).strip()


class LLMClient:

    def __init__(self):
        self._client = OpenAI(
            base_url=config.LLM_BASE_URL,
            api_key=config.LLM_API_KEY,
            default_headers={
                "x-openclaw-session-key": config.LLM_SESSION_KEY,
            },
        )
        self._history: list[dict] = []

    def chat(self, user_text: str) -> tuple[str, str]:
        """
        发送用户消息，返回 (tts_text, full_reply)。
        tts_text: [[tts:text]] 块内容（用于 TTS 播放）
        full_reply: 完整回复（用于日志）
        """
        messages = list(self._history)

        if config.LLM_SYSTEM_PROMPT:
            messages = [{"role": "system", "content": config.LLM_SYSTEM_PROMPT}] + messages

        messages.append({"role": "user", "content": user_text})

        response = self._client.chat.completions.create(
            model=config.LLM_MODEL,
            messages=messages,
            max_tokens=config.LLM_MAX_TOKENS,
            timeout=config.LLM_TIMEOUT,
            stream=True,
        )

        full_reply = ""
        for chunk in response:
            delta = chunk.choices[0].delta.content or ""
            full_reply += delta

        self._history.append({"role": "user", "content": user_text})
        self._history.append({"role": "assistant", "content": full_reply})

        tts_text = _extract_tts_text(full_reply)
        return tts_text, full_reply

    def reset(self):
        """清空对话历史，开始新一轮对话。"""
        self._history.clear()

    @property
    def history(self) -> list[dict]:
        return list(self._history)
