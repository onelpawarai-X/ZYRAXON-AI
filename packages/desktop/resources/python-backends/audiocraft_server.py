#!/usr/bin/env python3
"""
ZYRAXON Audiocraft Server — MusicGen Music Generation
Runs as a standalone FastAPI server. Called by BackendManager.

Usage: python audiocraft_server.py --port 11560 --model <path_to_model>
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
        from audiocraft.models import MusicGen
    except ImportError:
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "torch", "audiocraft", "-q"])

install_deps()

import torch
from audiocraft.models import MusicGen
from fastapi import FastAPI
from fastapi.responses import JSONResponse
import uvicorn

app = FastAPI(title="ZYRAXON Audiocraft Server")

model = None
model_name = "facebook/musicgen-medium"

@app.get("/health")
async def health():
    return {"status": "ok", "model": model_name, "device": str(DEVICE)}

@app.post("/generate")
async def generate_music(request: dict):
    global model
    start = time.time()

    try:
        prompt = request.get("prompt", "")
        duration = request.get("duration", 10)
        temperature = request.get("temperature", 1.0)
        top_k = request.get("top_k", 250)
        top_p = request.get("top_p", 0.0)

        if model is None:
            load_model()

        model.set_generation_params(
            duration=min(duration, 30),
            temperature=temperature,
            top_k=top_k,
            top_p=top_p if top_p > 0 else None,
        )

        wav = model.generate([prompt])

        # Save as WAV
        audio_dir = os.path.join(tempfile.gettempdir(), "zyraxon", "audio")
        os.makedirs(audio_dir, exist_ok=True)
        audio_path = os.path.join(audio_dir, f"music_{int(time.time()*1000)}.wav")

        import torchaudio
        torchaudio.save(audio_path, wav[0].cpu(), sample_rate=32000)

        # Also return base64
        buf = io.BytesIO()
        torchaudio.save(buf, wav[0].cpu(), sample_rate=32000, format="wav")
        b64 = base64.b64encode(buf.getvalue()).decode()

        elapsed = (time.time() - start) * 1000
        return {
            "success": True,
            "audio_path": audio_path,
            "audio_base64": b64,
            "sample_rate": 32000,
            "duration_seconds": duration,
            "elapsed_ms": elapsed,
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

def load_model():
    global model, DEVICE
    DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Loading MusicGen model ({model_name})...", flush=True)
    model = MusicGen.get_pretrained(model_name, device=str(DEVICE))
    print("MusicGen model loaded!", flush=True)

DEVICE = "cpu"

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=11560)
    parser.add_argument("--model", type=str, default="facebook/musicgen-medium")
    args = parser.parse_args()

    model_name = args.model if args.model else "facebook/musicgen-medium"
    print(f"ZYRAXON Audiocraft Server starting on port {args.port}...", flush=True)
    print(f"Model: {model_name}", flush=True)
    print("ready", flush=True)
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="error")
