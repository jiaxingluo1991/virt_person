"""
audio.py - 音频输入输出 + VAD 录音

提供：
  - AudioStream: 持续采集麦克风音频，通过 queue 输出音频块
  - play_audio: 播放 numpy 音频数组
  - play_beep: 播放提示音
  - VADRecorder: 唤醒后 VAD 录音
"""

import queue
import time
import numpy as np
import sounddevice as sd
import torch
from scipy.signal import resample_poly

import config

# 重采样：DEVICE_SAMPLE_RATE(48000) → SAMPLE_RATE(16000)，比例 1/3
_RESAMPLE_UP = config.SAMPLE_RATE // 1000
_RESAMPLE_DOWN = config.DEVICE_SAMPLE_RATE // 1000

# 设备侧 chunk 大小（按硬件采样率计算）
_DEVICE_CHUNK_SIZE = int(config.CHUNK_SIZE * config.DEVICE_SAMPLE_RATE / config.SAMPLE_RATE)


def _resample(audio: np.ndarray) -> np.ndarray:
    """将音频从 DEVICE_SAMPLE_RATE 降采样到 SAMPLE_RATE。"""
    return resample_poly(audio, _RESAMPLE_UP, _RESAMPLE_DOWN).astype(np.float32)


def _find_device(name: str, kind: str):
    """按名称模糊匹配音频设备，返回设备号。找不到则返回 None（使用系统默认）。"""
    name_lower = name.lower()
    for i, dev in enumerate(sd.query_devices()):
        if name_lower in dev['name'].lower():
            if kind == 'input' and dev['max_input_channels'] > 0:
                return i
            if kind == 'output' and dev['max_output_channels'] > 0:
                return i
    return None


class AudioStream:
    """持续从麦克风采集音频，音频块放入 queue 供消费者读取。"""

    def __init__(self):
        self._queue: queue.Queue = queue.Queue()
        self._stream = None

    def _callback(self, indata, frames, time, status):
        chunk = indata[:, 0].copy()
        chunk = np.clip(chunk * config.AUDIO_INPUT_GAIN, -1.0, 1.0)
        self._queue.put(_resample(chunk))

    def start(self):
        device = _find_device(config.AUDIO_DEVICE_NAME, 'input')
        self._stream = sd.InputStream(
            samplerate=config.DEVICE_SAMPLE_RATE,
            channels=config.CHANNELS,
            dtype=config.DTYPE,
            blocksize=_DEVICE_CHUNK_SIZE,
            device=device,
            callback=self._callback,
        )
        self._stream.start()

    def stop(self):
        if self._stream:
            self._stream.stop()
            self._stream.close()
            self._stream = None

    def read(self, timeout: float = 1.0) -> np.ndarray:
        """阻塞读取一个音频块，超时返回空数组。"""
        try:
            return self._queue.get(timeout=timeout)
        except queue.Empty:
            return np.zeros(config.CHUNK_SIZE, dtype=np.float32)

    def clear(self):
        """清空队列中积压的音频块（唤醒后重置用）。"""
        while not self._queue.empty():
            try:
                self._queue.get_nowait()
            except queue.Empty:
                break


def play_audio(audio: np.ndarray, sample_rate: int = None):
    """播放 numpy 音频数组，阻塞直到播放完毕。"""
    if sample_rate is None:
        sample_rate = config.DEVICE_SAMPLE_RATE
    device = _find_device(config.AUDIO_DEVICE_NAME, 'output')
    audio = np.clip(audio * config.AUDIO_OUTPUT_GAIN, -1.0, 1.0)
    sd.play(audio, samplerate=sample_rate, device=device)
    sd.wait()


def play_beep():
    """播放简单的提示音（纯音调，无需外部文件）。"""
    duration = 0.2   # 秒
    freq = 880       # Hz
    t = np.linspace(0, duration, int(config.DEVICE_SAMPLE_RATE * duration), endpoint=False)
    beep = (0.3 * np.sin(2 * np.pi * freq * t)).astype(np.float32)
    play_audio(beep, config.DEVICE_SAMPLE_RATE)


class VADRecorder:
    """
    使用 silero-vad 在唤醒后录制用户语音。
    检测到连续静音超过 VAD_SILENCE_DURATION 秒后停止。
    """

    def __init__(self):
        self._model, self._utils = torch.hub.load(
            repo_or_dir="snakers4/silero-vad",
            model="silero_vad",
            force_reload=False,
        )
        (self._get_speech_timestamps,
         _,
         _,
         self._VADIterator,
         _) = self._utils

    def record(self, stream: AudioStream, wait_timeout: float = None) -> np.ndarray:
        """
        从 stream 持续读取音频，等待人声开始后录音，静音超过阈值后停止。
        wait_timeout: 等待人声开始的最长时间（秒），超时返回空数组；None 表示无限等待。
        返回完整录音（numpy float32 array，16kHz）。
        """
        frames = []
        silence_chunks = 0
        speech_started = False
        max_chunks = int(config.VAD_MAX_DURATION * config.SAMPLE_RATE / config.CHUNK_SIZE)
        silence_limit = int(
            config.VAD_SILENCE_DURATION * config.SAMPLE_RATE / config.CHUNK_SIZE
        )
        wait_start = time.time()

        for _ in range(max_chunks):
            chunk = stream.read(timeout=2.0)

            tensor = torch.from_numpy(chunk)
            speech_prob = self._model(tensor, config.SAMPLE_RATE).item()

            if speech_prob >= config.VAD_THRESHOLD:
                speech_started = True
                silence_chunks = 0

            # 超时检测：只在等待人声开始阶段检查
            if not speech_started and wait_timeout is not None:
                if time.time() - wait_start > wait_timeout:
                    return np.zeros(0, dtype=np.float32)

            if speech_started:
                frames.append(chunk)
                if speech_prob < config.VAD_THRESHOLD:
                    silence_chunks += 1
                if silence_chunks >= silence_limit:
                    break

        return np.concatenate(frames, axis=0) if frames else np.zeros(0, dtype=np.float32)
