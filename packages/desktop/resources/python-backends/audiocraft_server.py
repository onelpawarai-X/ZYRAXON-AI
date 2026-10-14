#!/usr/bin/env python3
# Copyright (c) 2026 onelpawarai. All rights reserved.

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
    except ImportError:
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "torch", "--index-url", "https://download.pytorch.org/whl/cpu", "-q"])
    # MusicGen ships inside transformers now. The standalone `audiocraft` package
    # only builds on older Python versions, so transformers is the portable path.
    try:
        from transformers import MusicgenForConditionalGeneration  # noqa: F401
    except ImportError:
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "transformers", "numpy", "scipy", "-q"])

install_deps()

import numpy as np
import torch
from transformers import AutoProcessor, MusicgenForConditionalGeneration
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

        inputs = processor(text=[prompt], return_tensors="pt").to(DEVICE)
        # MusicGen decodes ~50 frames per second of audio, so the requested
        # duration maps directly onto the token budget.
        max_new_tokens = max(32, min(int(duration) * 50, 1500))
        with torch.no_grad():
            audio = model.generate(
                **inputs,
                max_new_tokens=max_new_tokens,
                do_sample=True,
                temperature=temperature,
                top_k=top_k,
                top_p=top_p if top_p > 0 else 1.0,
            )

        wav = audio[0, 0].cpu().numpy().astype(np.float32)
        sample_rate = model.config.audio_encoder.sampling_rate

        # Save as WAV
        audio_dir = os.path.join(tempfile.gettempdir(), "zyraxon", "audio")
        os.makedirs(audio_dir, exist_ok=True)
        audio_path = os.path.join(audio_dir, f"music_{int(time.time()*1000)}.wav")
        write_wav(audio_path, sample_rate, wav)

        # Also return base64
        buf = io.BytesIO()
        write_wav(buf, sample_rate, wav)
        b64 = base64.b64encode(buf.getvalue()).decode()

        elapsed = (time.time() - start) * 1000
        return {
            "success": True,
            "audio_path": audio_path,
            "audio_base64": b64,
            "sample_rate": sample_rate,
            "duration_seconds": len(wav) / sample_rate,
            "elapsed_ms": elapsed,
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

def write_wav(target, sample_rate: int, wav):
    """Write 16-bit PCM without pulling in torchaudio."""
    import wave

    pcm = np.clip(wav, -1.0, 1.0)
    pcm = (pcm * 32767.0).astype("<i2")
    handle = wave.open(target, "wb")
    try:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(sample_rate)
        handle.writeframes(pcm.tobytes())
    finally:
        handle.close()

def load_model():
    global model, processor, DEVICE
    DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Loading MusicGen model ({model_name})...", flush=True)
    processor = AutoProcessor.from_pretrained(model_name)
    model = MusicgenForConditionalGeneration.from_pretrained(model_name).to(DEVICE)
    print("MusicGen model loaded!", flush=True)

DEVICE = "cpu"
processor = None

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
