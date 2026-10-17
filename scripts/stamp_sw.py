#!/usr/bin/env python3
"""Stamp the assembled site's sw.js with a version derived from its page files.

The version hashes every file except data/, so pushing a new issue leaves sw.js byte-identical
and installed apps keep running without a reload, while any change to the page code or the
worker produces a new sw.js, a new cache name, and one automatic reload on each installed app.
"""

from __future__ import annotations

import hashlib
import sys
from pathlib import Path

PLACEHOLDER = "const VERSION = 'dev';"


def site_version(site: Path) -> str:
    digest = hashlib.sha256()
    files = sorted((path.relative_to(site).as_posix(), path) for path in site.rglob("*") if path.is_file())
    for rel, path in files:
        if rel.startswith("data/") or rel.startswith("research/"):
            continue
        body = path.read_bytes()
        digest.update(f"{rel}\0{len(body)}\0".encode("utf-8"))
        digest.update(body)
    return digest.hexdigest()[:12]


def main() -> int:
    site = Path(sys.argv[1] if len(sys.argv) > 1 else "_site")
    sw = site / "sw.js"
    try:
        source = sw.read_bytes().decode("utf-8")
    except FileNotFoundError:
        print(f"找不到 {sw}", file=sys.stderr)
        return 1
    if source.count(PLACEHOLDER) != 1:
        print(f"{sw} 里应当恰好有一行 {PLACEHOLDER}", file=sys.stderr)
        return 1
    version = site_version(site)
    sw.write_bytes(source.replace(PLACEHOLDER, f"const VERSION = '{version}';").encode("utf-8"))
    print(f"sw.js version {version}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
