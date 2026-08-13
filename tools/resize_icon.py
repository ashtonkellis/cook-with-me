#!/usr/bin/env python3
"""Resize a square source PNG into the app-icon sizes — no third-party deps.

Decodes a colortype-2 (RGB) or colortype-6 (RGBA) 8-bit PNG, box-downscales it,
and writes icon-192.png, icon-512.png, and a padded icon-maskable-512.png
(content scaled into the maskable safe zone on the source's background color).

Usage: python3 tools/resize_icon.py <source.png>
"""
import os
import struct
import sys
import zlib


def decode_png(path):
    data = open(path, 'rb').read()
    assert data[:8] == b'\x89PNG\r\n\x1a\n', 'not a PNG'
    pos = 8
    width = height = bitdepth = colortype = None
    idat = bytearray()
    while pos < len(data):
        (ln,) = struct.unpack('>I', data[pos:pos + 4])
        typ = data[pos + 4:pos + 8]
        chunk = data[pos + 8:pos + 8 + ln]
        if typ == b'IHDR':
            width, height, bitdepth, colortype = struct.unpack('>IIBB', chunk[:10])
        elif typ == b'IDAT':
            idat += chunk
        elif typ == b'IEND':
            break
        pos += 12 + ln
    assert bitdepth == 8 and colortype in (2, 6), f'unsupported PNG ({bitdepth},{colortype})'
    channels = 3 if colortype == 2 else 4
    raw = zlib.decompress(bytes(idat))
    stride = width * channels
    out = bytearray(width * height * 3)  # always emit RGB
    prev = bytearray(stride)
    p = 0

    def paeth(a, b, c):
        pp = a + b - c
        pa, pb, pc = abs(pp - a), abs(pp - b), abs(pp - c)
        if pa <= pb and pa <= pc:
            return a
        return b if pb <= pc else c

    for y in range(height):
        f = raw[p]; p += 1
        line = bytearray(raw[p:p + stride]); p += stride
        if f == 1:  # Sub
            for i in range(channels, stride):
                line[i] = (line[i] + line[i - channels]) & 255
        elif f == 2:  # Up
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 255
        elif f == 3:  # Average
            for i in range(stride):
                a = line[i - channels] if i >= channels else 0
                line[i] = (line[i] + ((a + prev[i]) >> 1)) & 255
        elif f == 4:  # Paeth
            for i in range(stride):
                a = line[i - channels] if i >= channels else 0
                c = prev[i - channels] if i >= channels else 0
                line[i] = (line[i] + paeth(a, prev[i], c)) & 255
        # copy RGB (skip alpha if present)
        o = y * width * 3
        for x in range(width):
            s = x * channels
            out[o + x * 3] = line[s]
            out[o + x * 3 + 1] = line[s + 1]
            out[o + x * 3 + 2] = line[s + 2]
        prev = line
    return width, height, out


def box_resize(src, w, h, tw, th):
    dst = bytearray(tw * th * 3)
    for ty in range(th):
        y0 = ty * h // th
        y1 = max(y0 + 1, (ty + 1) * h // th)
        for tx in range(tw):
            x0 = tx * w // tw
            x1 = max(x0 + 1, (tx + 1) * w // tw)
            r = g = b = 0
            n = 0
            for yy in range(y0, y1):
                base = (yy * w + x0) * 3
                for _ in range(x0, x1):
                    r += src[base]; g += src[base + 1]; b += src[base + 2]
                    base += 3
                    n += 1
            o = (ty * tw + tx) * 3
            dst[o] = r // n; dst[o + 1] = g // n; dst[o + 2] = b // n
    return dst


def encode_png(path, w, h, rgb):
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        raw += rgb[y * w * 3:(y + 1) * w * 3]

    def chunk(typ, d):
        return struct.pack('>I', len(d)) + typ + d + struct.pack('>I', zlib.crc32(typ + d) & 0xFFFFFFFF)

    ihdr = struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)  # colortype 2 = RGB
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) +
                chunk(b'IDAT', zlib.compress(bytes(raw), 9)) + chunk(b'IEND', b''))
    print('wrote', path, f'{w}x{h}')


def maskable(src, w, h, size, safe=0.80):
    """Scale content into the centered safe zone on the source's bg color."""
    bg = (src[0], src[1], src[2])  # top-left corner = background
    inner = int(size * safe)
    scaled = box_resize(src, w, h, inner, inner)
    canvas = bytearray(size * size * 3)
    for i in range(0, len(canvas), 3):
        canvas[i], canvas[i + 1], canvas[i + 2] = bg
    off = (size - inner) // 2
    for y in range(inner):
        dst = ((y + off) * size + off) * 3
        canvas[dst:dst + inner * 3] = scaled[y * inner * 3:(y + 1) * inner * 3]
    return canvas


if __name__ == '__main__':
    src_path = sys.argv[1]
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    icons = os.path.join(root, 'icons')
    w, h, rgb = decode_png(src_path)
    print('decoded', w, 'x', h)
    encode_png(os.path.join(icons, 'icon-512.png'), 512, 512, box_resize(rgb, w, h, 512, 512))
    encode_png(os.path.join(icons, 'icon-192.png'), 192, 192, box_resize(rgb, w, h, 192, 192))
    encode_png(os.path.join(icons, 'icon-maskable-512.png'), 512, 512, maskable(rgb, w, h, 512))
