#!/usr/bin/env python
"""Download every Argos Translate model this project can use.

Argos runs the translation locally once a model is installed, so this is the
only step that needs the network. Each model is checked before download and the
script skips anything already present, so it is safe to rerun after adding a
locale to the registry.
"""

import sys

import argostranslate.package as package


def main() -> int:
    package.update_package_index()
    available = package.get_available_packages()

    if not available:
        print("No packages found in the Argos index.", file=sys.stderr)
        return 1

    installed = {(item.from_code, item.to_code) for item in package.get_installed_packages()}
    wanted = [item for item in available if (item.from_code, "en") in installed]

    print(f"Index lists {len(available)} model(s); {len(wanted)} already installed.")
    for item in wanted:
        print(f"  have {item.from_code} -> {item.to_code}")

    todo = [item for item in available if (item.from_code, "en") not in installed]
    print(f"Downloading {len(todo)} model(s)...\n")

    for index, item in enumerate(todo, start=1):
        label = f"{item.from_code} -> {item.to_code}"
        print(f"[{index}/{len(todo)}] {label} ... ", end="", flush=True)
        try:
            path = item.download()
            package.install_from_path(path)
            print("done")
        except Exception as error:  # noqa: BLE001 - one bad model must not stop the rest
            print(f"FAILED ({error})")

    installed_now = {(item.from_code, item.to_code) for item in package.get_installed_packages()}
    print(f"\nInstalled English pairings: {len(installed_now)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())