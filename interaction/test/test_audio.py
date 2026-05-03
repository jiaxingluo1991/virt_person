"""
test_audio.py - 音频模块测试

分为几个独立测试，可单独运行：
  1. 列出音频设备（含 Yundea 8MICA 验证）
  2. 测试录音 + 回放（不依赖 torch）
  3. 测试提示音 play_beep（不依赖 torch）
  4. 测试 VAD 录音（依赖 torch，需先安装）

运行方式：
  python test/test_audio.py          # 运行所有测试
  python test/test_audio.py devices  # 只列设备
  python test/test_audio.py record   # 只测试录音回放
  python test/test_audio.py beep     # 只测试提示音
  python test/test_audio.py vad      # 只测试 VAD 录音
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np
import sounddevice as sd
from scipy.signal import resample_poly
import config
from audio import _find_device


def test_devices():
    """列出所有可用音频设备，并验证 Yundea 8MICA 是否找到。"""
    print("=" * 50)
    print("【测试1】音频设备列表")
    print("=" * 50)
    print(sd.query_devices())

    in_dev = _find_device(config.AUDIO_DEVICE_NAME, 'input')
    out_dev = _find_device(config.AUDIO_DEVICE_NAME, 'output')

    if in_dev is not None:
        dev_info = sd.query_devices(in_dev)
        print(f"\n✓ 找到输入设备：[{in_dev}] {dev_info['name']}")
        print(f"  默认采样率：{dev_info['default_samplerate']} Hz")
        print(f"  最大输入声道：{dev_info['max_input_channels']}")
    else:
        print(f"\n✗ 未找到输入设备：{config.AUDIO_DEVICE_NAME}，将使用系统默认")

    if out_dev is not None:
        dev_info = sd.query_devices(out_dev)
        print(f"✓ 找到输出设备：[{out_dev}] {dev_info['name']}")
        print(f"  默认采样率：{dev_info['default_samplerate']} Hz")
        print(f"  最大输出声道：{dev_info['max_output_channels']}")
    else:
        print(f"✗ 未找到输出设备：{config.AUDIO_DEVICE_NAME}，将使用系统默认")
    print()


def test_record_playback(duration=3):
    """用 Yundea 8MICA 录音 N 秒后回放，验证麦克风和喇叭正常。"""
    print("=" * 50)
    print("【测试2】录音 + 回放（Yundea 8MICA）")
    print("=" * 50)

    in_dev = _find_device(config.AUDIO_DEVICE_NAME, 'input')
    out_dev = _find_device(config.AUDIO_DEVICE_NAME, 'output')

    print(f"开始录音 {duration} 秒，请说话...")
    audio = sd.rec(
        int(duration * 48000),
        samplerate=48000,
        channels=1,
        dtype="float32",
        device=in_dev,
    )
    sd.wait()

    # downsample 48000 → 32000（比例 2/3）
    audio_32k = resample_poly(audio[:, 0], up=2, down=3).astype(np.float32)

    print(f"原始音频 max: {np.max(np.abs(audio)):.4f}, mean: {np.mean(np.abs(audio)):.4f}")
    print(f"降采样后 max: {np.max(np.abs(audio_32k)):.4f}, mean: {np.mean(np.abs(audio_32k)):.4f}")

    print("录音完成，正在回放...")
    from audio import play_audio
    play_audio(audio_32k, sample_rate=32000)
    sd.wait()
    print("✓ 录音回放测试完成\n")


def test_beep():
    """测试提示音播放。"""
    print("=" * 50)
    print("【测试3】提示音 play_beep")
    print("=" * 50)
    from audio import play_beep
    print("播放提示音...")
    play_beep()
    print("✓ 提示音测试完成\n")


def test_vad_record():
    """测试 VAD 录音，说话后停顿 1.5 秒自动结束。"""
    print("=" * 50)
    print("【测试4】VAD 录音")
    print("=" * 50)
    try:
        import torch
    except ImportError:
        print("✗ torch 未安装，跳过 VAD 测试")
        return

    from audio import AudioStream, VADRecorder, play_audio

    stream = AudioStream()
    recorder = VADRecorder()

    stream.start()
    print("请说话（停顿 1.5 秒后自动结束）...")
    audio = recorder.record(stream)
    stream.stop()

    duration = len(audio) / config.SAMPLE_RATE
    print(f"录到 {duration:.1f} 秒音频，正在回放...")
    play_audio(audio, config.SAMPLE_RATE)
    print("✓ VAD 录音测试完成\n")


TESTS = {
    "devices": test_devices,
    "record":  test_record_playback,
    "beep":    test_beep,
    "vad":     test_vad_record,
}

if __name__ == "__main__":
    arg = sys.argv[1] if len(sys.argv) > 1 else "all"

    if arg == "all":
        test_devices()
        test_record_playback()
        test_beep()
        test_vad_record()
    elif arg in TESTS:
        TESTS[arg]()
    else:
        print(f"未知测试：{arg}，可选：{list(TESTS.keys())} 或 all")
