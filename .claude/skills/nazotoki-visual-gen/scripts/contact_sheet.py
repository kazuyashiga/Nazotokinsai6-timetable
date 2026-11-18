#!/usr/bin/env python3
"""検証用の一覧シートを作る。

  1 段目: 一覧（幅 300px）
  2 段目: タイムテーブル列の実寸（幅 118px）を 2 倍に拡大せず等倍で
  3 段目: グレースケール（明度差だけで形とタイトルが読めるか）

使い方: python3 contact_sheet.py OUT.png IMG1.png IMG2.png ...
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

COL_W = 300
REAL_W = 118  # src/core/Parser.js の列ポスター表示幅
GAP = 24
LABEL_H = 36
BG = (232, 232, 228)


def fit_w(im, w):
    return im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)


def main():
    out, *paths = sys.argv[1:]
    if not paths:
        raise SystemExit('usage: contact_sheet.py OUT.png IMG...')
    ims = [Image.open(p).convert('RGB') for p in paths]
    big = [fit_w(im, COL_W) for im in ims]
    real = [fit_w(im, REAL_W) for im in ims]
    gray = [ImageOps.grayscale(b).convert('RGB') for b in big]

    row_h = [max(i.height for i in big), max(i.height for i in real), max(i.height for i in gray)]
    W = GAP + len(ims) * (COL_W + GAP)
    H = GAP + sum(LABEL_H + h + GAP for h in row_h)
    sheet = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(sheet)
    titles = ['overview 300px', 'actual column width 118px (1x)', 'grayscale (value check)']

    y = GAP
    for r, (row, rh) in enumerate(zip((big, real, gray), row_h)):
        d.text((GAP, y + 8), titles[r], fill=(40, 40, 40))
        y += LABEL_H
        for i, im in enumerate(row):
            x = GAP + i * (COL_W + GAP)
            sheet.paste(im, (x, y))
            if r == 0:
                d.text((x, y + rh + 4), Path(paths[i]).stem, fill=(40, 40, 40))
        y += rh + GAP
    sheet.save(out, optimize=True)
    print(f'{out}: {W}x{H}')


if __name__ == '__main__':
    main()
