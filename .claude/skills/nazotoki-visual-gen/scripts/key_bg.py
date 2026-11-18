#!/usr/bin/env python3
"""無地背景で生成したモチーフの背景を透明にし、モチーフの外接矩形で切り詰める。

外周から塗りつぶしで到達できる「背景に近い色」だけを抜くので、
モチーフ内部の白（アイス・紙の白・彫り跡など）は残る。

使い方: python3 key_bg.py IN.png OUT.png [--tol 34] [--pad 12] [--holes 0.5]
  --holes を付けると、モチーフに囲まれた背景色の穴（面積が画像の指定 % 以上）も抜く
"""
import argparse

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SENTINEL = (255, 0, 255)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('dst')
    ap.add_argument('--tol', type=int, default=34, help='背景色とみなす許容差（0〜255）')
    ap.add_argument('--pad', type=int, default=12, help='切り詰め後に残す余白 px')
    ap.add_argument('--holes', type=float, default=0, help='囲まれた背景色の穴のうち、画像面積の何 %% 以上を抜くか（0 で抜かない）')
    a = ap.parse_args()

    img = Image.open(a.src).convert('RGB')
    w, h = img.size
    work = img.copy()
    # 外周を一定間隔でたどり、背景色の画素から塗りつぶす
    step = max(8, min(w, h) // 64)
    border = [(x, 0) for x in range(0, w, step)] + [(x, h - 1) for x in range(0, w, step)] \
        + [(0, y) for y in range(0, h, step)] + [(w - 1, y) for y in range(0, h, step)]
    arr = np.asarray(img).astype(int)
    bg = np.median(np.array([arr[y, x] for x, y in border]), axis=0)
    for x, y in border:
        px = work.getpixel((x, y))
        if px != SENTINEL and np.abs(np.array(px) - bg).max() <= a.tol:
            ImageDraw.floodfill(work, (x, y), SENTINEL, thresh=a.tol)

    # 囲まれた穴（南京錠のつるの内側など）：背景色で、一定以上の面積があるものも抜く
    if a.holes > 0:
        min_area = a.holes / 100 * w * h
        near = (np.abs(np.asarray(work).astype(int) - bg).max(axis=2) <= a.tol)
        hole_step = max(4, min(w, h) // 160)
        ys, xs = np.nonzero(near[::hole_step, ::hole_step])
        KEEP = (1, 254, 1)
        for y, x in zip(ys * hole_step, xs * hole_step):
            px = work.getpixel((int(x), int(y)))
            if px in (SENTINEL, KEEP) or np.abs(np.array(px) - bg).max() > a.tol:
                continue
            before = np.asarray(work).copy()
            ImageDraw.floodfill(work, (int(x), int(y)), KEEP, thresh=a.tol)
            region = (np.asarray(work) != before).any(axis=2)
            if region.sum() >= min_area:
                arr_w = np.asarray(work).copy()
                arr_w[region] = SENTINEL
                work = Image.fromarray(arr_w.astype(np.uint8), 'RGB')
        # KEEP で塗った小さな白は元の色に戻す
        arr_w = np.asarray(work).copy()
        keep = (arr_w == np.array(KEEP)).all(axis=2)
        arr_w[keep] = np.asarray(img)[keep]
        work = Image.fromarray(arr_w.astype(np.uint8), 'RGB')

    mask = (np.asarray(work) != np.array(SENTINEL)).any(axis=2)
    alpha = Image.fromarray((mask * 255).astype(np.uint8), 'L')
    # 縁の白いにじみを 1px 削り、わずかにぼかして紙を切った縁のようにする
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.6))
    rgba = img.convert('RGBA')
    rgba.putalpha(alpha)

    bbox = alpha.point(lambda v: 255 if v > 24 else 0).getbbox()
    if not bbox:
        raise SystemExit('モチーフが見つかりません（背景しか残りませんでした）')
    l, t, r, b = bbox
    rgba = rgba.crop((max(0, l - a.pad), max(0, t - a.pad), min(w, r + a.pad), min(h, b + a.pad)))
    rgba.save(a.dst, optimize=True)
    share = mask.mean()
    print(f'{a.dst}: {rgba.width}x{rgba.height}, motif share {share:.0%} (bg≈{bg.astype(int).tolist()})')


if __name__ == '__main__':
    main()
