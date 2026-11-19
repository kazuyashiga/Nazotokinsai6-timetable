"""
建物の外の周辺地図（静的 SVG）と、歩ける道の網（venue_map.json の 1 階分）を OpenStreetMap から作る。

    仕様: docs/OUTDOOR_ROUTE.md
    地図データ © OpenStreetMap contributors（ODbL 1.0）。取得したデータと、そこから作った座標は ODbL。

使い方（モジュールとして）:
    from osm_outdoor import OutdoorMap
    m = OutdoorMap.load(cache_path, center=(lat, lon), radius_m=150)    # 保存があれば通信しない
    m.set_view(building_ways=[...], margin_m=45, width_px=1720)          # 描く範囲と縮尺
    door = m.door_of([way_id])                                           # 建物の、いちばん道に近い外壁の点（px）
    m.add_point('out-r-a', door, room='別館A', note='…')                 # 部屋・出入口を置き、近い道につなぐ
    svg = m.svg(highlights=[...], badge='サンプル（非公式）・周辺簡略図')
    floor, nodes, edges = m.venue_floor('OUT', '屋外', './outdoor.svg')

取得は Overpass API を先に、だめなら OSM API。結果は cache_path に保存し、次からは通信しない
（地図を作り直すときは保存したファイルを消す）。標準ライブラリだけで動く。
"""
from __future__ import annotations

import json
import math
import urllib.parse
import urllib.request
from pathlib import Path

USER_AGENT = 'nazotoki-timetable-outdoor-map/1.0 (static map builder)'
OVERPASS = 'https://overpass-api.de/api/interpreter'
OSM_API = 'https://api.openstreetmap.org/api/0.6/map.json'

# 歩ける道（高速道路・自転車専用・工事中などは除く）。値は描く幅（m）
WALKABLE = {
    'trunk': 18, 'primary': 16, 'primary_link': 8, 'secondary': 12, 'secondary_link': 7,
    'tertiary': 9, 'tertiary_link': 6, 'unclassified': 6, 'residential': 6, 'living_street': 5,
    'service': 4.5, 'pedestrian': 5, 'footway': 2.2, 'path': 2, 'steps': 2.2, 'track': 3,
}
DRAW_ORDER = ['footway', 'path', 'steps', 'track', 'service', 'pedestrian', 'living_street', 'residential',
              'unclassified', 'tertiary_link', 'tertiary', 'secondary_link', 'secondary', 'primary_link', 'primary', 'trunk']
KEEP_TAGS = {'highway', 'building', 'name', 'access', 'foot', 'service', 'footway', 'layer', 'tunnel', 'bridge', 'area', 'indoor'}

FONT = "'Hiragino Sans','Noto Sans JP','Noto Sans CJK JP','IPAGothic',sans-serif"
INK = '#2b2e3a'
BG = '#e7e9f0'


def _get(url: str, data: bytes | None = None, timeout: int = 60) -> dict:
    req = urllib.request.Request(url, data=data, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return json.loads(res.read().decode('utf-8'))


def fetch_osm(bbox: tuple[float, float, float, float]) -> dict:
    """bbox = (south, west, north, east)。Overpass → だめなら OSM API。要る項目だけに絞って返す"""
    s, w, n, e = bbox
    errors = []
    try:
        q = f'[out:json][timeout:60];(way["highway"]({s},{w},{n},{e});way["building"]({s},{w},{n},{e}););(._;>;);out body;'
        raw = _get(OVERPASS, urllib.parse.urlencode({'data': q}).encode())
        source = 'overpass-api.de'
    except Exception as ex:  # 混雑・接続の失敗
        errors.append(f'Overpass: {ex}')
        try:
            raw = _get(f'{OSM_API}?bbox={w},{s},{e},{n}')
            source = 'api.openstreetmap.org'
        except Exception as ex2:
            errors.append(f'OSM API: {ex2}')
            raise RuntimeError('OSM のデータを取得できませんでした: ' + ' / '.join(errors)) from ex2
    nodes, ways = {}, []
    for el in raw.get('elements', []):
        if el.get('type') == 'node' and 'lat' in el:
            nodes[str(el['id'])] = [round(el['lat'], 7), round(el['lon'], 7)]
        elif el.get('type') == 'way':
            tags = {k: v for k, v in (el.get('tags') or {}).items() if k in KEEP_TAGS}
            if 'highway' in tags or 'building' in tags:
                ways.append({'id': el['id'], 'nodes': el.get('nodes', []), 'tags': tags})
    # 使う道・建物の点だけ残す（広い範囲でも保存するデータを小さく）
    used = {str(n) for w in ways for n in w['nodes']}
    nodes = {k: v for k, v in nodes.items() if k in used}
    return {
        'attribution': '© OpenStreetMap contributors',
        'license': 'ODbL 1.0 https://opendatacommons.org/licenses/odbl/1-0/',
        'source': source,
        'bbox': [s, w, n, e],
        'nodes': nodes,
        'ways': ways,
    }


# ─────────── 幾何 ───────────
def _seg_nearest(p, a, b):
    """点 p から線分 ab への最近点と、ab 上の位置 t（0..1）、距離"""
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    L2 = dx * dx + dy * dy
    t = 0.0 if L2 == 0 else max(0.0, min(1.0, ((p[0] - ax) * dx + (p[1] - ay) * dy) / L2))
    q = (ax + dx * t, ay + dy * t)
    return q, t, math.hypot(p[0] - q[0], p[1] - q[1])


def _convex_hull(pts):
    pts = sorted(set(pts))
    if len(pts) <= 2:
        return pts

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def oriented_box(pts):
    """最小面積の外接長方形：(中心, (長辺, 短辺), 長辺の向きの単位ベクトル, 短辺の向きの単位ベクトル)"""
    hull = _convex_hull(pts)
    best = None
    for i in range(len(hull)):
        a, b = hull[i], hull[(i + 1) % len(hull)]
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        if L == 0:
            continue
        u = ((b[0] - a[0]) / L, (b[1] - a[1]) / L)
        v = (-u[1], u[0])
        pu = [p[0] * u[0] + p[1] * u[1] for p in hull]
        pv = [p[0] * v[0] + p[1] * v[1] for p in hull]
        area = (max(pu) - min(pu)) * (max(pv) - min(pv))
        if best is None or area < best[0]:
            cu, cv = (max(pu) + min(pu)) / 2, (max(pv) + min(pv)) / 2
            center = (u[0] * cu + v[0] * cv, u[1] * cu + v[1] * cv)
            best = (area, center, max(pu) - min(pu), max(pv) - min(pv), u, v)
    _, c, wu, wv, u, v = best
    return (c, (wu, wv), u, v) if wu >= wv else (c, (wv, wu), v, u)


def _clip(a, b, x0, y0, x1, y1):
    """線分 ab を四角に切り取る（Liang–Barsky）。外なら None"""
    dx, dy = b[0] - a[0], b[1] - a[1]
    t0, t1 = 0.0, 1.0
    for p, q in ((-dx, a[0] - x0), (dx, x1 - a[0]), (-dy, a[1] - y0), (dy, y1 - a[1])):
        if p == 0:
            if q < 0:
                return None
            continue
        r = q / p
        if p < 0:
            t0 = max(t0, r)
        else:
            t1 = min(t1, r)
        if t0 > t1:
            return None
    return (a[0] + dx * t0, a[1] + dy * t0), (a[0] + dx * t1, a[1] + dy * t1)


def _esc(s: str) -> str:
    return str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')


def _text(x, y, s, size, color=INK, weight=800, anchor='middle', extra=''):
    return (f'<text x="{x:.1f}" y="{y:.1f}" text-anchor="{anchor}" font-family="{FONT}" font-size="{size}" '
            f'font-weight="{weight}" fill="{color}" {extra}>{_esc(s)}</text>')


class OutdoorMap:
    def __init__(self, data: dict):
        self.data = data
        lat = [v[0] for v in data['nodes'].values()]
        lon = [v[1] for v in data['nodes'].values()]
        self.lat0 = (min(lat) + max(lat)) / 2
        self.lon0 = (min(lon) + max(lon)) / 2
        self.kx = 111320.0 * math.cos(math.radians(self.lat0))
        self.ky = 110574.0
        self.ways = {w['id']: w for w in data['ways']}
        self.view = None
        self.points = []  # 部屋・出入口
        self.focus = None

    @classmethod
    def load(cls, cache_path: Path, center: tuple[float, float], radius_m: float, keep_names: bool = True) -> 'OutdoorMap':
        """keep_names=False：建物・道の名前（name）を捨て、保存するデータにも残さない（サンプルなど、場所を特定させたくないとき）"""
        cache_path = Path(cache_path)
        if cache_path.exists():
            data = json.loads(cache_path.read_text(encoding='utf-8'))
            dirty = False
        else:
            lat, lon = center
            dlat = radius_m / 110574.0
            dlon = radius_m / (111320.0 * math.cos(math.radians(lat)))
            data = fetch_osm((lat - dlat, lon - dlon, lat + dlat, lon + dlon))
            dirty = True
        if not keep_names:
            for w in data['ways']:
                if w['tags'].pop('name', None) is not None:
                    dirty = True
        if dirty:
            cache_path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
        return cls(data)

    # ─────────── 座標 ───────────
    def meters(self, nid: str):
        lat, lon = self.data['nodes'][str(nid)]
        return ((lon - self.lon0) * self.kx, -(lat - self.lat0) * self.ky)  # y は南向き（画面と同じ）

    def px(self, m):
        x0, y0, mpp = self.view['x0'], self.view['y0'], self.view['mpp']
        return ((m[0] - x0) / mpp, (m[1] - y0) / mpp)

    def latlon_px(self, lat: float, lon: float):
        """緯度経度 → 地図の px（出入口の位置を手で直すときに使う）"""
        return self.px(((lon - self.lon0) * self.kx, -(lat - self.lat0) * self.ky))

    def px_latlon(self, p):
        """地図の px → 緯度経度"""
        mx = p[0] * self.view['mpp'] + self.view['x0']
        my = p[1] * self.view['mpp'] + self.view['y0']
        return (self.lat0 - my / self.ky, self.lon0 + mx / self.kx)

    def way_px(self, wid: int):
        return [self.px(self.meters(n)) for n in self.ways[wid]['nodes'] if str(n) in self.data['nodes']]

    def set_view(self, building_ways: list[int], margin_m: float, width_px: int = 1720, min_aspect: float = 0.9, max_aspect: float = 1.6):
        """building_ways を含む範囲に余白を足し、縦横比をおさめて、描く範囲と縮尺（m/px）を決める"""
        pts = [self.meters(n) for w in building_ways for n in self.ways[w]['nodes']]
        x0 = min(p[0] for p in pts) - margin_m
        x1 = max(p[0] for p in pts) + margin_m
        y0 = min(p[1] for p in pts) - margin_m
        y1 = max(p[1] for p in pts) + margin_m
        w, h = x1 - x0, y1 - y0
        aspect = w / h
        if aspect < min_aspect:  # 縦長すぎ：横を広げる
            extra = h * min_aspect - w
            x0, x1 = x0 - extra / 2, x1 + extra / 2
        elif aspect > max_aspect:
            extra = w / max_aspect - h
            y0, y1 = y0 - extra / 2, y1 + extra / 2
        mpp = (x1 - x0) / width_px
        self.view = {'x0': x0, 'y0': y0, 'mpp': mpp, 'W': width_px, 'H': int(round((y1 - y0) / mpp))}
        self._build_graph()
        return self.view

    # ─────────── 歩ける道の網 ───────────
    @staticmethod
    def _walkable(tags: dict) -> bool:
        hw = tags.get('highway')
        if hw not in WALKABLE or tags.get('area') == 'yes':
            return False
        if tags.get('foot') in ('no',):
            return False
        if tags.get('access') in ('private', 'no') and tags.get('foot') not in ('yes', 'designated', 'permissive'):
            return False
        # 地上の道だけ（地下街・地下道・建物の中の通路は、地上の地図に重ねると分かりにくいので使わない）
        if tags.get('tunnel') in ('yes', 'building_passage') or tags.get('indoor') == 'yes' or hw == 'corridor':
            return False
        try:
            if float(str(tags.get('layer', '0')).split(';')[0]) < 0:
                return False
        except ValueError:
            pass
        return True

    def _build_graph(self):
        W, H = self.view['W'], self.view['H']
        inset = 6  # px：枠ぎりぎりの点は使わない（線が枠の外にはみ出さないように）
        inside = lambda p: inset <= p[0] <= W - inset and inset <= p[1] <= H - inset
        pos, adj = {}, {}
        for w in self.ways.values():
            if not self._walkable(w['tags']):
                continue
            ids = [str(n) for n in w['nodes'] if str(n) in self.data['nodes']]
            for a, b in zip(ids, ids[1:]):
                pa, pb = self.px(self.meters(a)), self.px(self.meters(b))
                if not (inside(pa) and inside(pb)) or a == b:
                    continue
                pos[a], pos[b] = pa, pb
                adj.setdefault(a, set()).add(b)
                adj.setdefault(b, set()).add(a)
        # 曲がらない途中の点をまとめる（1m 以内のずれ）
        tol = 1.0 / self.view['mpp']
        changed = True
        while changed:
            changed = False
            for v in list(adj):
                nb = adj.get(v)
                if not nb or len(nb) != 2:
                    continue
                u, w = sorted(nb)  # 毎回同じ結果になるよう、並びを決めてから
                if w in adj[u]:
                    continue
                _, _, d = _seg_nearest(pos[v], pos[u], pos[w])
                if d <= tol:
                    adj[u].discard(v)
                    adj[w].discard(v)
                    adj[u].add(w)
                    adj[w].add(u)
                    del adj[v]
                    changed = True
        # いちばん大きくつながった道だけ残す
        seen, best = set(), set()
        for s in adj:
            if s in seen:
                continue
            comp, stack = set(), [s]
            while stack:
                x = stack.pop()
                if x in comp:
                    continue
                comp.add(x)
                stack.extend(adj[x] - comp)
            seen |= comp
            if len(comp) > len(best):
                best = comp
        self.pos = {k: pos[k] for k in best}
        self.adj = {k: {x for x in adj[k] if x in best} for k in best}

    def _nearest_edge(self, p):
        best = None
        for a in sorted(self.adj):
            for b in sorted(self.adj[a]):
                if a < b:
                    q, t, d = _seg_nearest(p, self.pos[a], self.pos[b])
                    if best is None or d < best[0]:
                        best = (d, a, b, q, t)
        return best

    def _snap(self, p) -> str:
        """p にいちばん近い道の点（道の途中なら、そこで道を分けて点を作る）"""
        d, a, b, q, t = self._nearest_edge(p)
        near = 1.0 / self.view['mpp']
        if math.hypot(q[0] - self.pos[a][0], q[1] - self.pos[a][1]) <= near:
            return a
        if math.hypot(q[0] - self.pos[b][0], q[1] - self.pos[b][1]) <= near:
            return b
        nid = f's{len(self.pos)}'
        self.pos[nid] = q
        self.adj[a].discard(b)
        self.adj[b].discard(a)
        self.adj[nid] = {a, b}
        self.adj[a].add(nid)
        self.adj[b].add(nid)
        return nid

    def door_of(self, way_ids: list[int], step_m: float = 0.5):
        """建物の外壁のうち、いちばん道に近い点（px）"""
        step = step_m / self.view['mpp']
        best = None
        for wid in way_ids:
            ring = self.way_px(wid)
            for a, b in zip(ring, ring[1:]):
                L = math.hypot(b[0] - a[0], b[1] - a[1])
                n = max(1, int(L / step))
                for i in range(n + 1):
                    p = (a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n)
                    d = self._nearest_edge(p)[0]
                    if best is None or d < best[0]:
                        best = (d, p)
        return best[1]

    def add_point(self, pid: str, p, **props):
        """部屋・出入口の点を p（px）に置き、いちばん近い道につなぐ"""
        road = self._snap(p)
        self.points.append({'id': pid, 'p': p, 'road': road, 'props': props})
        return road

    def set_focus(self, way_ids: list[int], margin_m: float = 15):
        """「全体」表示で見せる範囲（px）：会場の建物と、出入口がつながる道の点を含む四角に余白を足す"""
        pts = [p for w in way_ids for p in self.way_px(w)] + [self.pos[pt['road']] for pt in self.points]
        mg = margin_m / self.view['mpp']
        x0 = max(0, min(p[0] for p in pts) - mg)
        y0 = max(0, min(p[1] for p in pts) - mg)
        x1 = min(self.view['W'], max(p[0] for p in pts) + mg)
        y1 = min(self.view['H'], max(p[1] for p in pts) + mg)
        self.focus = [round(x0), round(y0), round(x1), round(y1)]
        return self.focus

    def footprint_box(self, way_ids: list[int]):
        """建物の最小外接長方形（px）"""
        pts = [p for w in way_ids for p in self.way_px(w)]
        return oriented_box(pts)

    # ─────────── 書き出し ───────────
    def venue_floor(self, floor_id: str, label: str, image: str, prefix: str = 'out'):
        """venue_map.json 用の 1 階分（floor, nodes, edges）"""
        ids = {k: f'{prefix}-{i}' for i, k in enumerate(sorted(self.pos, key=lambda k: (self.pos[k][1], self.pos[k][0])))}
        nodes = [{'id': ids[k], 'floor': floor_id, 'x': round(p[0], 1), 'y': round(p[1], 1)} for k, p in
                 sorted(self.pos.items(), key=lambda kv: ids[kv[0]])]
        # 何度作っても同じファイルになるよう、点の番号順に並べる
        num = lambda k: int(ids[k].rsplit('-', 1)[1])
        pairs = {tuple(sorted((a, b), key=num)) for a, nb in self.adj.items() for b in nb}
        edges = [[ids[a], ids[b]] for a, b in sorted(pairs, key=lambda e: (num(e[0]), num(e[1])))]
        for pt in self.points:
            node = {'id': pt['id'], 'floor': floor_id, 'x': round(pt['p'][0], 1), 'y': round(pt['p'][1], 1)}
            node.update({k: v for k, v in pt['props'].items() if v not in (None, '')})
            nodes.append(node)
            edges.append([pt['id'], ids[pt['road']]])
        floor = {'id': floor_id, 'label': label, 'outdoor': True, 'image': image,
                 'width': self.view['W'], 'height': self.view['H'], 'metersPerPx': round(self.view['mpp'], 5)}
        # アプリが地図の隅に必ず出す出典（拡大して画像の出典が見えないときのため）
        floor['attribution'] = '地図データ © OpenStreetMap contributors'
        if self.focus:
            floor['focus'] = self.focus
        # 地図の px と緯度経度の対応（編集ツールで、動かした点の緯度経度を出すため）
        floor['geo'] = {'lat0': round(self.lat0, 8), 'lon0': round(self.lon0, 8), 'kx': round(self.kx, 4), 'ky': self.ky,
                        'x0': round(self.view['x0'], 4), 'y0': round(self.view['y0'], 4), 'mpp': round(self.view['mpp'], 8)}
        return floor, nodes, edges

    def svg(self, highlights: list[dict], badge: str, floor_label: str = '屋外', note: str = '',
            street_labels: bool = True) -> str:
        """highlights: [{'ways': [...], 'label': '本館', 'door': (x, y) | None}]
        badge: 右下に灰色の小さな文字で添える断り書き（例「この地図はサンプルです」。空なら出さない）
        street_labels: 通りの名前（OSM の name）を描くか。サンプルなど、場所を特定させたくないときは False"""
        W, H, mpp = self.view['W'], self.view['H'], self.view['mpp']
        out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">',
               f'<rect width="{W}" height="{H}" fill="{BG}"/>']
        hl_ids = {w for h in highlights for w in h['ways']}
        # 描く範囲の外のものは書き出さない（広い地図でもファイルを小さく）
        def in_view(wid, pad=60):
            return any(-pad <= x <= W + pad and -pad <= y <= H + pad for x, y in self.way_px(wid))
        # 建物（薄く）
        for w in self.ways.values():
            if 'building' in w['tags'] and w['id'] not in hl_ids and len(w['nodes']) > 2 and in_view(w['id']):
                pts = ' '.join(f'{x:.1f},{y:.1f}' for x, y in self.way_px(w['id']))
                out.append(f'<polygon points="{pts}" fill="#dfe2ea" stroke="#cdd0da" stroke-width="2"/>')
        # 道：縁 → 中身（細い道から順に）
        roads = [w for w in self.ways.values() if self._walkable(w['tags']) and in_view(w['id'])]
        roads.sort(key=lambda w: DRAW_ORDER.index(w['tags']['highway']))
        for layer in ('case', 'fill'):
            for w in roads:
                width = WALKABLE[w['tags']['highway']] / mpp
                pts = ' '.join(f'{x:.1f},{y:.1f}' for x, y in self.way_px(w['id']))
                if layer == 'case':
                    out.append(f'<polyline points="{pts}" fill="none" stroke="#b8bcc9" stroke-width="{width + 5:.1f}" stroke-linecap="round" stroke-linejoin="round"/>')
                else:
                    out.append(f'<polyline points="{pts}" fill="none" stroke="#ffffff" stroke-width="{width:.1f}" stroke-linecap="round" stroke-linejoin="round"/>')
        # 通りの名前（OSM に名前がある道だけ。枠の中に収まる、いちばん長い直線の所に）
        labeled = set()
        size = 30
        for w in (sorted(roads, key=lambda w: -WALKABLE[w['tags']['highway']]) if street_labels else []):
            name = w['tags'].get('name')
            if not name or name in labeled or w['tags']['highway'] in ('footway', 'path', 'steps'):
                continue
            ring = self.way_px(w['id'])
            best = None
            for a, b in zip(ring, ring[1:]):
                seg = _clip(a, b, 40, 40, W - 40, H - 40)
                if seg:
                    L = math.hypot(seg[1][0] - seg[0][0], seg[1][1] - seg[0][1])
                    if best is None or L > best[0]:
                        best = (L, seg[0], seg[1])
            need = size * len(name) * 1.25
            if best and best[0] > need:
                (_, a, b) = best
                ang = math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]))
                if ang > 90:
                    ang -= 180
                elif ang < -90:
                    ang += 180
                mx, my = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
                out.append(_text(0, size * 0.36, name, size, '#6b6f80', 800,
                                 extra=f'transform="translate({mx:.1f} {my:.1f}) rotate({ang:.1f})" paint-order="stroke" stroke="#ffffff" stroke-width="8" stroke-linejoin="round"'))
                labeled.add(name)
        # 会場の建物（はっきり）
        for h in highlights:
            for wid in h['ways']:
                pts = ' '.join(f'{x:.1f},{y:.1f}' for x, y in self.way_px(wid))
                # 'area'（広場など建物でない所）は点線で囲む
                dash = ' stroke-dasharray="14 10"' if h.get('style') == 'area' else ''
                out.append(f'<polygon points="{pts}" fill="#ffffff" stroke="{INK}" stroke-width="6" stroke-linejoin="round"{dash}/>')
            allp = [p for wid in h['ways'] for p in self.way_px(wid)]
            cx = sum(p[0] for p in allp) / len(allp)
            cy = sum(p[1] for p in allp) / len(allp)
            size = h.get('size', 40)
            out.append(_text(cx, cy + size * 0.36, h['label'], size, INK, 900,
                             extra='paint-order="stroke" stroke="#ffffff" stroke-width="10" stroke-linejoin="round"'))
            if h.get('door'):
                dx, dy = h['door']
                out.append(f'<circle cx="{dx:.1f}" cy="{dy:.1f}" r="11" fill="{INK}" stroke="#ffffff" stroke-width="4"/>')
        # 飾り（方位・縮尺・出典・断り書き）は、アプリの「全体」表示で見える範囲（focus）の隅のうち、会場から遠い隅に置く
        fx0, fy0, fx1, fy1 = self.focus if self.focus else (0, 0, W, H)
        marks = [p for h in highlights for wid in h['ways'] for p in self.way_px(wid)] + [pt['p'] for pt in self.points]
        far = lambda c: min((math.hypot(c[0] - x, c[1] - y) for x, y in marks), default=0)
        top_right = far((fx1, fy0)) >= far((fx0, fy0))
        bottom_right = far((fx1, fy1)) >= far((fx0, fy1))
        # 方位と縮尺（上の、会場から遠い隅）
        nx = fx1 - 70 if top_right else fx0 + 70
        ny = fy0 + 92
        out.append(f'<g transform="translate({nx:.0f} {ny:.0f})"><circle r="44" fill="#ffffff" stroke="{INK}" stroke-width="4"/>'
                   f'<path d="M0 -34 L14 8 L0 0 L-14 8 Z" fill="{INK}"/><path d="M0 34 L14 8 L0 0 L-14 8 Z" fill="#c9ccd8"/></g>')
        out.append(_text(nx, ny - 54, '北', 28, INK, 900, extra='paint-order="stroke" stroke="#ffffff" stroke-width="6"'))
        for m in (10, 20, 25, 50, 100, 200, 250, 500):
            if m / mpp >= 160:
                break
        L = m / mpp
        sx = (nx - 70 - L) if top_right else (nx + 70)
        sy = ny + 26
        out.append(f'<rect x="{sx - 12:.0f}" y="{sy - 46:.0f}" width="{L + 24:.1f}" height="70" rx="8" fill="#ffffff" opacity=".85"/>')
        out.append(f'<path d="M{sx:.0f} {sy - 10:.0f} V{sy + 6:.0f} H{sx + L:.1f} V{sy - 10:.0f}" fill="none" stroke="{INK}" stroke-width="5"/>')
        out.append(_text(sx + L / 2, sy - 18, f'{m}m', 28, INK, 900))
        # 階の名前（画像の左下）・サンプルの帯と出典（見える範囲の右下）
        out.append(_text(48, H - 34, floor_label, 56, INK, 900, 'start', 'opacity=".22"'))
        # サンプルなどの断り書き（badge）は、下の会場から遠い隅に灰色の小さな文字で添えるだけ（枠で目立たせない）。その上に出典
        bx, anchor = (fx1 - 36, 'end') if bottom_right else (fx0 + 36, 'start')
        if badge:
            out.append(_text(bx, fy1 - 30, badge, 26, '#9a9db0', 700, anchor,
                             'paint-order="stroke" stroke="#ffffff" stroke-width="6" stroke-linejoin="round"'))
        out.append(_text(bx, fy1 - (66 if badge else 30), '地図データ © OpenStreetMap contributors（ODbL）', 24, '#5d6070', 700, anchor,
                         'paint-order="stroke" stroke="#ffffff" stroke-width="6" stroke-linejoin="round"'))
        if note:
            out.append(_text(fx0 + 36, fy0 + 44, note, 26, '#5d6070', 700, 'start',
                             'paint-order="stroke" stroke="#ffffff" stroke-width="6" stroke-linejoin="round"'))
        out.append('</svg>\n')
        return '\n'.join(out)
