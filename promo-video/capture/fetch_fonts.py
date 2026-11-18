#!/usr/bin/env python3
"""動画で使う文字だけを含んだフォント（woff2）を Google Fonts から取得して public/fonts に置く。

日本語フォントは字形が多く、@remotion/google-fonts で全分割ファイルを読むと書き出しが時間切れになる。
Google Fonts API の text= 指定で、src/ に書いた文字だけのサブセットを 1 ファイルずつ取得する。
文言を変えたら再実行すること:  python3 capture/fetch_fonts.py
"""
import re
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'fonts'
OUT.mkdir(parents=True, exist_ok=True)
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

chars = set()
for f in (ROOT / 'src').rglob('*.ts*'):
    chars.update(f.read_text(encoding='utf-8'))
# 表示に使い得る ASCII 一式も入れておく
chars.update(chr(c) for c in range(0x20, 0x7f))
text = ''.join(sorted(c for c in chars if c.isprintable()))

FAMILIES = {
    'zen': ('Zen Kaku Gothic New', [500, 700, 900]),
    'mono': ('JetBrains Mono', [500, 700]),
}
for key, (family, weights) in FAMILIES.items():
    for w in weights:
        q = urllib.parse.urlencode({'family': f'{family}:wght@{w}', 'text': text, 'display': 'block'})
        req = urllib.request.Request(f'https://fonts.googleapis.com/css2?{q}', headers={'User-Agent': UA})
        css = urllib.request.urlopen(req).read().decode()
        urls = re.findall(r'url\((https://[^)]+)\)', css)
        assert len(urls) == 1, (family, w, len(urls))
        data = urllib.request.urlopen(urllib.request.Request(urls[0], headers={'User-Agent': UA})).read()
        dst = OUT / f'{key}-{w}.woff2'
        dst.write_bytes(data)
        print(f'{dst.name}: {len(data) // 1024} KB')
print(f'{len(text)} chars')
