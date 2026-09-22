#!/usr/bin/env python3
import sys, os
from pathlib import Path

_dir = Path(__file__).parent
_libs = _dir / "libs"
if _libs.is_dir():
    sys.path.insert(0, str(_libs))
    os.environ["PYTHONPATH"] = str(_libs) + os.pathsep + os.environ.get("PYTHONPATH", "")

import argparse

def main():
    parser = argparse.ArgumentParser(description="ZYRAXON Cross-Platform MCP Server v2")
    parser.add_argument("--transport", choices=["stdio", "sse"], default="stdio")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8080)
    args = parser.parse_args()
    from server import mcp
    if args.transport == "sse":
        mcp.run(transport="sse", host=args.host, port=args.port)
    else:
        mcp.run(transport="stdio")

if __name__ == "__main__":
    main()
