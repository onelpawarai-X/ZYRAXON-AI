#!/usr/bin/env python3
"""
ZYRAXON Bark Server — Text-to-Speech
Runs as a standalone FastAPI server. Called by BackendManager.

Usage: python bark_server.py --port 11570
"""
import argparse
import base64
import io
import os
import sys
import time
import tempfile
from pathlib import Path

def install_deps():
    try:
        import fastapi
        import uvicorn
    except ImportError:
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "fastapi", "uvicorn[standard]", "-q"])
    try:
        import torch
        from bark import SAMPLE_RATE, generate_audio, preload_models
    except ImportError:
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "torch", "bark", "-q"])

install_deps()

import torch
from bark import SAMPLE_RATE, generate_audio, preload_models
from fastapi import FastAPI
from fastapi.responses import JSONResponse
import uvicorn

app = FastAPI(title="ZYRAXON Bark TTS Server")

loaded = False

@app.get("/health")
async def health():
    return {"status": "ok", "loaded": loaded, "sample_rate": SAMPLE_RATE}

@app.post("/tts")
async def text_to_speech(request: dict):
    global loaded
    start = time.time()

    try:
        text = request.get("text", "")
        voice_preset = request.get("voice_preset", "v2/en_speaker_0")

        if not loaded:
            print("Loading Bark models...", flush=True)
            preload_models()
            loaded = True
            print("Bark models loaded!", flush=True)

        # Generate audio
        audio_array = generate_audio(text, history_prompt=voice_preset)

        # Save as WAV
        audio_dir = os.path.join(tempfile.gettempdir(), "zyraxon", "tts")
        os.makedirs(audio_dir, exist_ok=True)
        audio_path = os.path.join(audio_dir, f"tts_{int(time.time()*1000)}.wav")

        import numpy as np
        import scipy.io.wavfile as wavfile
        audio_int16 = (audio_array * 32767).astype(np.int16)
        wavfile.write(audio_path, SAMPLE_RATE, audio_int16)

        # Return base64
        buf = io.BytesIO()
        wavfile.write(buf, SAMPLE_RATE, audio_int16)
        b64 = base64.b64encode(buf.getvalue()).decode()

        elapsed = (time.time() - start) * 1000
        return {
            "success": True,
            "audio_path": audio_path,
            "audio_base64": b64,
            "sample_rate": SAMPLE_RATE,
            "elapsed_ms": elapsed,
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=11570)
    args = parser.parse_args()

    print(f"ZYRAXON Bark TTS Server starting on port {args.port}...", flush=True)
    print("ready", flush=True)
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="error")
