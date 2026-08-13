#!/usr/bin/env python3
"""Generate PNG app icons (no third-party deps) matching icons/icon.svg.

Draws an orange rounded-square with a white clock, supersampled for smooth edges.
Outputs icon-192.png, icon-512.png, icon-maskable-512.png in icons/.
"""
import math
import os
import struct
import zlib

BG = (194, 65, 12)      # #c2410c
FG = (255, 247, 237)    # #fff7ed
SS = 4                  # supersampling factor


def blend(dst, src, a):
    return tuple(round(d * (1 - a) + s * a) for d, s in zip(dst, src))


def rounded_rect(x, y, w, h, r, px, py):
    """Signed coverage test for a rounded rect (returns True if inside)."""
    cx = min(max(px, x + r), x + w - r)
    cy = min(max(py, y + r), y + h - r)
    if x + r <= px <= x + w - r or y + r <= py <= y + h - r:
        return x <= px <= x + w and y <= py <= y + h
    return (px - cx) ** 2 + (py - cy) ** 2 <= r * r


def stroke_circle(px, py, cx, cy, rad, half):
    d = math.hypot(px - cx, py - cy)
    return abs(d - rad) <= half


def stroke_seg(px, py, x1, y1, x2, y2, half):
    dx, dy = x2 - x1, y2 - y1
    L2 = dx * dx + dy * dy
    t = 0 if L2 == 0 else max(0, min(1, ((px - x1) * dx + (py - y1) * dy) / L2))
    projx, projy = x1 + t * dx, y1 + t * dy
    return math.hypot(px - projx, py - projy) <= half


def render(size, maskable=False):
    S = size * SS
    # geometry in the 512 design space, scaled to S
    scale = S / 512.0
    pad = 60 * scale if maskable else 0  # keep clock inside maskable safe zone
    inset = pad

    def sc(v):
        return v * scale

    cx, cy, rad = sc(256), sc(288), sc(150)
    stroke = 24 * scale / 2
    # shrink clock for maskable padding
    if maskable:
        shrink = (S - 2 * inset) / S
        def m(v):
            return inset + v * shrink
        cx, cy, rad = m(sc(256)), m(sc(288)), sc(150) * shrink
        stroke *= shrink

    rr = 112 * scale
    buf = bytearray()
    for j in range(S):
        for i in range(S):
            px, py = i + 0.5, j + 0.5
            if maskable:
                col = BG  # full-bleed background for maskable
            elif rounded_rect(0, 0, S, S, rr, px, py):
                col = BG
            else:
                buf.extend((0, 0, 0, 0))
                continue
            # clock marks in FG
            if maskable:
                inside_bg = True
            else:
                inside_bg = True
            fg = False
            if stroke_circle(px, py, cx, cy, rad, stroke):
                fg = True
            elif stroke_seg(px, py, cx, cy, cx, cy - rad * 0.61, stroke):  # hour hand up
                fg = True
            elif stroke_seg(px, py, cx, cy, cx + rad * 0.44, cy, stroke):  # minute hand right
                fg = True
            # little knob on top of clock
            top = cy - rad - sc(178) + sc(178)
            if stroke_seg(px, py, cx, cy - rad, cx, cy - rad - 40 * scale, stroke):
                fg = True
            if stroke_seg(px, py, cx - 46 * scale, cy - rad - 40 * scale,
                          cx + 46 * scale, cy - rad - 40 * scale, stroke):
                fg = True
            col = FG if fg else col
            buf.extend((col[0], col[1], col[2], 255))

    # downsample SS x SS -> size
    out = bytearray()
    for j in range(size):
        row = bytearray()
        row.append(0)  # filter byte
        for i in range(size):
            r = g = b = a = 0
            for dj in range(SS):
                for di in range(SS):
                    idx = (((j * SS + dj) * S) + (i * SS + di)) * 4
                    r += buf[idx]; g += buf[idx + 1]; b += buf[idx + 2]; a += buf[idx + 3]
            n = SS * SS
            row += bytes((r // n, g // n, b // n, a // n))
        out += row
    return bytes(out)


def write_png(path, size, raw):
    def chunk(typ, data):
        c = struct.pack(">I", len(data)) + typ + data
        return c + struct.pack(">I", zlib.crc32(typ + data) & 0xFFFFFFFF)

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    idat = zlib.compress(raw, 9)
    with open(path, "wb") as f:
        f.write(sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b""))
    print("wrote", path)


if __name__ == "__main__":
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    icons = os.path.join(here, "icons")
    os.makedirs(icons, exist_ok=True)
    write_png(os.path.join(icons, "icon-192.png"), 192, render(192))
    write_png(os.path.join(icons, "icon-512.png"), 512, render(512))
    write_png(os.path.join(icons, "icon-maskable-512.png"), 512, render(512, maskable=True))
