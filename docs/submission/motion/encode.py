"""Encodes the PNG frames from render.mjs into an H.264 MP4.

Uses the GPU's encoder (NVENC) or Windows Media Foundation, not libx264 (GPL).

uv run --no-project --with av --with pillow python encode.py <frames-dir> <out.mp4> [fps]
"""

import sys
from fractions import Fraction
from pathlib import Path

import av
from PIL import Image

frames = sorted(Path(sys.argv[1]).glob("f*.png"))
out = sys.argv[2]
fps = int(sys.argv[3]) if len(sys.argv) > 3 else 30

with av.open(out, "w", options={"movflags": "+faststart"}) as box:
    codec = "h264_nvenc" if "h264_nvenc" in av.codecs_available else "h264_mf"
    stream = box.add_stream(codec, rate=fps)
    stream.width, stream.height = 1920, 1080
    stream.pix_fmt = "yuv420p"
    stream.time_base = Fraction(1, fps)
    if codec == "h264_nvenc":
        stream.options = {"preset": "p7", "rc": "constqp", "qp": "17", "profile": "high"}
    else:
        stream.bit_rate = 12_000_000
    for i, f in enumerate(frames):
        frame = av.VideoFrame.from_image(Image.open(f).convert("RGB"))
        frame.pts = i
        for packet in stream.encode(frame):
            box.mux(packet)
    for packet in stream.encode():
        box.mux(packet)
print(f"wrote {out}: {len(frames)} frames at {fps} fps with {codec}")
