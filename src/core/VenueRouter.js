/**
 * 会場マップ（venue_map.json）から、部屋から部屋への屋内ルートを求める。
 *
 * 判定には使わない：重なり警告・スキマ提案は主催者の設定（0分移動OK／前後5分）のまま。
 * ここで扱うのは「どこをどう通るか」だけで、所要分は出さない。
 *
 * venue_map.json の形:
 * {
 *   "floors": [{ "id": "1F", "label": "1階", "image": "./venue/1f.svg", "width": 1200, "height": 800 }],
 *   "nodes":  [{ "id": "r-main", "floor": "1F", "x": 180, "y": 420, "room": "メインホール", "aliases": ["…"] },
 *              { "id": "st-e1", "floor": "1F", "x": 980, "y": 160, "kind": "stairs", "name": "東階段" }],
 *   "edges":  [["r-main", "c1"], { "a": "st-e1", "b": "st-e2", "weight": 400 }]
 * }
 * - 同じ階の通路の重みは 2 点間の距離（px）。階をまたぐ通路（階段・エレベーター）は weight（既定 400）。
 * - 部屋の名前は公演データの「会場(部屋)」と結び付ける（全角半角・空白の違いは吸収する）。
 */

const DEFAULT_VERTICAL_WEIGHT = 400;

/** 部屋名の表記ゆれを吸収する（全角英数・空白・括弧の全半角） */
export function normalizeRoomName(name) {
  return String(name ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .toLowerCase();
}

export class VenueRouter {
  /**
   * @param {object} map venue_map.json の中身
   * @param {{ baseUrl?: string }} [opts] 画像の相対パスを解決する基準 URL
   */
  constructor(map, { baseUrl } = {}) {
    if (!map || !Array.isArray(map.floors) || !Array.isArray(map.nodes)) {
      throw new Error('venue_map: floors と nodes が必要です');
    }
    this.floors = map.floors.map((f) => ({
      ...f,
      label: f.label || f.id,
      image: baseUrl && f.image ? new URL(f.image, baseUrl).href : f.image,
    }));
    this.floorById = new Map(this.floors.map((f) => [f.id, f]));
    this.nodes = new Map();
    for (const n of map.nodes) {
      if (!this.floorById.has(n.floor)) throw new Error(`venue_map: 未定義の階 ${n.floor}（ノード ${n.id}）`);
      this.nodes.set(n.id, { kind: 'path', ...n });
    }

    // 隣接リスト
    this.adj = new Map([...this.nodes.keys()].map((id) => [id, []]));
    for (const e of map.edges || []) {
      const [a, b, weight] = Array.isArray(e) ? [e[0], e[1], undefined] : [e.a, e.b, e.weight];
      const na = this.nodes.get(a);
      const nb = this.nodes.get(b);
      if (!na || !nb) throw new Error(`venue_map: 通路の端点がありません ${a} - ${b}`);
      const w = weight ?? (na.floor === nb.floor ? Math.hypot(na.x - nb.x, na.y - nb.y) : DEFAULT_VERTICAL_WEIGHT);
      this.adj.get(a).push({ to: b, w });
      this.adj.get(b).push({ to: a, w });
    }

    // 部屋名 → ノード
    this.roomIndex = new Map();
    for (const n of this.nodes.values()) {
      for (const name of [n.room, ...(n.aliases || [])]) {
        if (name) this.roomIndex.set(normalizeRoomName(name), n.id);
      }
    }
  }

  /** venue_map.json を読み込む。失敗・未設定なら null（機能を出さない） */
  static async load(url) {
    if (!url) return null;
    try {
      const abs = new URL(url, window.location.href).href;
      const res = await fetch(abs, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return new VenueRouter(await res.json(), { baseUrl: abs });
    } catch (err) {
      console.warn('会場マップを読み込めませんでした:', err);
      return null;
    }
  }

  floor(id) {
    return this.floorById.get(id);
  }

  /** 部屋名から部屋のノードを返す（なければ null） */
  roomNode(name) {
    const id = this.roomIndex.get(normalizeRoomName(name));
    return id ? this.nodes.get(id) : null;
  }

  hasRoom(name) {
    return Boolean(this.roomNode(name));
  }

  /** 地図に結び付けられない部屋名の一覧（代行者が設定ミスに気づくため） */
  unknownRooms(roomNames) {
    return [...new Set(roomNames.filter((r) => r && r !== '-' && r !== '未定' && !this.hasRoom(r)))];
  }

  /** ダイクストラ法（ノード数は数百程度を想定するので単純な配列で十分） */
  _shortestPath(fromId, toId) {
    const dist = new Map([[fromId, 0]]);
    const prev = new Map();
    const done = new Set();
    const queue = [fromId];
    while (queue.length) {
      let bi = 0;
      for (let i = 1; i < queue.length; i++) if (dist.get(queue[i]) < dist.get(queue[bi])) bi = i;
      const cur = queue.splice(bi, 1)[0];
      if (done.has(cur)) continue;
      if (cur === toId) break;
      done.add(cur);
      for (const { to, w } of this.adj.get(cur)) {
        const nd = dist.get(cur) + w;
        if (nd < (dist.get(to) ?? Infinity)) {
          dist.set(to, nd);
          prev.set(to, cur);
          queue.push(to);
        }
      }
    }
    if (!dist.has(toId)) return null;
    const path = [toId];
    while (path[0] !== fromId) path.unshift(prev.get(path[0]));
    return path;
  }

  /**
   * 部屋から部屋へのルート。階ごとの区間に分けて返す。
   * 階をまたぐ所では、出る側の区間に exitVia、入る側の区間に enterVia（同じ階段名・同じ番号）を付ける。
   * @returns {null | { from: string, to: string, segments: Array<{
   *   floor: object, points: Array<{x:number,y:number,id:string}>,
   *   exitVia?: { no: number, name: string, kind: string, x: number, y: number, toFloor: object },
   *   enterVia?: { no: number, name: string, kind: string, x: number, y: number, fromFloor: object } }> }}
   */
  route(fromRoom, toRoom) {
    const a = this.roomNode(fromRoom);
    const b = this.roomNode(toRoom);
    if (!a || !b || a.id === b.id) return null;
    const ids = this._shortestPath(a.id, b.id);
    if (!ids) return null;

    // 同じ階が続く所でまとめる
    const groups = [];
    for (const id of ids) {
      const n = this.nodes.get(id);
      const last = groups[groups.length - 1];
      if (last && last.floorId === n.floor) last.nodes.push(n);
      else groups.push({ floorId: n.floor, nodes: [n] });
    }
    // 素通りする階（階段の 1 点だけの区間）は省き、上下の区間を直接つなぐ
    const kept = groups.filter((g, i) => !(g.nodes.length === 1 && i > 0 && i < groups.length - 1));

    let no = 0;
    const segments = kept.map((g) => ({ floor: this.floor(g.floorId), points: g.nodes.map(({ id, x, y }) => ({ id, x, y })) }));
    for (let i = 0; i < kept.length - 1; i++) {
      no += 1;
      const exitNode = kept[i].nodes[kept[i].nodes.length - 1];
      const enterNode = kept[i + 1].nodes[0];
      const name = exitNode.name || enterNode.name || (exitNode.kind === 'elevator' ? 'エレベーター' : '階段');
      segments[i].exitVia = { no, name, kind: exitNode.kind, x: exitNode.x, y: exitNode.y, toFloor: segments[i + 1].floor };
      segments[i + 1].enterVia = { no, name, kind: enterNode.kind, x: enterNode.x, y: enterNode.y, fromFloor: segments[i].floor };
    }
    return { from: a.room || fromRoom, to: b.room || toRoom, segments };
  }
}
