"""
wake_word.py - 唤醒词检测模块

使用 sherpa-onnx zipformer KWS 模型，运行时指定唤醒词，无需重新训练。
唤醒词格式见 models/.../keywords_custom.txt
"""

import sherpa_onnx
import numpy as np
import config


class WakeWordDetector:
    """
    持续从音频流读取音频块，检测到唤醒词时返回 True。
    """

    def __init__(self):
        self._recognizer = sherpa_onnx.KeywordSpotter(
            tokens=config.WAKE_WORD_TOKENS,
            encoder=config.WAKE_WORD_ENCODER,
            decoder=config.WAKE_WORD_DECODER,
            joiner=config.WAKE_WORD_JOINER,
            keywords_file=config.WAKE_WORD_KEYWORDS_FILE,
            num_threads=2,
            max_active_paths=4,
            keywords_score=config.WAKE_WORD_THRESHOLD,
            keywords_threshold=config.WAKE_WORD_THRESHOLD,
            provider="cpu",
        )
        self._stream = self._recognizer.create_stream()

    def process(self, chunk: np.ndarray) -> bool:
        """
        处理一个音频块，返回是否检测到唤醒词。
        chunk: float32 numpy array，16kHz，单声道
        """
        self._stream.accept_waveform(config.SAMPLE_RATE, chunk)
        while self._recognizer.is_ready(self._stream):
            self._recognizer.decode_stream(self._stream)
        result = self._recognizer.get_result(self._stream).strip()
        if result:
            self._stream = self._recognizer.create_stream()
            return True
        return False
