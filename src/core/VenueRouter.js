/**
 * 会場マップ（venue_map.json）から、部屋から部屋へのルートを求める（屋内の階と、建物の外の周辺地図）。
 *
 * 判定には使わない：重なり警告・スキマ提案は主催者の設定（0分移動OK／前後5分）のまま。
 * ここで扱うのは「どこをどう通るか」と、建物の外を歩くときの目安の時間（徒歩約N分）だけ。
 * 仕様：docs/OUTDOOR_ROUTE.md
 *
 * venue_map.json の形:
 * {
 *   "floors": [{ "id": "1F", "label": "1階", "image": "./venue/1f.svg", "width": 1200, "height": 800 }],
 *   "nodes":  [{ "id": "r-main", "floor": "1F", "x": 180, "y": 420, "room": "メインホール", "aliases": ["…"] },
 *              { "id": "st-e1", "floor": "1F", "x": 980, "y": 160, "kind": "stairs", "name": "東階段" }],
 *   "edges":  [["r-main", "c1"], { "a": "st-e1", "b": "st-e2", "weight": 400 }]
 * }
 * - 同じ階の通路の重みは 2 点間の距離。すべての階に metersPerPx があればメートル、無ければ px。
 * - 階をまたぐ通路の重みは weight。省略時はメートルなら階段 15・エレベーター 30・出入口 5、px なら 400。
 * - 階の追加の設定：outdoor（建物の外の周辺地図）・metersPerPx・footprint（周辺地図上の建物の位置。画面の切り替えに使う）。
 * - 点の追加の設定：kind "entrance"（建物の出入口）・link（同じ値の点を隣り合う階どうしでつなぐ）・note（到着の目印）。
 * - 部屋の名前は公演データの「会場(部屋)」と結び付ける（全角半角・空白の違いは吸収する）。
 */

const DEFAULT_VERTICAL_WEIGHT = 400;
/** 階をまたぐときの、歩く距離に換算した長さ（メートル） */
const CROSS_METERS = { stairs: 15, elevator: 30, entrance: 5 };
/** 徒歩の速さ（分速）。不動産の表示で使われる基準 */
export const WALK_METERS_PER_MIN = 80;

/** 階をまたぐ所の種類。片方が建物の出入口なら出入口（例：エレベーターで 1 階へ降りて出入口から外へ）、ほかは先に見つかった種類 */
const crossKind = (na, nb) => (na.kind === 'entrance' || nb.kind === 'entrance' ? 'entrance' : [na.kind, nb.kind].find((k) => k && k !== 'path') || 'stairs');
const isVia = (k) => k && k !== 'path';

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
    this.floorOrder = new Map(this.floors.map((f, i) => [f.id, i]));
    // すべての階に縮尺があれば、道の重みをメートルで数える（無ければ今までどおり px）
    this.metric = this.floors.length > 0 && this.floors.every((f) => Number(f.metersPerPx) > 0);
    this.nodes = new Map();
    for (const n of map.nodes) {
      if (!this.floorById.has(n.floor)) throw new Error(`venue_map: 未定義の階 ${n.floor}（ノード ${n.id}）`);
      this.nodes.set(n.id, { kind: 'path', ...n });
    }

    // 隣接リスト
    this.adj = new Map([...this.nodes.keys()].map((id) => [id, []]));
    const linked = new Set();
    const connect = (a, b, weight) => {
      const na = this.nodes.get(a);
      const nb = this.nodes.get(b);
      if (!na || !nb) throw new Error(`venue_map: 通路の端点がありません ${a} - ${b}`);
      const w = weight ?? (na.floor === nb.floor
        ? Math.hypot(na.x - nb.x, na.y - nb.y) * (this.metric ? Number(this.floorById.get(na.floor).metersPerPx) : 1)
        : (this.metric ? CROSS_METERS[crossKind(na, nb)] ?? CROSS_METERS.stairs : DEFAULT_VERTICAL_WEIGHT));
      this.adj.get(a).push({ to: b, w });
      this.adj.get(b).push({ to: a, w });
      linked.add(`${a}\u0000${b}`).add(`${b}\u0000${a}`);
    };
    for (const e of map.edges || []) {
      if (Array.isArray(e)) connect(e[0], e[1]);
      else connect(e.a, e.b, e.weight);
    }
    // link が同じ点どうしを、階の並びで隣り合うものからつなぐ（edges に書いてあれば足さない）
    const byLink = new Map();
    for (const n of this.nodes.values()) {
      if (n.link) (byLink.get(n.link) || byLink.set(n.link, []).get(n.link)).push(n);
    }
    for (const list of byLink.values()) {
      list.sort((p, q) => this.floorOrder.get(p.floor) - this.floorOrder.get(q.floor));
      for (let i = 1; i < list.length; i++) {
        const [p, q] = [list[i - 1], list[i]];
        if (p.floor !== q.floor && !linked.has(`${p.id}\u0000${q.id}`)) connect(p.id, q.id);
      }
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
   * ルートの長さ（メートル）。縮尺の無い階の道は数えない（その階の長さは分からないため）。
   * 外（outdoor の階）を通るときだけ walk を返す：{ meters, outdoorMeters, minutes }
   */
  _walk(ids) {
    let meters = 0;
    let outdoorMeters = 0;
    for (let i = 1; i < ids.length; i++) {
      const p = this.nodes.get(ids[i - 1]);
      const q = this.nodes.get(ids[i]);
      if (p.floor !== q.floor) {
        // メートルの地図では、edges に書いた重み（例：エレベーターで 1 階へ降りて出入口まで 40m）をそのまま使う
        const e = this.metric ? this.adj.get(p.id).find((x) => x.to === q.id) : null;
        meters += e ? e.w : CROSS_METERS[crossKind(p, q)] ?? CROSS_METERS.stairs;
        continue;
      }
      const floor = this.floorById.get(p.floor);
      const mpp = Number(floor.metersPerPx);
      if (!(mpp > 0)) continue;
      const d = Math.hypot(p.x - q.x, p.y - q.y) * mpp;
      meters += d;
      if (floor.outdoor) outdoorMeters += d;
    }
    if (!(outdoorMeters > 0)) return null;
    return {
      meters: Math.round(meters),
      outdoorMeters: Math.round(outdoorMeters),
      minutes: Math.max(1, Math.ceil(meters / WALK_METERS_PER_MIN)),
    };
  }

  /**
   * 部屋から部屋へのルート。階ごとの区間に分けて返す。
   * 階をまたぐ所では、出る側の区間に exitVia、入る側の区間に enterVia（同じ番号）を付ける。
   * 名前はそれぞれの側の点の名前（「正面入口」と「本館 正面入口」のように呼び分けられる）。
   * @returns {null | { from: string, to: string, note: string,
   *   walk: null | { meters: number, outdoorMeters: number, minutes: number }, segments: Array<{
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
      const kind = crossKind(exitNode, enterNode);
      const fallback = kind === 'elevator' ? 'エレベーター' : kind === 'entrance' ? '出入口' : '階段';
      const exitName = exitNode.name || enterNode.name || fallback;
      const enterName = enterNode.name || exitNode.name || fallback;
      segments[i].exitVia = { no, name: exitName, kind, x: exitNode.x, y: exitNode.y, toFloor: segments[i + 1].floor };
      segments[i + 1].enterVia = { no, name: enterName, kind, x: enterNode.x, y: enterNode.y, fromFloor: segments[i].floor };
      // 種類の違う点どうし（エレベーター ⇔ 1 階の出入口など）は、もう一方の名前も渡す（「エレベーターで降り、1階 出入口から外へ」）
      if (isVia(exitNode.kind) && isVia(enterNode.kind) && exitNode.kind !== enterNode.kind) {
        segments[i].exitVia.through = enterName;
        segments[i + 1].enterVia.through = exitName;
      }
    }
    return { from: a.room || fromRoom, to: b.room || toRoom, note: b.note || '', walk: this._walk(ids), segments };
  }
}
