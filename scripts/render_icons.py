#!/usr/bin/env python3
"""Rasterize the 讯息窗 icon. The SVG is the source; PNGs are committed so the site has no build step."""

import math
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "icons"

BG = (14, 14, 17)
PANE = (255, 255, 255)
ACCENT = (240, 70, 26)


def sd_round_rect(px, py, x, y, w, h, r):
    cx, cy = x + w / 2, y + h / 2
    hx, hy = w / 2 - r, h / 2 - r
    dx, dy = abs(px - cx) - hx, abs(py - cy) - hy
    return math.hypot(max(dx, 0), max(dy, 0)) + min(max(dx, dy), 0) - r


def scene(px, py):
    color = BG
    panes = (
        (128, 128, PANE),
        (272, 128, ACCENT),
        (128, 272, PANE),
        (272, 272, PANE),
    )
    for x, y, pane in panes:
        if sd_round_rect(px, py, x, y, 112, 112, 24) <= 0:
            color = pane
    return color


def render(size, samples):
    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            acc = [0, 0, 0]
            for j in range(samples):
                for i in range(samples):
                    px = (x + (i + 0.5) / samples) * 512 / size
                    py = (y + (j + 0.5) / samples) * 512 / size
                    color = scene(px, py)
                    acc[0] += color[0]
                    acc[1] += color[1]
                    acc[2] += color[2]
            count = samples * samples
            row.extend((acc[0] // count, acc[1] // count, acc[2] // count, 255))
        rows.append(row)
    return rows


def chunk(tag, data):
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def write_png(path, size, samples):
    raw = bytearray()
    for row in render(size, samples):
        raw.append(0)
        raw.extend(row)
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")
    path.write_bytes(png)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    write_png(OUT / "icon-512.png", 512, 3)
    write_png(OUT / "icon-192.png", 192, 2)
    write_png(OUT / "apple-touch-icon.png", 180, 2)
    print("wrote icons")


if __name__ == "__main__":
    main()
