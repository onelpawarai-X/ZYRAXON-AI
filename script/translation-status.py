"""List registry locales that Argos can translate but that are not written yet.

Used to drive the translation run in batches and to report what is left, so a
run can be resumed and nothing is assumed complete because a process exited.
"""

import re
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "packages/app/src/i18n"
UI = ROOT / "packages/ui/src/i18n"

ARGOS = {
    "ar", "az", "bg", "bn", "ca", "cs", "da", "de", "el", "eo", "es", "et", "eu",
    "fa", "fi", "fr", "ga", "gl", "he", "hi", "hu", "id", "it", "ja", "ko", "ky",
    "lt", "lv", "ms", "nb", "nl", "pb", "pl", "pt", "ro", "ru", "sk", "sl", "sq",
    "sv", "sw", "th", "tl", "tr", "uk", "ur", "vi", "zh", "zt",
}
ALIAS = {"zh": "zh", "zht": "zt", "pt-BR": "pt", "no": "nb", "br": "pt"}


def registry() -> list[str]:
    source = (APP / "languages.ts").read_text(encoding="utf-8")
    return sorted({m.group(1) for m in re.finditer(r'code:\s*"([^"]+)"', source)})


def key_counts() -> tuple[int, int]:
    def count(path: Path) -> int:
        text = path.read_text(encoding="utf-8")
        body = text[text.index("{", text.index("export const dict")):]
        return len(re.findall(r'^\s*"[^"]+":', body, re.M))

    return count(APP / "en.ts"), count(UI / "en.ts")


def main() -> int:
    codes = [c for c in registry() if c != "en"]
    done = {p.stem for p in APP.glob("*.ts")} - {"en", "countries", "languages"}

    def supported(code: str) -> bool:
        return ALIAS.get(code, code.split("-")[0]) in ARGOS

    argos_todo = [c for c in codes if c not in done and supported(c)]
    no_model = [c for c in codes if c not in done and not supported(c)]
    app_keys, ui_keys = key_counts()

    print(f"registry locales : {len(codes)}")
    print(f"english keys    : app {app_keys}, ui {ui_keys}  (total {app_keys + ui_keys})")
    print(f"written so far  : {len(done)}")
    print(f"argos pending   : {len(argos_todo)}")
    print(f"no model yet    : {len(no_model)}")
    if argos_todo:
        print("\nnext batch:")
        print(" ".join(argos_todo[:12]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())