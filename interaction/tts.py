"""
tts.py - TTS 模块（MeloTTS 进程内直接调用）

直接在进程内初始化 MeloTTS，无需 tts_server.py HTTP 服务。
播放前向 Electron 推送振幅包络（口型同步），播放后推送 speak_end。
"""

import math
import tempfile
import os
from typing import Optional

import numpy as np
import sounddevice as sd
from scipy.signal import resample_poly

import config
from ws_server import get_server


def _resample(audio: np.ndarray, src_rate: int, dst_rate: int) -> np.ndarray:
    if src_rate == dst_rate:
        return audio
    gcd = math.gcd(src_rate, dst_rate)
    return resample_poly(audio, dst_rate // gcd, src_rate // gcd).astype(np.float32)


def _compute_envelope(audio: np.ndarray, sample_rate: int, fps: int = 30) -> list[float]:
    frame_size = sample_rate // fps
    frames = [audio[i:i + frame_size] for i in range(0, len(audio), frame_size)
              if len(audio[i:i + frame_size]) > 0]
    rms_values = [float(np.sqrt(np.mean(f ** 2))) for f in frames]
    max_rms = max(rms_values) if rms_values else 1.0
    if max_rms < 1e-6:
        return [0.0] * len(rms_values)
    return [min(1.0, v / max_rms) for v in rms_values]


def _find_output_device(name: str) -> Optional[int]:
    name_lower = name.lower()
    for i, dev in enumerate(sd.query_devices()):
        if name_lower in dev["name"].lower() and dev["max_output_channels"] > 0:
            return i
    return None


class TTSClient:

    def __init__(self):
        print("加载 MeloTTS 模型...")
        from melo.api import TTS
        self._model = TTS(language='ZH', device='auto')
        self._speaker_id = self._model.hps.data.spk2id['ZH']
        self._sample_rate = self._model.hps.data.sampling_rate
        print(f"MeloTTS 加载完成，采样率：{self._sample_rate} Hz")

    def speak(self, text: str):
        """合成语音并播放，同时向 Electron 推送振幅包络和状态事件。"""
        if not text.strip():
            return

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            tmp_path = f.name
        try:
            self._model.tts_to_file(text, self._speaker_id, tmp_path, speed=1.0, quiet=True)
            audio = self._load_wav(tmp_path)
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

        envelope = _compute_envelope(audio, self._sample_rate, fps=30)
        duration_ms = int(len(audio) / self._sample_rate * 1000)

        # 先做耗时的 resample，再发 WS 消息，确保动画和音频同步启动
        audio = _resample(audio, self._sample_rate, config.DEVICE_SAMPLE_RATE)
        audio = np.clip(audio * config.AUDIO_OUTPUT_GAIN, -1.0, 1.0)
        device = _find_output_device(config.AUDIO_DEVICE_NAME)

        ws = get_server()
        ws.send({"type": "speak_start"})
        ws.send({"type": "lip_sync", "envelope": envelope, "duration_ms": duration_ms})

        sd.play(audio, samplerate=config.DEVICE_SAMPLE_RATE, device=device)
        sd.wait()

        ws.send({"type": "speak_end"})

    def _load_wav(self, path: str) -> np.ndarray:
        import wave
        with wave.open(path, "rb") as wf:
            raw = wf.readframes(wf.getnframes())
        return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32767.0
