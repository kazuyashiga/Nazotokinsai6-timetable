#!/usr/bin/env python3
"""架空の「サンプル会館」（2 フロア）のフロアマップ SVG と venue_map.json を、同じ座標から生成する。

デモ（?mock=1）と PR 動画用。実際の会場では、代行者が tools/venue-editor.html で
本物の地図画像の上に点と通路を置いて venue_map.json を作る。

  python3 tools/sample-venue/build_sample_venue.py
出力: public/venue/1f.svg, public/venue/2f.svg, public/venue_map.json
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / 'public' / 'venue'
OUT_DIR.mkdir(parents=True, exist_ok=True)

W, H = 1200, 800
CY = 400  # 廊下の中心線
FONT = "'Hiragino Sans','Noto Sans JP','Noto Sans CJK JP','IPAGothic',sans-serif"

# 階ごとの部屋：(表示名, x0, y0, x1, y1, 種類, ドアの x, 結び付ける公演会場名, 別名)
FLOORS = {
    '1F': {
        'label': '1階',
        'rooms': [
            ('西階段', 60, 60, 200, 200, 'stairs', 130, None, []),
            ('メインホール', 220, 60, 700, 340, 'room', 460, 'メインホール', []),
            ('トイレ', 720, 60, 860, 200, 'service', None, None, []),
            ('東階段', 1000, 60, 1140, 200, 'stairs', 1070, None, []),
            ('カフェ席', 60, 460, 440, 740, 'room', 250, 'カフェ席', []),
            ('受付', 460, 460, 820, 740, 'room', 640, '受付', ['館内全域(受付:メインホール)']),
            ('物販・展示', 840, 460, 1140, 740, 'room', 990, '物販・展示', []),
        ],
        'entrance': (580, 700),  # 受付の下辺の出入口
    },
    '2F': {
        'label': '2階',
        'rooms': [
            ('西階段', 60, 60, 200, 200, 'stairs', 130, None, []),
            ('ルームA', 220, 60, 600, 340, 'room', 410, 'ルームA', []),
            ('ルームB', 620, 60, 980, 340, 'room', 800, 'ルームB', []),
            ('東階段', 1000, 60, 1140, 200, 'stairs', 1070, None, []),
            ('スタジオ2', 60, 460, 520, 740, 'room', 290, 'スタジオ2', []),
            ('スタッフ控室', 540, 460, 800, 740, 'service', None, None, []),
            ('休憩スペース', 820, 460, 1140, 740, 'room', 980, '休憩スペース', []),
        ],
        'entrance': None,
    },
}

INK = '#2b2e3a'
WALL = 6


def svg_floor(fid, spec):
    rooms_svg = []
    for name, x0, y0, x1, y1, kind, door_x, _, _ in spec['rooms']:
        fill = {'room': '#ffffff', 'stairs': '#eef0f5', 'service': '#f1f1ee'}[kind]
        w, h = x1 - x0, y1 - y0
        rooms_svg.append(f'<rect x="{x0}" y="{y0}" width="{w}" height="{h}" rx="6" fill="{fill}" stroke="{INK}" stroke-width="{WALL}"/>')
        # ドア（廊下側の壁を切り欠く）
        if door_x is not None:
            dy = y1 if y1 < CY else y0
            rooms_svg.append(f'<rect x="{door_x - 34}" y="{dy - WALL}" width="68" height="{WALL * 2}" fill="#e7e9f0"/>')
        if kind == 'stairs':
            # 階段の段（横線）
            for i in range(1, 8):
                yy = y0 + 56 + i * 11
                rooms_svg.append(f'<line x1="{x0 + 22}" y1="{yy}" x2="{x1 - 22}" y2="{yy}" stroke="{INK}" stroke-width="3" opacity=".55"/>')
            rooms_svg.append(f'<text x="{(x0 + x1) / 2}" y="{y0 + 44}" text-anchor="middle" font-family="{FONT}" font-size="30" font-weight="700" fill="{INK}">{name}</text>')
        else:
            size = 46 if w >= 300 else 34
            color = INK if kind == 'room' else '#8a8d99'
            rooms_svg.append(f'<text x="{(x0 + x1) / 2}" y="{(y0 + y1) / 2 + size * 0.36}" text-anchor="middle" font-family="{FONT}" font-size="{size}" font-weight="700" fill="{color}">{name}</text>')
    ent = ''
    if spec['entrance']:
        ex, ey = spec['entrance']
        ent = (f'<rect x="{ex - 60}" y="{740 - WALL}" width="120" height="{WALL * 2 + 20}" fill="#e7e9f0"/>'
               f'<text x="{ex}" y="790" text-anchor="middle" font-family="{FONT}" font-size="22" font-weight="700" fill="{INK}">正面入口</text>')
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">
<rect width="{W}" height="{H}" fill="#e7e9f0"/>
<rect x="40" y="40" width="{W - 80}" height="{H - 80}" rx="10" fill="#e7e9f0" stroke="{INK}" stroke-width="{WALL + 2}"/>
<rect x="60" y="{CY - 40}" width="{W - 120}" height="80" fill="#dfe2ea"/>
{''.join(rooms_svg)}
{ent}
<text x="{W - 64}" y="{CY + 12}" text-anchor="end" font-family="{FONT}" font-size="26" font-weight="700" fill="#9a9db0">廊下</text>
<text x="70" y="{CY + 14}" font-family="{FONT}" font-size="34" font-weight="900" fill="{INK}" opacity=".18">{spec['label']}</text>
</svg>
'''


def build_graph():
    nodes, edges = [], []
    stairs_by_name = {}
    for fid, spec in FLOORS.items():
        corridor = []
        for name, x0, y0, x1, y1, kind, door_x, room, aliases in spec['rooms']:
            if door_x is None:
                continue
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
            slug = f'{fid}-{name}'
            cor_id = f'{slug}-c'
            nodes.append({'id': cor_id, 'floor': fid, 'x': door_x, 'y': CY})
            corridor.append((door_x, cor_id))
            door_y = y1 if y1 < CY else y0
            if kind == 'stairs':
                st_id = f'{slug}'
                nodes.append({'id': st_id, 'floor': fid, 'x': door_x, 'y': round(cy), 'kind': 'stairs', 'name': name})
                edges.append([cor_id, st_id])
                stairs_by_name.setdefault(name, []).append(st_id)
            else:
                door_id = f'{slug}-d'
                room_id = f'{slug}-r'
                nodes.append({'id': door_id, 'floor': fid, 'x': door_x, 'y': door_y})
                # 部屋の点は「入口のすぐ内側」に置く（中央だと地図の部屋名とピンが重なる。案内としても入口が正確）
                inside_y = door_y - 56 if door_y < CY else door_y + 56
                node = {'id': room_id, 'floor': fid, 'x': door_x, 'y': inside_y, 'room': room}
                if aliases:
                    node['aliases'] = aliases
                nodes.append(node)
                edges += [[cor_id, door_id], [door_id, room_id]]
        corridor.sort()
        for (_, a), (_, b) in zip(corridor, corridor[1:]):
            edges.append([a, b])
    for name, ids in stairs_by_name.items():
        for a, b in zip(ids, ids[1:]):
            edges.append({'a': a, 'b': b, 'weight': 400})
    return nodes, edges


for fid, spec in FLOORS.items():
    (OUT_DIR / f'{fid.lower()}.svg').write_text(svg_floor(fid, spec), encoding='utf-8')

nodes, edges = build_graph()
venue = {
    'name': 'サンプル会館（デモ用の架空の建物）',
    'floors': [{'id': fid, 'label': spec['label'], 'image': f'./venue/{fid.lower()}.svg', 'width': W, 'height': H} for fid, spec in FLOORS.items()],
    'nodes': nodes,
    'edges': edges,
}
(ROOT / 'public' / 'venue_map.json').write_text(json.dumps(venue, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'floors {len(venue["floors"])}, nodes {len(nodes)}, edges {len(edges)}')
