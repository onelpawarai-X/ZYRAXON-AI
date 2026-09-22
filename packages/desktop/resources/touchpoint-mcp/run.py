#!/usr/bin/env python3
"""ZYRAXON Touchpoint MCP — 47 tools, accessibility-based, cross-platform."""
import sys, os
from pathlib import Path

_dir = Path(__file__).parent
_libs = _dir / "libs"

# Strategy: prefer system pip packages, use bundled libs only as fallback
# Bundled libs may have compiled extensions (.pyd) that mismatch system Python
try:
    import pydantic
    import pydantic_core
    import mcp
    os.environ.setdefault("TOUCHPOINT_MODE", "no-vision")
    from touchpoint.mcp.server import mcp as _mcp
    if __name__ == "__main__":
        _mcp.run()
except ImportError:
    if _libs.is_dir():
        sys.path.insert(0, str(_libs))
        os.environ["PYTHONPATH"] = str(_libs) + os.pathsep + os.environ.get("PYTHONPATH", "")
    os.environ.setdefault("TOUCHPOINT_MODE", "no-vision")
    from touchpoint.mcp.server import mcp as _mcp
    if __name__ == "__main__":
        _mcp.run()
