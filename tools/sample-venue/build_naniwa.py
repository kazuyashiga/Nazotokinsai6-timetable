#!/usr/bin/env python3
"""浪速区民センター（大阪市浪速区稲荷）の簡略フロアマップ（3 フロア）と venue_map.json を生成する。

施設の公式サイトのフロアマップ（https://www.osakacommunity.jp/naniwa-center/floor/）を参考に、
部屋の並びと通路だけを残して描き直した「サンプル（非公式）」の図。公式の図の画像そのものは使っていない。
寸法・扉の位置は簡略化しており、実際とは異なる。
西側の階段は非常階段のため、地図には描くが経路には使わない（階の移動は南階段だけ）。
交流スペース・フリースペースは壁のない広場で、通路と続いている。
座標は公式 1F・3F の図（1722x1128）にそろえ、2F（1172x758）は 1.47 倍して重ねた。

  python3 tools/sample-venue/build_naniwa.py
出力: public/venues/naniwa/{1f,2f,3f}.svg, public/venues/naniwa/venue_map.json
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public' / 'venues' / 'naniwa'
OUT.mkdir(parents=True, exist_ok=True)

W, H = 1720, 1130
FONT = "'Hiragino Sans','Noto Sans JP','Noto Sans CJK JP','IPAGothic',sans-serif"
INK = '#2b2e3a'
WALL = 7
FILL = {'room': '#ffffff', 'stairs': '#eef0f5', 'emergency': '#f1f1ee', 'service': '#f1f1ee', 'void': '#e2e4ec'}

# 部屋：(表示名, x0, y0, x1, y1, 種類, 文字の大きさ)
# 通路：(x0, y0, x1, y1)
FLOORS = {
    '1F': {
        'label': '1階',
        'rooms': [
            ('非常階段', 35, 160, 125, 320, 'emergency', 20),
            ('第3会議室', 205, 110, 350, 322, 'room', 40),
            ('第2会議室', 352, 110, 533, 322, 'room', 44),
            ('第1会議室', 536, 110, 717, 322, 'room', 44),
            ('トイレ', 717, 110, 835, 322, 'service', 30),
            ('トイレ', 885, 110, 1085, 255, 'service', 30),
            ('資料室', 705, 367, 835, 518, 'service', 30),
            ('事務室', 885, 367, 1085, 560, 'service', 36),
            ('舞台', 1085, 110, 1645, 345, 'service', 44),
            ('ホール', 1085, 345, 1645, 980, 'room', 72),
            ('EV', 575, 688, 665, 775, 'service', 30),
            ('南階段', 705, 825, 820, 960, 'stairs', 30),
        ],
        'halls': [(125, 322, 835, 367), (125, 110, 205, 322), (835, 255, 885, 520), (705, 518, 1085, 900), (665, 700, 705, 775)],
        'labels': [('ロビー', 930, 760, 40)],
        'entrance': (990, 900),
    },
    '2F': {
        'label': '2階',
        'rooms': [
            ('非常階段', 35, 160, 125, 320, 'emergency', 20),
            ('第5会議室', 125, 107, 369, 314, 'room', 44),
            ('和室2', 369, 107, 512, 314, 'room', 44),
            ('和室1', 512, 107, 717, 314, 'room', 44),
            ('トイレ', 717, 107, 888, 314, 'service', 30),
            ('交流スペース', 888, 107, 1086, 318, 'area', 34),
            ('第4会議室', 706, 364, 888, 618, 'room', 40),
            ('フリースペース', 888, 318, 1086, 515, 'area', 30),
            ('吹抜', 961, 515, 1086, 897, 'void', 30),
            ('吹抜（ホール）', 1089, 107, 1647, 1060, 'void', 44),
            ('EV', 573, 686, 661, 773, 'service', 30),
            ('南階段', 703, 810, 821, 957, 'stairs', 30),
        ],
        'halls': [(125, 314, 888, 364), (888, 318, 961, 897), (661, 686, 888, 773), (703, 773, 821, 810)],
        'labels': [],
        'entrance': None,
    },
    '3F': {
        'label': '3階',
        'rooms': [
            ('非常階段', 38, 160, 128, 320, 'emergency', 20),
            ('第9会議室', 205, 110, 350, 320, 'room', 40),
            ('第8会議室', 350, 110, 515, 320, 'room', 40),
            ('第7会議室', 515, 110, 720, 320, 'room', 44),
            ('トイレ', 720, 110, 885, 320, 'service', 30),
            ('電気室', 885, 110, 1085, 365, 'service', 32),
            ('第6会議室', 790, 575, 885, 775, 'room', 30),
            ('機械室', 885, 367, 1085, 905, 'service', 32),
            ('ホール上部', 1088, 107, 1648, 1083, 'void', 44),
            ('EV', 577, 688, 665, 775, 'service', 30),
            ('南階段', 705, 838, 822, 962, 'stairs', 30),
        ],
        'halls': [(128, 320, 885, 367), (128, 110, 205, 320), (705, 367, 790, 838), (665, 700, 705, 775)],
        'labels': [],
        'entrance': None,
    },
}

# 通路網：階ごとの点と線（部屋の点は「入口のすぐ内側」。room は公演の「会場(部屋)」と結び付ける名前）
GRAPH = {
    '1F': {
        'nodes': [
            ('c-w', 165, 345), ('c-3', 278, 345), ('c-2', 442, 345), ('c-1', 626, 345), ('c-e', 860, 345),
            ('l-n', 860, 600), ('l-c', 860, 720), ('l-s', 860, 800), ('h-d', 1060, 720), ('s-in', 762, 800),
        ],
        'rooms': [('r-3', 278, 270, '第3会議室'), ('r-2', 442, 270, '第2会議室'), ('r-1', 626, 270, '第1会議室'), ('r-h', 1150, 720, 'ホール', ['館内全域(受付:ホール)'])],
        'stairs': [('st-s', 762, 890, '南階段')],
        'edges': [('c-w', 'c-3'), ('c-3', 'c-2'), ('c-2', 'c-1'), ('c-1', 'c-e'), ('c-e', 'l-n'), ('l-n', 'l-c'), ('l-c', 'l-s'),
                  ('l-c', 'h-d'), ('h-d', 'r-h'), ('l-s', 's-in'), ('s-in', 'st-s'),
                  ('c-3', 'r-3'), ('c-2', 'r-2'), ('c-1', 'r-1')],
    },
    '2F': {
        'nodes': [
            ('c-w', 165, 340), ('c-5', 247, 340), ('c-w2', 440, 340), ('c-w1', 615, 340), ('c-e', 925, 340),
            ('p-4', 925, 470), ('p-s', 925, 730), ('ev', 762, 730),
        ],
        'rooms': [('r-5', 247, 262, '第5会議室'), ('r-w2', 440, 262, '和室2'), ('r-w1', 615, 262, '和室1'),
                  ('r-k', 987, 250, '交流スペース'), ('r-f', 1000, 440, 'フリースペース'), ('r-4', 830, 470, '第4会議室')],
        'stairs': [('st-s', 762, 880, '南階段')],
        'edges': [('c-w', 'c-5'), ('c-5', 'c-w2'), ('c-w2', 'c-w1'), ('c-w1', 'c-e'), ('c-e', 'r-k'), ('c-e', 'p-4'), ('p-4', 'r-f'),
                  ('p-4', 'r-4'), ('p-4', 'p-s'), ('p-s', 'ev'), ('ev', 'st-s'),
                  ('c-5', 'r-5'), ('c-w2', 'r-w2'), ('c-w1', 'r-w1')],
    },
    '3F': {
        'nodes': [
            ('c-w', 168, 343), ('c-9', 278, 343), ('c-8', 432, 343), ('c-7', 617, 343), ('c-j', 748, 343),
            ('v-6', 748, 640), ('v-s', 748, 800),
        ],
        'rooms': [('r-9', 278, 268, '第9会議室'), ('r-8', 432, 268, '第8会議室'), ('r-7', 617, 268, '第7会議室'), ('r-6', 836, 640, '第6会議室')],
        'stairs': [('st-s', 763, 890, '南階段')],
        'edges': [('c-w', 'c-9'), ('c-9', 'c-8'), ('c-8', 'c-7'), ('c-7', 'c-j'), ('c-j', 'v-6'), ('v-6', 'r-6'), ('v-6', 'v-s'),
                  ('v-s', 'st-s'), ('c-9', 'r-9'), ('c-8', 'r-8'), ('c-7', 'r-7')],
    },
}


def text(x, y, s, size, color=INK, weight=700, anchor='middle', extra=''):
    return f'<text x="{x}" y="{y}" text-anchor="{anchor}" font-family="{FONT}" font-size="{size}" font-weight="{weight}" fill="{color}" {extra}>{s}</text>'


def svg_floor(spec):
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">',
           f'<rect width="{W}" height="{H}" fill="#e7e9f0"/>',
           '<defs><pattern id="hatch" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">'
           '<line x1="0" y1="0" x2="0" y2="18" stroke="#c9ccd8" stroke-width="6"/></pattern></defs>']
    for x0, y0, x1, y1 in spec['halls']:
        out.append(f'<rect x="{x0}" y="{y0}" width="{x1 - x0}" height="{y1 - y0}" fill="#dfe2ea"/>')
    for name, x0, y0, x1, y1, kind, size in spec['rooms']:
        w, h = x1 - x0, y1 - y0
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        if kind == 'area':
            # 交流スペース・フリースペース：壁のない、通路と続いた広場
            out.append(f'<rect x="{x0}" y="{y0}" width="{w}" height="{h}" fill="#dfe2ea"/>')
            if w < size * len(name) * 1.02 and name.endswith('スペース'):
                out.append(text(cx, cy - size * 0.2, name[:-4], size))
                out.append(text(cx, cy + size * 0.95, 'スペース', size))
            else:
                out.append(text(cx, cy + size * 0.36, name, size))
            continue
        fill = 'url(#hatch)' if kind == 'void' else FILL[kind]
        out.append(f'<rect x="{x0}" y="{y0}" width="{w}" height="{h}" rx="6" fill="{fill}" stroke="{INK}" stroke-width="{WALL}"/>')
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        color = INK if kind in ('room', 'stairs') else '#7d8091'
        if kind in ('stairs', 'emergency'):
            for i in range(1, 7):
                yy = y0 + 50 + i * 12
                out.append(f'<line x1="{x0 + 14}" y1="{yy}" x2="{x1 - 14}" y2="{yy}" stroke="{INK}" stroke-width="3" opacity=".5"/>')
            out.append(text(cx, y0 + 38, name, min(size, int(w / len(name) * 0.92)), color))
        elif size and w < size * len(name) * 1.02:
            # 細い部屋は 2 行（例：第3 / 会議室）
            if name.startswith('第'):
                head, tail = name[:2], name[2:]
            elif name.endswith('スペース'):
                head, tail = name[:-4], 'スペース'
            else:
                head, tail = name[: len(name) // 2], name[len(name) // 2:]
            out.append(text(cx, cy - size * 0.2, head, size, color))
            out.append(text(cx, cy + size * 0.95, tail, size, color))
        else:
            out.append(text(cx, cy + size * 0.36, name, size, color))
    for s, x, y, size in spec['labels']:
        out.append(text(x, y, s, size, '#9a9db0'))
    if spec['entrance']:
        ex, ey = spec['entrance']
        out.append(f'<rect x="{ex - 70}" y="{ey - 6}" width="140" height="20" fill="#dfe2ea"/>')
        out.append(f'<path d="M {ex} {ey + 22} l -26 40 h 52 z" fill="{INK}" opacity=".75"/>')
        out.append(text(ex, ey + 98, '正面入口', 32))
    # 階の名前・サンプルの表示（はっきり・常に読める位置に）
    out.append(text(48, 1100, spec['label'], 56, INK, 900, 'start', 'opacity=".22"'))
    out.append(f'<rect x="{W - 640}" y="{H - 92}" width="604" height="64" rx="8" fill="#facc15"/>')
    out.append(text(W - 338, H - 48, 'サンプル（非公式）・簡略図', 36, INK, 900))
    out.append(text(W - 36, 64, '浪速区民センターの公式フロアマップを参考に簡略化', 26, '#8a8d99', 700, 'end'))
    out.append('</svg>\n')
    return '\n'.join(out)


def build_graph():
    nodes, edges = [], []
    stairs = {}
    for fid, g in GRAPH.items():
        p = fid.lower()
        for nid, x, y in g['nodes']:
            nodes.append({'id': f'{p}-{nid}', 'floor': fid, 'x': x, 'y': y})
        for r in g['rooms']:
            nid, x, y, room = r[:4]
            node = {'id': f'{p}-{nid}', 'floor': fid, 'x': x, 'y': y, 'room': room}
            if len(r) > 4:
                node['aliases'] = r[4]
            nodes.append(node)
        for nid, x, y, name in g['stairs']:
            nodes.append({'id': f'{p}-{nid}', 'floor': fid, 'x': x, 'y': y, 'kind': 'stairs', 'name': name})
            stairs.setdefault(name, []).append(f'{p}-{nid}')
        edges += [[f'{p}-{a}', f'{p}-{b}'] for a, b in g['edges']]
    for name, ids in stairs.items():
        for a, b in zip(ids, ids[1:]):
            edges.append({'a': a, 'b': b, 'weight': 400})
    return nodes, edges


for fid, spec in FLOORS.items():
    (OUT / f'{fid.lower()}.svg').write_text(svg_floor(spec), encoding='utf-8')
nodes, edges = build_graph()
venue = {
    'name': '浪速区民センター（サンプル・非公式の簡略図）',
    'floors': [{'id': fid, 'label': spec['label'], 'level': i + 1, 'image': f'./{fid.lower()}.svg', 'width': W, 'height': H}
               for i, (fid, spec) in enumerate(FLOORS.items())],
    'nodes': nodes,
    'edges': edges,
}
(OUT / 'venue_map.json').write_text(json.dumps(venue, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'floors {len(venue["floors"])}, nodes {len(nodes)}, edges {len(edges)}')
