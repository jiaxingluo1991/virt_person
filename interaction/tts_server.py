"""
tts_server.py - MeloTTS HTTP 服务

在 melotts conda 环境中运行，监听 127.0.0.1:8081
提供 POST /tts 接口，接收文本，返回 WAV 音频。

启动方式：
  conda activate melotts
  cd /home/jiaxingluo/01_repo/01_tts_demo
  python tts_server.py
"""

import io
import tempfile
import os
import numpy as np
import wave
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
import uvicorn

HOST = "127.0.0.1"
PORT = 8081

app = FastAPI()

print("加载 MeloTTS 模型...", flush=True)
from melo.api import TTS
model = TTS(language='ZH', device='auto')
SPEAKER_ID = model.hps.data.spk2id['ZH']
SAMPLE_RATE = model.hps.data.sampling_rate
print(f"模型加载完成，采样率：{SAMPLE_RATE} Hz", flush=True)


class TTSRequest(BaseModel):
    text: str


@app.get("/health")
def health():
    return {"status": "ok", "sample_rate": SAMPLE_RATE}


@app.post("/tts")
def tts(req: TTSRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="text is empty")

    try:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            tmp_path = f.name
        model.tts_to_file(req.text, SPEAKER_ID, tmp_path, speed=1.0, quiet=True)
        with open(tmp_path, "rb") as f:
            wav_bytes = f.read()
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)

    return Response(content=wav_bytes, media_type="audio/wav")


if __name__ == "__main__":
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")
