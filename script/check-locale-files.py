# Copyright (c) 2026 onelpawarai. All rights reserved.

"""Check every locale file for the mistakes a hand-written dictionary makes.

Duplicate keys silently drop a string, a stray leading space shifts a label,
and a placeholder that came out as a JS expression rather than a string will
not even parse. These are all cheap to detect and expensive to find later, so
every file is scanned after it is written rather than one by one.
"""

import re
import sys
from collections import Counter
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "packages/app/src/i18n"
UI = ROOT / "packages/ui/src/i18n"

ENTRY = re.compile(r'^\s{2}"([^"]+)":\s*(.*?),?\s*$')

# A key whose English value spans two lines puts its string on the following
# line, so the entry line ends on the quote's opening. That is valid source, not
# a broken value, and is not reported.
MULTILINE = re.compile(r'^\s{2}"[^"]+":\s*("|\')\s*$')

# A handful of English strings genuinely begin with a space, because the space
# joins the preceding fragment: "( +{{count}} more)", " to collect your key".
# Those keys are listed rather than judged by a generic leading-space rule.
LEADING_SPACE_OK = {
    "common.moreCountSuffix",
    "provider.connect.zyraxonZen.visit.prefix",
    "provider.connect.zyraxonZen.visit.suffix",
    "provider.connect.oauth.code.visit.prefix",
    "provider.connect.oauth.code.visit.suffix",
    "provider.connect.oauth.auto.visit.prefix",
    "provider.connect.oauth.auto.visit.suffix",
    "provider.custom.description.suffix",
    "provider.custom.description.prefix",
}


def scan(path: Path) -> list[str]:
    problems: list[str] = []
    seen: Counter[str] = Counter()
    lines = path.read_text(encoding="utf-8").splitlines()

    for number, line in enumerate(lines, start=1):
        match = ENTRY.match(line)
        if match is None:
            continue
        key, value = match.group(1), match.group(2)

        seen[key] += 1
        if seen[key] > 1:
            problems.append(f"{path.name}:{number}: duplicate key {key}")

        # A leading space inside the quotes is a typo, never intentional here:
        # every label is written flush against the opening quote.
        if value.startswith('" ') and key not in LEADING_SPACE_OK:
            problems.append(f"{path.name}:{number}: leading space in {key}")

        # An untranslated key is fine, but an expression is not: it means the
        # string was patched with code instead of text.
        if ".replace(" in value or ".trim()" in value or "${" in value:
            problems.append(f"{path.name}:{number}: expression in value for {key}")

        if MULTILINE.match(line):
            continue
        if not (value.startswith('"') or value.startswith("'")):
            problems.append(f"{path.name}:{number}: value is not a string for {key}")

    return problems


def main() -> int:
    targets = sys.argv[1:]
    files = (
        [APP / f"{t}.ts" for t in targets]
        if targets
        else [p for p in sorted(APP.glob("*.ts")) if p.stem not in ("en", "languages", "countries")]
        + [p for p in sorted(UI.glob("*.ts")) if p.stem != "en"]
    )

    found: list[str] = []
    for path in files:
        if not path.exists():
            found.append(f"{path.name}: missing")
            continue
        found.extend(scan(path))

    print(f"scanned {len(files)} file(s)")
    if found:
        print(f"\n{len(found)} problem(s):")
        for item in found:
            print(f"  {item}")
    else:
        print("no duplicate keys, stray spaces or expressions")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())