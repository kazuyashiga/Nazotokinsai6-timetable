#!/usr/bin/env python3
"""spec.json に従って 背景除去 → 刷りもの化 → 文字組み → 一覧シート をまとめて実行する（v2）。

使い方:
  python3 build.py SPEC.json RAW_DIR WORK_DIR OUT_DIR [id ...]

  RAW_DIR/<id>.png      … Canva 等から取得した生成画像（高解像度）
  WORK_DIR/motifs/      … 背景除去・刷りもの化したモチーフ
  WORK_DIR/sheet.png    … 検証用の一覧シート
  WORK_DIR/legibility.json … 判読性・字組みのチェック結果
  OUT_DIR/<id>.png      … 完成ポスター（原寸 PNG）
  spec.publish.dir/<id>.jpg … アプリから参照する公開用 JPEG（spec に publish がある時）

spec の motif.key が true ならモチーフの背景を抜く。inkify があれば刷りもの化する
（ガッシュ・セル調・写真のように、画材の質感そのものを活かす系統では inkify を付けない）。
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def run(*cmd):
    print('$', ' '.join(str(c) for c in cmd))
    subprocess.run([str(c) for c in cmd], check=True)


def main():
    spec_path, raw_dir, work_dir, out_dir, *only = sys.argv[1:]
    spec = json.loads(Path(spec_path).read_text(encoding='utf-8'))
    raw, work, out = Path(raw_dir), Path(work_dir), Path(out_dir)
    motifs = work / 'motifs'
    motifs.mkdir(parents=True, exist_ok=True)

    ids = []
    for p in spec['posters']:
        if only and p['id'] not in only:
            continue
        ids.append(p['id'])
        src = raw / f"{p['id']}.png"
        dst = motifs / f"{p['id']}.png"
        if not src.exists():
            print(f"warn {p['id']}: {src} がありません（文字組みだけで書き出します）")
            continue
        m = p.get('motif', {})
        cur = src
        if m.get('key'):
            keyed = work / f"{p['id']}.keyed.png"
            run(sys.executable, '-I', HERE / 'key_bg.py', cur, keyed, '--tol', m.get('tol', 34), '--holes', m.get('holes', 0))
            cur = keyed
        ink = p.get('inkify')
        if ink:
            run(sys.executable, '-I', HERE / 'inkify.py', cur, dst,
                '--paper', p['colors']['paper'], '--inks', ink['inks'], '--size', ink.get('size', 'keep'),
                '--dither', ink.get('dither', 'none'), '--simplify', ink.get('simplify', 5),
                '--misreg', ink.get('misreg', 4), '--seed', ink.get('seed', 1))
        else:
            shutil.copyfile(cur, dst)

    if not ids:
        raise SystemExit('対象のポスターがありません')
    run('node', HERE / 'compose.mjs', spec_path, motifs, out, work, *ids)
    run(sys.executable, '-I', HERE / 'contact_sheet.py', work / 'sheet.png', *[out / f'{i}.png' for i in ids])

    # 公開用：紙のノイズで PNG が重くなる（1 枚 2MB 前後）ため、JPEG にしてアプリの置き場へ出す
    pub = spec.get('publish')
    if pub:
        from PIL import Image
        dst_dir = Path(pub['dir'])
        dst_dir.mkdir(parents=True, exist_ok=True)
        for i in ids:
            dst = dst_dir / f'{i}.jpg'
            Image.open(out / f'{i}.png').convert('RGB').save(dst, quality=pub.get('quality', 86), optimize=True, progressive=True)
            print(f'publish {dst} ({dst.stat().st_size // 1024} KB)')


if __name__ == '__main__':
    main()
