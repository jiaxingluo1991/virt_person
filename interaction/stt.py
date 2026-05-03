"""
stt.py - 语音识别模块

使用 faster-whisper 将音频转为中文文本，GPU 推理。
"""

import numpy as np
from faster_whisper import WhisperModel
import config


class SpeechRecognizer:

    def __init__(self):
        self._model = WhisperModel(
            config.STT_MODEL_DIR,
            device=config.STT_DEVICE,
            compute_type=config.STT_COMPUTE_TYPE,
        )

    def transcribe(self, audio: np.ndarray) -> str:
        """
        将音频转为文本。
        audio: float32 numpy array，16kHz，单声道
        返回识别出的中文文本字符串。
        """
        segments, _ = self._model.transcribe(
            audio,
            language=config.STT_LANGUAGE,
            beam_size=5,
            vad_filter=True,
            initial_prompt="以下是普通话语音识别结果，使用简体中文。",
        )
        return "".join(seg.text for seg in segments).strip()
