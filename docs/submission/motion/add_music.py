"""Lays the music bed under the silent motion video.

The track ("Soft Tech Learning", prashant-ardeshana, Pixabay Content License) is 85 BPM and
306 s long. The video starts on the downbeat where its groove comes in (its filtered intro is
skipped), plays through the proof numbers, then cuts on a bar line to the track's final chord,
so the beat never skips and the music ends with the track's own ending.
The video stream is copied as is; the audio is AAC.

uv run --no-project --with av --with numpy python add_music.py <silent.mp4> <music.mp3> <out.mp4>
"""

import sys
from fractions import Fraction

import av
import numpy as np

SR = 48_000
DUR = 63.0
BEAT = 60 / 85
BAR = 4 * BEAT
DOWNBEAT = 4.552  # the track's downbeats are 4.552 s + n bars
GROOVE = DOWNBEAT + 2 * BAR  # 10.2 s: the full groove after the filtered intro, which is skipped
TAIL = DOWNBEAT + 103 * BAR  # 295.4 s: the final chord
LEAD = 0.5  # video time where the groove comes in
START = GROOVE - LEAD  # track time at video 0
CUT = TAIL - START - 80 * BAR  # 59.8 s: video time of the cut, a whole number of bars in
XFADE = BEAT  # one beat before the bar line, equal power, so the chord keeps its attack
PEAK_DB = -4.0  # headroom: AAC overshoots a limited master by about 3 dB


def load(path):
    with av.open(path) as f:
        rs = av.AudioResampler(format="flt", layout="mono", rate=SR)
        parts = [o.to_ndarray().reshape(-1) for fr in f.decode(audio=0) for o in rs.resample(fr)]
        parts += [o.to_ndarray().reshape(-1) for o in rs.resample(None)]
    return np.concatenate(parts)


def bed(track):
    n = int(DUR * SR)
    t = np.arange(n) / SR
    head = np.interp(t + START, np.arange(len(track)) / SR, track, right=0)
    tail = np.interp(t - CUT + TAIL, np.arange(len(track)) / SR, track, left=0, right=0)
    k = np.clip((t - (CUT - XFADE)) / XFADE, 0, 1)
    mix = head * np.cos(k * np.pi / 2) + tail * np.sin(k * np.pi / 2)
    mix *= np.clip((t - LEAD + 0.02) / 0.02, 0, 1)  # silent until the groove's downbeat
    mix *= np.clip((DUR - t) / 1.0, 0, 1)  # last second fades to silence
    mix *= 10 ** (PEAK_DB / 20) / np.abs(mix).max()
    return np.stack([mix, mix]).astype(np.float32)


def main(silent, music, out):
    audio = bed(load(music))
    with av.open(silent) as src, av.open(out, "w", options={"movflags": "+faststart"}) as dst:
        vin = src.streams.video[0]
        vout = dst.add_stream_from_template(vin)
        aout = dst.add_stream("aac", rate=SR, layout="stereo")
        aout.bit_rate = 192_000
        aout.time_base = Fraction(1, SR)
        for pkt in src.demux(vin):
            if pkt.dts is None:
                continue
            pkt.stream = vout
            dst.mux(pkt)
        step = 1024
        for i in range(0, audio.shape[1], step):
            fr = av.AudioFrame.from_ndarray(
                audio[:, i : i + step].copy(), format="fltp", layout="stereo"
            )
            fr.sample_rate = SR
            fr.pts = i
            fr.time_base = Fraction(1, SR)
            for p in aout.encode(fr):
                dst.mux(p)
        for p in aout.encode():
            dst.mux(p)
    print(f"wrote {out}: video copied, music from {START:.3f}s, cut at {CUT}s to {TAIL}s")


if __name__ == "__main__":
    main(*sys.argv[1:4])
