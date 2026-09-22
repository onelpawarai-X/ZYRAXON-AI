"""
ZYRAXON X — Image Generation Tool
Uses Stable Diffusion v1.5 via diffusers for local image generation.
No cloud dependency.
"""
import sys
import os
import time
import json
import argparse
from pathlib import Path

def main():
    parser = argparse.ArgumentParser(description="ZYRAXON Image Generator")
    parser.add_argument("prompt", help="Text prompt for image generation")
    parser.add_argument("--output", "-o", default=None, help="Output file path")
    parser.add_argument("--width", "-W", type=int, default=512, help="Image width")
    parser.add_argument("--height", "-H", type=int, default=512, help="Image height")
    parser.add_argument("--steps", type=int, default=25, help="Number of inference steps")
    parser.add_argument("--guidance", type=float, default=7.5, help="Guidance scale")
    parser.add_argument("--seed", type=int, default=None, help="Random seed")
    parser.add_argument("--model", default="stable-diffusion-v1-5/stable-diffusion-v1-5", help="Model ID")
    parser.add_argument("--skip-download", action="store_true", help="Skip model download check")
    args = parser.parse_args()

    try:
        import torch
        from diffusers import StableDiffusionPipeline, DPMSolverMultistepScheduler
    except ImportError as e:
        print(json.dumps({"error": f"Missing dependency: {e}. Install with: pip install torch diffusers transformers accelerate"}))
        sys.exit(1)

    model_id = args.model
    cache_dir = os.path.join(os.path.expanduser("~"), ".zyraxon", "models", "diffusers")

    print(f"[image-gen] Loading model: {model_id}", file=sys.stderr)
    print(f"[image-gen] Cache: {cache_dir}", file=sys.stderr)

    start_load = time.time()

    try:
        pipe = StableDiffusionPipeline.from_pretrained(
            model_id,
            torch_dtype=torch.float32,
            cache_dir=cache_dir,
            safety_checker=None,
            requires_safety_checker=False,
        )
        pipe.scheduler = DPMSolverMultistepScheduler.from_config(pipe.scheduler.config)
        pipe = pipe.to("cpu")

        # Enable attention slicing for lower memory
        pipe.enable_attention_slicing()
    except Exception as e:
        print(json.dumps({"error": f"Failed to load model: {e}"}))
        sys.exit(1)

    load_time = time.time() - start_load
    print(f"[image-gen] Model loaded in {load_time:.1f}s", file=sys.stderr)

    # Set seed
    generator = None
    if args.seed is not None:
        generator = torch.Generator("cpu").manual_seed(args.seed)

    # Generate
    print(f"[image-gen] Generating image: {args.prompt}", file=sys.stderr)
    start_gen = time.time()

    try:
        result = pipe(
            prompt=args.prompt,
            width=args.width,
            height=args.height,
            num_inference_steps=args.steps,
            guidance_scale=args.guidance,
            generator=generator,
        )
        image = result.images[0]
    except Exception as e:
        print(json.dumps({"error": f"Generation failed: {e}"}))
        sys.exit(1)

    gen_time = time.time() - start_gen
    print(f"[image-gen] Generated in {gen_time:.1f}s", file=sys.stderr)

    # Save
    if args.output:
        output_path = args.output
    else:
        output_dir = os.path.join(os.path.expanduser("~"), ".zyraxon", "output")
        os.makedirs(output_dir, exist_ok=True)
        timestamp = int(time.time())
        output_path = os.path.join(output_dir, f"image_{timestamp}.png")

    os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else ".", exist_ok=True)
    image.save(output_path, "PNG")

    # Output JSON result
    result_data = {
        "success": True,
        "path": output_path,
        "width": image.width,
        "height": image.height,
        "prompt": args.prompt,
        "load_time_sec": round(load_time, 1),
        "gen_time_sec": round(gen_time, 1),
        "model": model_id,
    }
    print(json.dumps(result_data))

if __name__ == "__main__":
    main()
