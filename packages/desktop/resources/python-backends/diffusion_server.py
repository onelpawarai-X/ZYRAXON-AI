#!/usr/bin/env python3
"""
ZYRAXON Diffusion Server — FLUX.1 Image Generation
Runs as a standalone FastAPI server. Called by BackendManager.

Usage: python diffusion_server.py --port 11550 --model <path_to_gguf_or_safetensors>
"""
import argparse
import base64
import io
import os
import sys
import time
import tempfile
import json
from pathlib import Path

def install_deps():
    """Install required packages if missing."""
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
        subprocess.check_call([sys.executable, "-m", "pip", "install", "torch", "--index-url", "https://download.pytorch.org/whl/cu121", "-q"])
    try:
        from diffusers import StableDiffusionPipeline
    except ImportError:
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "diffusers", "transformers", "accelerate", "-q"])

install_deps()

import torch
from fastapi import FastAPI
from fastapi.responses import JSONResponse
import uvicorn

app = FastAPI(title="ZYRAXON Diffusion Server")

# Global model reference
pipe = None
model_path = None

@app.get("/health")
async def health():
    return {"status": "ok", "model": model_path, "device": str(DEVICE)}

@app.post("/generate")
async def generate_image(request: dict):
    global pipe
    start = time.time()

    try:
        prompt = request.get("prompt", "")
        width = request.get("width", 1024)
        height = request.get("height", 1024)
        steps = request.get("steps", 20)
        guidance_scale = request.get("guidance_scale", 7.5)
        seed = request.get("seed", None)
        negative_prompt = request.get("negative_prompt", "")

        if pipe is None:
            load_model()

        generator = None
        if seed is not None:
            generator = torch.Generator(device=DEVICE).manual_seed(seed)

        with torch.no_grad():
            result = pipe(
                prompt=prompt,
                negative_prompt=negative_prompt if negative_prompt else None,
                width=width,
                height=height,
                num_inference_steps=steps,
                guidance_scale=guidance_scale,
                generator=generator,
            )

        image = result.images[0]

        # Save to temp file
        img_dir = os.path.join(tempfile.gettempdir(), "zyraxon", "images")
        os.makedirs(img_dir, exist_ok=True)
        img_path = os.path.join(img_dir, f"gen_{int(time.time()*1000)}.png")
        image.save(img_path, "PNG")

        # Also return as base64
        buf = io.BytesIO()
        image.save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode()

        elapsed = (time.time() - start) * 1000
        return {
            "success": True,
            "image_path": img_path,
            "image_base64": b64,
            "elapsed_ms": elapsed,
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

@app.post("/generate-video")
async def generate_video(request: dict):
    """Generate video frames (simplified — returns image sequence as GIF)."""
    global pipe
    start = time.time()

    try:
        prompt = request.get("prompt", "")
        num_frames = request.get("num_frames", 16)

        if pipe is None:
            load_model()

        # Generate multiple images as "frames"
        frames = []
        for i in range(min(num_frames, 8)):
            with torch.no_grad():
                result = pipe(
                    prompt=prompt,
                    width=512,
                    height=512,
                    num_inference_steps=10,
                )
                frames.append(result.images[0])

        # Save as GIF
        vid_dir = os.path.join(tempfile.gettempdir(), "zyraxon", "videos")
        os.makedirs(vid_dir, exist_ok=True)
        vid_path = os.path.join(vid_dir, f"vid_{int(time.time()*1000)}.gif")
        frames[0].save(vid_path, save_all=True, append_images=frames[1:], duration=125, loop=0)

        elapsed = (time.time() - start) * 1000
        return {
            "success": True,
            "video_path": vid_path,
            "elapsed_ms": elapsed,
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

def load_model():
    global pipe, DEVICE
    DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

    if model_path and model_path.endswith(".gguf"):
        # GGUF models need llama.cpp — fallback to StableDiffusionPipeline
        print(f"Loading fallback SD model (GGUF not directly supported by diffusers)...", flush=True)
        from diffusers import StableDiffusionPipeline
        pipe = StableDiffusionPipeline.from_pretrained(
            "stable-diffusion-v1-5/stable-diffusion-v1-5",
            torch_dtype=torch.float16 if DEVICE == "cuda" else torch.float32,
        )
        pipe = pipe.to(DEVICE)
    elif model_path:
        print(f"Loading model from {model_path}...", flush=True)
        from diffusers import DiffusionPipeline
        pipe = DiffusionPipeline.from_pretrained(
            model_path,
            torch_dtype=torch.float16 if DEVICE == "cuda" else torch.float32,
        )
        pipe = pipe.to(DEVICE)
    else:
        # Default: load SD 1.5
        print("Loading default Stable Diffusion v1.5...", flush=True)
        from diffusers import StableDiffusionPipeline
        pipe = StableDiffusionPipeline.from_pretrained(
            "stable-diffusion-v1-5/stable-diffusion-v1-5",
            torch_dtype=torch.float16 if DEVICE == "cuda" else torch.float32,
        )
        pipe = pipe.to(DEVICE)

    print("Model loaded successfully!", flush=True)

DEVICE = "cpu"

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=11550)
    parser.add_argument("--model", type=str, default="")
    parser.add_argument("--mode", type=str, default="image")
    args = parser.parse_args()

    model_path = args.model if args.model else None
    print(f"ZYRAXON Diffusion Server starting on port {args.port}...", flush=True)
    print(f"Model: {model_path or 'default (SD 1.5)'}", flush=True)
    print("ready", flush=True)
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="error")
