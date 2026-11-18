#!/usr/bin/env python3
"""生成画像を「刷りもの」に変換する（ポスター比率への切り抜き・インク数制限・版ズレ・かすれ・紙）。

使い方:
  python3 inkify.py IN.png OUT.png --paper '#EFEBE2' --inks '#1B1F2A,#D7262E' \
      [--size 1200x1696|keep] [--dither fs|none] [--simplify 5] [--misreg 4] [--seed 1]

  透過付き PNG（key_bg.py の出力）はアルファを保ったまま処理する。--size keep で寸法を変えない。

考え方:
  1. 生成モデル特有の微細な描き込みを、メディアン→減色→モードフィルタで「版の形」に単純化する
  2. 紙色＋インク N 色へ減色（グラデーションは存在できない）
  3. インクごとに版を分け、版ズレ・かすれを与えて乗算で重ね刷りする（重なりは自然に濃くなる）
"""
import argparse

import numpy as np
from PIL import Image, ImageFilter


def hex_rgb(h):
    h = h.strip().lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def cover_crop(img, w, h):
    """アスペクト比を保ったまま (w, h) を覆うように拡縮し、中央で切り抜く"""
    sw, sh = img.size
    scale = max(w / sw, h / sh)
    img = img.resize((round(sw * scale), round(sh * scale)), Image.LANCZOS)
    left = (img.width - w) // 2
    top = (img.height - h) // 2
    return img.crop((left, top, left + w, top + h))


def low_freq_noise(rng, w, h, cell):
    """セル単位の乱数を滑らかに拡大した 0..1 のノイズ（紙のムラ・インクのかすれ用）"""
    small = rng.random((max(2, h // cell), max(2, w // cell))).astype(np.float32)
    im = Image.fromarray((small * 255).astype(np.uint8), 'L').resize((w, h), Image.BICUBIC)
    return np.asarray(im, dtype=np.float32) / 255.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('dst')
    ap.add_argument('--paper', required=True, help='紙色 HEX')
    ap.add_argument('--inks', required=True, help='インク HEX をカンマ区切りで 1〜3 色')
    ap.add_argument('--size', default='1200x1696')
    ap.add_argument('--dither', choices=['fs', 'none'], default='none')
    ap.add_argument('--simplify', type=int, default=5, help='形の単純化の強さ（奇数、0 で無効）')
    ap.add_argument('--misreg', type=int, default=4, help='版ズレの最大 px')
    ap.add_argument('--seed', type=int, default=1)
    a = ap.parse_args()

    rng = np.random.default_rng(a.seed)
    paper = hex_rgb(a.paper)
    inks = [hex_rgb(c) for c in a.inks.split(',') if c.strip()]
    if not 1 <= len(inks) <= 3:
        raise SystemExit('インクは 1〜3 色にしてください')

    src = Image.open(a.src)
    has_alpha = src.mode in ('RGBA', 'LA') or 'transparency' in src.info
    src = src.convert('RGBA')
    if a.size != 'keep':
        src = cover_crop(src, *(int(v) for v in a.size.split('x')))
    w, h = src.size
    alpha = np.asarray(src.getchannel('A'))
    # 透明部分は紙色で埋めてから減色する（縁に黒いにじみを出さない）
    flat_bg = Image.new('RGB', src.size, paper)
    flat_bg.paste(src, mask=src.getchannel('A'))
    img = flat_bg
    if a.simplify:
        img = img.filter(ImageFilter.MedianFilter(a.simplify | 1))

    # 紙色＋インクのパレットへ減色
    palette = [paper] + inks
    flat = [c for rgb in palette for c in rgb]
    pal_img = Image.new('P', (1, 1))
    pal_img.putpalette(flat + [0] * (768 - len(flat)))
    dither = Image.Dither.FLOYDSTEINBERG if a.dither == 'fs' else Image.Dither.NONE
    q = img.quantize(palette=pal_img, dither=dither)
    if a.simplify and a.dither == 'none':
        q = q.filter(ImageFilter.ModeFilter(a.simplify | 1))
    idx = np.asarray(q)

    # 紙：色ムラと繊維
    out = np.empty((h, w, 3), dtype=np.float32)
    out[:] = np.array(paper, dtype=np.float32) / 255.0
    fiber = 1.0 - 0.035 * low_freq_noise(rng, w, h, 6) - 0.02 * rng.random((h, w), dtype=np.float32)
    out *= fiber[..., None]

    # インクを版ごとに重ね刷り（乗算）
    for k, ink in enumerate(inks, start=1):
        mask = idx == k
        if k > 1 and a.misreg:
            dx, dy = rng.integers(-a.misreg, a.misreg + 1, size=2)
            mask = np.roll(mask, (int(dy), int(dx)), axis=(0, 1))
        # かすれ：インクが乗り切らない箇所をまばらに作る
        starve = low_freq_noise(rng, w, h, 3) * 0.6 + rng.random((h, w), dtype=np.float32) * 0.4
        mask &= starve > 0.12
        density = 0.88 + 0.12 * low_freq_noise(rng, w, h, 40)
        ink_rgb = np.array(ink, dtype=np.float32) / 255.0
        layer = 1.0 - (1.0 - ink_rgb)[None, None, :] * density[..., None]
        out = np.where(mask[..., None], out * layer, out)

    res = Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8), 'RGB')
    if has_alpha:
        res.putalpha(Image.fromarray(alpha))
    res.save(a.dst, optimize=True)
    print(f'{a.dst}: {w}x{h}, inks={len(inks)}')


if __name__ == '__main__':
    main()
