#!/usr/bin/env python3
"""ZYRAXON Touchpoint MCP — 39 tools, accessibility-based, cross-platform."""
import sys, os
from pathlib import Path

_dir = Path(__file__).parent
_libs = _dir / "libs"
if _libs.is_dir():
    sys.path.insert(0, str(_libs))
    os.environ["PYTHONPATH"] = str(_libs) + os.pathsep + os.environ.get("PYTHONPATH", "")
os.environ.setdefault("TOUCHPOINT_MODE", "no-vision")

from zyraxon_touchpoint import mcp

if __name__ == "__main__":
    mcp.run()
