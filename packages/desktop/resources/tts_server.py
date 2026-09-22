import http.server, json, os, tempfile, asyncio, hashlib, threading
from urllib.parse import urlparse, parse_qs
from concurrent.futures import ThreadPoolExecutor
import sys
import subprocess
import importlib

# Auto-install edge-tts if not present
def ensure_edge_tts():
    try:
        importlib.import_module("edge_tts")
    except ImportError:
        print("[TTS] edge-tts not found, installing...", flush=True)
        subprocess.check_call([sys.executable, "-m", "pip", "install", "edge-tts", "--quiet"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print("[TTS] edge-tts installed successfully", flush=True)

ensure_edge_tts()

PORT = 14610
VOICES = {
    "bn": {"f": "bn-BD-NabanitaNeural", "m": "bn-BD-PradeepNeural"},
    "hi": {"f": "hi-IN-SwaraNeural", "m": "hi-IN-MadhurNeural"},
    "en": {"f": "en-US-JennyNeural", "m": "en-US-GuyNeural"},
    "ar": {"f": "ar-AE-FatimaNeural", "m": "ar-AE-HamdanNeural"},
    "es": {"f": "es-ES-ElviraNeural", "m": "es-ES-AlvaroNeural"},
    "fr": {"f": "fr-FR-EloiseNeural", "m": "fr-FR-HenriNeural"},
    "de": {"f": "de-DE-KatjaNeural", "m": "de-DE-ConradNeural"},
    "pt": {"f": "pt-BR-FranciscaNeural", "m": "pt-BR-AntonioNeural"},
    "ru": {"f": "ru-RU-SvetlanaNeural", "m": "ru-RU-DmitryNeural"},
    "ja": {"f": "ja-JP-NanamiNeural", "m": "ja-JP-KeitaNeural"},
    "ko": {"f": "ko-KR-SunHiNeural", "m": "ko-KR-InJoonNeural"},
    "zh": {"f": "zh-CN-XiaoxiaoNeural", "m": "zh-CN-YunxiNeural"},
    "vi": {"f": "vi-VN-HoaiMyNeural", "m": "vi-VN-NamMinhNeural"},
    "it": {"f": "it-IT-IsabellaNeural", "m": "it-IT-DiegoNeural"},
    "th": {"f": "th-TH-PremwadeeNeural", "m": "th-TH-NiwatNeural"},
    "tr": {"f": "tr-TR-EmelNeural", "m": "tr-TR-AhmetNeural"},
    "pl": {"f": "pl-PL-ZofiaNeural", "m": "pl-PL-MarekNeural"},
    "nl": {"f": "nl-NL-ColetteNeural", "m": "nl-NL-MaartenNeural"},
    "uk": {"f": "uk-UA-PolinaNeural", "m": "uk-UA-OstapNeural"},
    "sv": {"f": "sv-SE-SofieNeural", "m": "sv-SE-MattiasNeural"},
    "da": {"f": "da-DK-ChristelNeural", "m": "da-DK-JeppeNeural"},
    "fi": {"f": "fi-FI-NooraNeural", "m": "fi-FI-HarriNeural"},
    "nb": {"f": "nb-NO-PernilleNeural", "m": "nb-NO-FinnNeural"},
    "cs": {"f": "cs-CZ-VlastaNeural", "m": "cs-CZ-AntoninNeural"},
    "ro": {"f": "ro-RO-AlinaNeural", "m": "ro-RO-EmilNeural"},
    "el": {"f": "el-GR-AthinaNeural", "m": "el-GR-NestorasNeural"},
    "he": {"f": "he-IL-HilaNeural", "m": "he-IL-AvriNeural"},
    "hu": {"f": "hu-HU-NoemiNeural", "m": "hu-HU-TamasNeural"},
    "id": {"f": "id-ID-GadisNeural", "m": "id-ID-ArdiNeural"},
    "ms": {"f": "ms-MY-YasminNeural", "m": "ms-MY-OsmanNeural"},
    "ta": {"f": "ta-IN-PallaviNeural", "m": "ta-IN-ValluvarNeural"},
    "te": {"f": "te-IN-ShrutiNeural", "m": "te-IN-MohanNeural"},
    "mr": {"f": "mr-IN-AarohiNeural", "m": "mr-IN-ManoharNeural"},
    "gu": {"f": "gu-IN-DhwaniNeural", "m": "gu-IN-NiranjanNeural"},
    "kn": {"f": "kn-IN-SapnaNeural", "m": "kn-IN-GaganNeural"},
    "ml": {"f": "ml-IN-SobhanaNeural", "m": "ml-IN-MidhunNeural"},
    "ur": {"f": "ur-PK-UzmaNeural", "m": "ur-PK-AsadNeural"},
    "fa": {"f": "fa-IR-DilaraNeural", "m": "fa-IR-FaridNeural"},
    "af": {"f": "af-ZA-AdriNeural", "m": "af-ZA-WillemNeural"},
    "sw": {"f": "sw-KE-ZuriNeural", "m": "sw-KE-RafikiNeural"},
}

TTS_DIR = os.path.join(tempfile.gettempdir(), "zyraxon_tts")
os.makedirs(TTS_DIR, exist_ok=True)

# Thread pool for concurrent TTS generation
_executor = ThreadPoolExecutor(max_workers=8)

# In-memory cache for fast repeated requests (key -> mp3 bytes)
_cache = {}
_cache_lock = threading.Lock()
MAX_CACHE = 200

# Import edge_tts at module level for faster first request
import edge_tts


def _cache_key(text: str, voice: str) -> str:
    return hashlib.md5((text + voice).encode()).hexdigest()


def _generate_sync(text: str, voice: str) -> bytes:
    """Generate TTS audio synchronously in thread pool."""
    key = _cache_key(text, voice)
    with _cache_lock:
        if key in _cache:
            return _cache[key]

    out = os.path.join(TTS_DIR, f"{key}.mp3")

    # Check disk cache first
    if os.path.exists(out) and os.path.getsize(out) > 0:
        with open(out, "rb") as f:
            data = f.read()
        with _cache_lock:
            if len(_cache) < MAX_CACHE:
                _cache[key] = data
        return data

    # Generate new audio
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(
            edge_tts.Communicate(text, voice, rate="+0%", pitch="+0Hz").save(out)
        )
    finally:
        loop.close()

    with open(out, "rb") as f:
        data = f.read()

    # Store in memory cache
    with _cache_lock:
        if len(_cache) < MAX_CACHE:
            _cache[key] = data

    return data


class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        p = urlparse(self.path)
        if p.path == "/speak":
            params = parse_qs(p.query)
            text = params.get("text", [""])[0]
            lang = params.get("lang", ["en"])[0]
            gender = params.get("gender", ["f"])[0]
            if not text:
                self.send_response(400)
                self.end_headers()
                return
            voice = VOICES.get(lang, VOICES["en"]).get(gender, "en-US-JennyNeural")
            try:
                # Submit to thread pool for non-blocking generation
                future = _executor.submit(_generate_sync, text, voice)
                data = future.result(timeout=30)
                self.send_response(200)
                self.send_header("Content-Type", "audio/mpeg")
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Cache-Control", "public, max-age=3600")
                self.end_headers()
                self.wfile.write(data)
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode())
        elif p.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({
                "ok": True,
                "langs": list(VOICES.keys()),
                "cache_size": len(_cache),
                "workers": _executor._max_workers,
            }).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else PORT
    server = http.server.HTTPServer(("127.0.0.1", port), H, bind_and_activate=False)
    server.allow_reuse_address = True
    server.server_bind()
    server.server_activate()
    print(f"TTS server on http://127.0.0.1:{port} (8 workers, cache={MAX_CACHE})", flush=True)
    server.serve_forever()
