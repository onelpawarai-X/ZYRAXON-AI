import asyncio
import edge_tts
import sys
import os
import tempfile
import subprocess

VOICES = {
    "bn-female": "bn-BD-NabanitaNeural",
    "bn-male": "bn-BD-PradeepNeural",
    "en-female": "en-US-JennyNeural",
    "en-male": "en-US-GuyNeural",
    "hi-female": "hi-IN-SwaraNeural",
    "hi-male": "hi-IN-MadhurNeural",
    "ar-female": "ar-SA-ZariyahNeural",
    "ar-male": "ar-SA-HamedNeural",
    "ja-female": "ja-JP-NanamiNeural",
    "ja-male": "ja-JP-KeitaNeural",
    "zh-female": "zh-CN-XiaoxiaoNeural",
    "zh-male": "zh-CN-YunxiNeural",
    "ko-female": "ko-KR-SunHiNeural",
    "ko-male": "ko-KR-InJoonNeural",
    "ru-female": "ru-RU-SvetlanaNeural",
    "ru-male": "ru-RU-DmitryNeural",
    "fr-female": "fr-FR-DeniseNeural",
    "fr-male": "fr-FR-HenriNeural",
    "de-female": "de-DE-KatjaNeural",
    "de-male": "de-DE-ConradNeural",
    "es-female": "es-ES-ElviraNeural",
    "es-male": "es-ES-AlvaroNeural",
    "pt-female": "pt-BR-FranciscaNeural",
    "pt-male": "pt-BR-AntonioNeural",
}

async def generate(text, voice_key, out_path):
    voice = VOICES.get(voice_key, "en-US-JennyNeural")
    comm = edge_tts.Communicate(text, voice, rate="+0%", pitch="+0Hz")
    await comm.save(out_path)

def play_silent(mp3_path):
    """Play MP3 silently using PowerShell - no window opens"""
    safe_path = mp3_path.replace("'", "''")
    ps_script = f'''
Add-Type -AssemblyName PresentationCore
$player = New-Object System.Windows.Media.MediaPlayer
$player.Open([System.Uri]::new('{safe_path}'))
$player.Volume = 1.0
$player.Play()
$sw = [System.Diagnostics.Stopwatch]::StartNew()
while ($sw.ElapsedMilliseconds -lt 500) {{ Start-Sleep -Milliseconds 50 }}
while ($player.Position -lt $player.NaturalDuration.TimeSpan) {{
    Start-Sleep -Milliseconds 100
}}
$player.Stop()
$player.Close()
'''
    result = subprocess.run(
        ["powershell", "-STA", "-WindowStyle", "Hidden", "-Command", ps_script],
        timeout=60, capture_output=True, text=True
    )
    if result.returncode != 0 and result.stderr:
        print(f"WARN: {result.stderr.strip()}", file=sys.stderr)

if __name__ == "__main__":
    text = sys.argv[1] if len(sys.argv) > 1 else "Hello, I am Zyraxon AI"
    voice_key = sys.argv[2] if len(sys.argv) > 2 else "en-female"
    
    tmp = os.path.join(tempfile.gettempdir(), "zyraxon_tts.mp3")
    asyncio.run(generate(text, voice_key, tmp))
    play_silent(tmp)
    print(f"OK: {voice_key} -> {VOICES.get(voice_key)}")
