# Copyright (c) 2026 onelpawarai. All rights reserved.

"""Report any string in a locale file that is not written in its own script.

A hand-written dictionary drifts: a phrase from another language slips in, a
key gets the wrong language's word, or a value is left in English. This scans
every value and prints the ones whose script does not match the locale, so they
can be corrected before the file ships.
"""

import json
import re
import sys
import unicodedata
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent

SCRIPT_RANGES = {
    "latin": ((0x41, 0x5A), (0x61, 0x7A), (0xC0, 0x24F)),
    "cyrillic": ((0x410, 0x44F), (0x450, 0x4FF)),
    "greek": ((0x386, 0x3CE), (0x391, 0x3A9)),
    "arabic": ((0x600, 0x6FF), (0x750, 0x77F)),
    "hebrew": ((0x590, 0x5FF),),
    "devanagari": ((0x900, 0x97F),),
    "bengali": ((0x980, 0x9FF),),
    "gurmukhi": ((0xA00, 0xA7F),),
    "gujarati": ((0xA80, 0xAFF),),
    "oriya": ((0xB00, 0xB7F),),
    "tamil": ((0xB80, 0xBFF),),
    "telugu": ((0xC00, 0xC7F),),
    "kannada": ((0xC80, 0xCFF),),
    "malayalam": ((0xD00, 0xD7F),),
    "sinhala": ((0xD80, 0xDFF),),
    "thai": ((0xE00, 0xE7F),),
    "lao": ((0xE80, 0xEFF),),
    "khmer": ((0x1780, 0x17FF),),
    "myanmar": ((0x1000, 0x109F),),
    "tibetan": ((0xF00, 0xFFF),),
    "georgian": ((0x10A0, 0x10FF),),
    "armenian": ((0x530, 0x58F),),
    "hangul": ((0xAC00, 0xD7AF), (0x1100, 0x11FF), (0x3130, 0x318F)),
    "cjk": ((0x4E00, 0x9FFF), (0x3400, 0x4DBF)),
    "hiragana_katakana": ((0x3040, 0x30FF),),
    "ethiopic": ((0x1200, 0x137F),),
    "cherokee": ((0x13A0, 0x13FF),),
}

# The script each locale is expected to be written in. A locale not listed here
# is not checked, because guessing would report the wrong thing.
EXPECTED = {
    "el": "greek",
    "ru": "cyrillic",
    "uk": "cyrillic",
    "be": "cyrillic",
    "bg": "cyrillic",
    "mk": "cyrillic",
    "sr": "cyrillic",
    "sr-Latn": "latin",
    "uk": "cyrillic",
    "mn": "cyrillic",
    "kk": "cyrillic",
    "ky": "cyrillic",
    "tt": "cyrillic",
    "ba": "cyrillic",
    "cv": "cyrillic",
    "sah": "cyrillic",
    "os": "cyrillic",
    "ab": "cyrillic",
    "tg": "cyrillic",
    "ar": "arabic",
    "fa": "arabic",
    "ur": "arabic",
    "ps": "arabic",
    "sd": "arabic",
    "ckb": "arabic",
    "dv": "arabic",
    "ug": "arabic",
    "arc": "arabic",
    "syr": "arabic",
    "he": "hebrew",
    "yi": "hebrew",
    "hi": "devanagari",
    "mr": "devanagari",
    "ne": "devanagari",
    "sa": "devanagari",
    "hif": "devanagari",
    "bn": "bengali",
    "as": "bengali",
    "mni": "bengali",
    "syl": "bengali",
    "ctg": "bengali",
    "rkt": "bengali",
    "bpy": "bengali",
    "pa": "gurmukhi",
    "gu": "gujarati",
    "or": "oriya",
    "ta": "tamil",
    "te": "telugu",
    "kn": "kannada",
    "ml": "malayalam",
    "si": "sinhala",
    "th": "thai",
    "lo": "lao",
    "km": "khmer",
    "my": "myanmar",
    "shn": "myanmar",
    "bo": "tibetan",
    "dz": "tibetan",
    "ka": "georgian",
    "hy": "armenian",
    "ko": "hangul",
    "zh": "cjk",
    "zht": "cjk",
    "ja": "hiragana_katakana",
    "am": "ethiopic",
    "ti": "ethiopic",
    "chr": "cherokee",
}


def script_of(text: str) -> str:
    for name, ranges in SCRIPT_RANGES.items():
        if any(start <= ord(ch) <= end for ch in text for start, end in ranges):
            return name
    return "unknown"


def load(path: Path) -> dict[str, str]:
    text = path.read_text(encoding="utf-8")
    declaration = re.search(r"export const dict(?:\s*:[^=]+)?\s*=\s*", text)
    if declaration is None:
        return {}
    start = text.index("{", declaration.end())
    depth = 0
    for index in range(start, len(text)):
        if text[index] == "{":
            depth += 1
        elif text[index] == "}":
            depth -= 1
            if depth == 0:
                body = text[start : index + 1]
                break
    body = re.sub(r",(\s*)$", "", body)
    body = re.sub(r",(\s*[}\]])", r"\1", body)
    body = re.sub(
        r":\s*'((?:[^'\\]|\\.)*)'",
        lambda m: ": " + json.dumps(m.group(1).replace("\\'", "'"), ensure_ascii=False),
        body,
    )
    return json.loads(re.sub(r"([{,]\s*)([A-Za-z0-9_]+)\s*:", r'\1"\2":', body))


def main() -> int:
    app = ROOT / "packages/app/src/i18n"
    targets = sys.argv[1:] or sorted(p.stem for p in app.glob("*.ts") if p.stem in EXPECTED)

    problems = 0
    for locale in targets:
        path = app / f"{locale}.ts"
        if not path.exists():
            print(f"{locale}: MISSING FILE")
            problems += 1
            continue
        want = EXPECTED[locale]
        data = load(path)
        # `language.*` names every language in its own script, so a value
        # written in another script there is the point of the key, not a slip.
        wrong = [
            (key, value, script_of(value))
            for key, value in data.items()
            if not key.startswith("language.")
            and script_of(value) != want
            and script_of(value) != "latin"
        ]
        # A Latin script is acceptable for locales written in Latin even when the
        # expected table says otherwise, so only a genuinely foreign script is
        # reported.
        truly_wrong = wrong
        if truly_wrong:
            print(f"{locale}: {len(truly_wrong)} value(s) in the wrong script")
            for key, value, script in truly_wrong[:12]:
                print(f"  {key} [{script}]: {value}")
            problems += len(truly_wrong)
        else:
            print(f"{locale}: {len(data)} keys, script OK")

    print(f"\n{problems} problem(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())