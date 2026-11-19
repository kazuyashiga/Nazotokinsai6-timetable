// node --test tests/venue-router.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { VenueRouter, normalizeRoomName } from '../src/core/VenueRouter.js';

// 手計算できる小さい会館：1F と 2F、東西に階段。2F の西は東より遠回り
const MAP = {
  floors: [{ id: '1F', label: '1階' }, { id: '2F', label: '2階' }],
  nodes: [
    { id: 'hall', floor: '1F', x: 0, y: 0, room: 'メインホール' },
    { id: 'c1', floor: '1F', x: 100, y: 0 },
    { id: 'cafe', floor: '1F', x: 100, y: 100, room: 'カフェ席', aliases: ['館内全域(受付:メインホール)'] },
    { id: 'e1', floor: '1F', x: 200, y: 0, kind: 'stairs', name: '東階段' },
    { id: 'w1', floor: '1F', x: -100, y: 0, kind: 'stairs', name: '西階段' },
    { id: 'e2', floor: '2F', x: 200, y: 0, kind: 'stairs', name: '東階段' },
    { id: 'w2', floor: '2F', x: -100, y: 0, kind: 'stairs', name: '西階段' },
    { id: 'roomA', floor: '2F', x: 200, y: 100, room: 'ルームA' },
    { id: 'roomB', floor: '2F', x: -100, y: 100, room: 'ルーム B' },
    { id: 'island', floor: '2F', x: 0, y: 500, room: '倉庫' },
  ],
  edges: [
    ['hall', 'c1'], ['c1', 'cafe'], ['c1', 'e1'], ['hall', 'w1'],
    ['e1', 'e2'], ['w1', 'w2'],
    ['e2', 'roomA'], ['w2', 'roomB'], ['roomA', 'roomB'],
  ],
};

test('同じ階：最短経路の点列を返し、階段の案内は付かない', () => {
  const r = new VenueRouter(MAP).route('メインホール', 'カフェ席');
  assert.equal(r.segments.length, 1);
  assert.deepEqual(r.segments[0].points.map((p) => p.id), ['hall', 'c1', 'cafe']);
  assert.equal(r.segments[0].exitVia, undefined);
});

test('階をまたぐ：近い東階段を通り、出る側と入る側に同じ番号・同じ名前の案内が付く', () => {
  const r = new VenueRouter(MAP).route('メインホール', 'ルームA');
  assert.equal(r.segments.length, 2);
  assert.equal(r.segments[0].floor.id, '1F');
  assert.equal(r.segments[1].floor.id, '2F');
  assert.deepEqual(r.segments[0].exitVia && [r.segments[0].exitVia.no, r.segments[0].exitVia.name, r.segments[0].exitVia.toFloor.id], [1, '東階段', '2F']);
  assert.deepEqual(r.segments[1].enterVia && [r.segments[1].enterVia.no, r.segments[1].enterVia.name, r.segments[1].enterVia.fromFloor.id], [1, '東階段', '1F']);
  // 入る側の区間は階段の位置から始まる
  assert.deepEqual(r.segments[1].points[0], { id: 'e2', x: 200, y: 0 });
});

test('距離で階段を選ぶ：ルーム B へは西階段が近い', () => {
  const r = new VenueRouter(MAP).route('メインホール', 'ルームB');
  assert.equal(r.segments[0].exitVia.name, '西階段');
});

test('部屋名の表記ゆれ（全角・空白）と別名を吸収する', () => {
  const router = new VenueRouter(MAP);
  assert.ok(router.hasRoom('ルームB'));
  assert.ok(router.hasRoom('ＲｏｏｍA'.replace('Ｒｏｏｍ', 'ルーム')));
  assert.ok(router.hasRoom('館内全域(受付:メインホール)'));
  assert.equal(normalizeRoomName(' ルーム Ｂ '), normalizeRoomName('ルームB'));
});

test('到達できない・同じ部屋・未登録の部屋は null', () => {
  const router = new VenueRouter(MAP);
  assert.equal(router.route('メインホール', '倉庫'), null);
  assert.equal(router.route('メインホール', 'メインホール'), null);
  assert.equal(router.route('メインホール', '存在しない部屋'), null);
});

test('結び付けられない部屋名の一覧（未定・- は除く）', () => {
  const router = new VenueRouter(MAP);
  assert.deepEqual(router.unknownRooms(['メインホール', 'スタジオ2', 'スタジオ2', '未定', '-']), ['スタジオ2']);
});

test('素通りする階は区間にしない（3F → 1F を 2F の階段で通過）', () => {
  const map = {
    floors: [{ id: '1F' }, { id: '2F' }, { id: '3F' }],
    nodes: [
      { id: 'a', floor: '3F', x: 0, y: 0, room: 'A' },
      { id: 's3', floor: '3F', x: 10, y: 0, kind: 'stairs', name: '中央階段' },
      { id: 's2', floor: '2F', x: 10, y: 0, kind: 'stairs', name: '中央階段' },
      { id: 's1', floor: '1F', x: 10, y: 0, kind: 'stairs', name: '中央階段' },
      { id: 'b', floor: '1F', x: 20, y: 0, room: 'B' },
    ],
    edges: [['a', 's3'], ['s3', 's2'], ['s2', 's1'], ['s1', 'b']],
  };
  const r = new VenueRouter(map).route('A', 'B');
  assert.deepEqual(r.segments.map((s) => s.floor.id), ['3F', '1F']);
  assert.equal(r.segments[0].exitVia.toFloor.id, '1F');
  assert.equal(r.segments[1].enterVia.fromFloor.id, '3F');
});

test('壊れた地図はエラーにする', () => {
  assert.throws(() => new VenueRouter({ floors: [{ id: '1F' }], nodes: [{ id: 'x', floor: '9F', x: 0, y: 0 }] }));
  assert.throws(() => new VenueRouter({ floors: [{ id: '1F' }], nodes: [], edges: [['a', 'b']] }));
});

/* ─────────── 屋外（周辺地図）・メートル・出入口・link（docs/OUTDOOR_ROUTE.md） ─────────── */
// 本館（1F・2F）と、外の周辺地図（OUT）。別館は外の地図の上の部屋。1px = 0.1m（屋内）／ 1m（屋外）
const CAMPUS = {
  floors: [
    { id: '1F', label: '1階', metersPerPx: 0.1 },
    { id: '2F', label: '2階', metersPerPx: 0.1 },
    { id: 'OUT', label: '屋外', outdoor: true, metersPerPx: 1 },
  ],
  nodes: [
    { id: 'hall', floor: '1F', x: 0, y: 0, room: 'ホール' },
    { id: 'lobby', floor: '1F', x: 100, y: 0 },
    { id: 'ent1', floor: '1F', x: 100, y: 50, kind: 'entrance', name: '正面入口', link: 'main' },
    { id: 'back1', floor: '1F', x: -1000, y: 0, kind: 'entrance', name: '裏口', link: 'back' },
    { id: 'st1', floor: '1F', x: 0, y: 100, kind: 'stairs', name: '南階段', link: 'south' },
    { id: 'st2', floor: '2F', x: 0, y: 100, kind: 'stairs', name: '南階段', link: 'south' },
    { id: 'room7', floor: '2F', x: 0, y: 200, room: '第7会議室' },
    { id: 'entO', floor: 'OUT', x: 0, y: 0, kind: 'entrance', name: '本館 正面入口', link: 'main' },
    { id: 'backO', floor: 'OUT', x: -90, y: 0, kind: 'entrance', name: '本館 裏口', link: 'back' },
    { id: 'corner', floor: 'OUT', x: 0, y: 120 },
    { id: 'annexB', floor: 'OUT', x: -40, y: 120, room: '別館B', note: '北西の角を曲がってすぐ' },
  ],
  edges: [
    ['hall', 'lobby'], ['lobby', 'ent1'], ['hall', 'back1'], ['hall', 'st1'], ['st2', 'room7'],
    ['entO', 'corner'], ['corner', 'annexB'], ['backO', 'annexB'],
  ],
};

test('屋外：link でつながり、出入口の名前は階ごとに呼び分ける', () => {
  const r = new VenueRouter(CAMPUS).route('ホール', '別館B');
  assert.deepEqual(r.segments.map((s) => s.floor.id), ['1F', 'OUT']);
  assert.equal(r.segments[0].exitVia.kind, 'entrance');
  assert.equal(r.segments[0].exitVia.name, '正面入口');
  assert.equal(r.segments[1].enterVia.name, '本館 正面入口');
  assert.equal(r.segments[0].exitVia.toFloor.outdoor, true);
  assert.equal(r.note, '北西の角を曲がってすぐ');
});

test('屋外：重みはメートル。屋内の px が近くても、実際に近い出口を選ぶ', () => {
  // 正面入口：屋内 100+50px=15m ＋ 出入口 5m ＋ 屋外 120+40=160m ＝ 180m
  // 裏口　　：屋内 1000px=100m ＋ 出入口 5m ＋ 屋外 √(50²+120²)=130m ＝ 235m（px なら 1000+130 で、こちらも遠い）
  const r = new VenueRouter(CAMPUS).route('ホール', '別館B');
  assert.deepEqual(r.segments[1].points.map((p) => p.id), ['entO', 'corner', 'annexB']);
  // 屋外を px のまま数えると、裏口（屋外 130）が正面（160）より近いと誤る。縮尺で屋内を 1/10 に数えるから正面が選ばれる
  assert.equal(r.walk.meters, 180);
  assert.equal(r.walk.outdoorMeters, 160);
  assert.equal(r.walk.minutes, 3); // 180 ÷ 80 = 2.25 → 切り上げ 3
});

test('屋外：2 階から別館へは、階段 → 1 階 → 正面入口 → 外。徒歩の時間に階段も数える', () => {
  const r = new VenueRouter(CAMPUS).route('第7会議室', '別館B');
  assert.deepEqual(r.segments.map((s) => s.floor.id), ['2F', '1F', 'OUT']);
  assert.equal(r.segments[0].exitVia.name, '南階段');
  assert.equal(r.segments[1].exitVia.name, '正面入口');
  // 2F 10m ＋ 階段 15m ＋ 1F (100 + 100 + 50)px=25m ＋ 出入口 5m ＋ 屋外 160m = 215m → 3 分
  assert.equal(r.walk.meters, 215);
  assert.equal(r.walk.minutes, 3);
});

test('屋外を通らないルートには徒歩の時間を付けない', () => {
  const r = new VenueRouter(CAMPUS).route('ホール', '第7会議室');
  assert.equal(r.walk, null);
  assert.equal(r.note, '');
  assert.equal(r.segments[0].exitVia.kind, 'stairs');
});

test('link：3 つの階にまたがる同じ link は、隣り合う階どうしだけをつなぐ（1F と 3F を直接つながない）', () => {
  const map = {
    floors: [{ id: '1F', metersPerPx: 0.1 }, { id: '2F', metersPerPx: 0.1 }, { id: '3F', metersPerPx: 0.1 }],
    nodes: [
      { id: 'a', floor: '1F', x: 0, y: 0, room: 'A' },
      { id: 's1', floor: '1F', x: 0, y: 0, kind: 'stairs', name: '階段', link: 'S' },
      { id: 's3', floor: '3F', x: 0, y: 0, kind: 'stairs', name: '階段', link: 'S' },
      { id: 's2', floor: '2F', x: 0, y: 0, kind: 'stairs', name: '階段', link: 'S' },
      { id: 'c', floor: '3F', x: 0, y: 0, room: 'C' },
    ],
    edges: [['a', 's1'], ['s3', 'c']],
  };
  const router = new VenueRouter(map);
  assert.deepEqual(router.adj.get('s1').map((e) => e.to).sort(), ['a', 's2']);
  assert.deepEqual(router.adj.get('s3').map((e) => e.to).sort(), ['c', 's2']);
  assert.deepEqual(router.route('A', 'C').segments.map((s) => s.floor.id), ['1F', '3F']);
});

test('link：edges に書いた接続があれば二重につながない', () => {
  const map = {
    floors: [{ id: '1F' }, { id: '2F' }],
    nodes: [
      { id: 'x1', floor: '1F', x: 0, y: 0, kind: 'stairs', link: 'S', room: 'X' },
      { id: 'x2', floor: '2F', x: 0, y: 0, kind: 'stairs', link: 'S', room: 'Y' },
    ],
    edges: [{ a: 'x1', b: 'x2', weight: 7 }],
  };
  const router = new VenueRouter(map);
  assert.deepEqual(router.adj.get('x1'), [{ to: 'x2', w: 7 }]);
});

test('互換：縮尺の無い今の地図は px のまま（階段 400）、徒歩の時間は null', () => {
  const router = new VenueRouter(MAP);
  assert.equal(router.metric, false);
  assert.ok(router.adj.get('e1').some((e) => e.to === 'e2' && e.w === 400));
  const r = router.route('メインホール', 'ルームA');
  assert.equal(r.walk, null);
  assert.equal(r.segments[0].exitVia.name, '東階段');
  assert.equal(r.segments[1].enterVia.name, '東階段');
});

test('屋外：エレベーターで 1 階（地図なし）へ降りて出入口から外へ。種類は出入口、もう一方の名前と辺の重みを使う', () => {
  const map = {
    floors: [
      { id: '3F', label: '3階', metersPerPx: 0.1 },
      { id: '5F', label: '5階', metersPerPx: 0.1 },
      { id: 'OUT', label: '屋外', outdoor: true, metersPerPx: 1 },
    ],
    nodes: [
      { id: 'r5', floor: '5F', x: 0, y: 0, room: '会議室1' },
      { id: 'ev5', floor: '5F', x: 100, y: 0, kind: 'elevator', name: 'エレベーター' },
      { id: 'ev3', floor: '3F', x: 100, y: 0, kind: 'elevator', name: 'エレベーター' },
      { id: 'door', floor: 'OUT', x: 0, y: 0, kind: 'entrance', name: '1階 出入口' },
      { id: 'plaza', floor: 'OUT', x: 300, y: 400, room: '駅前広場' },
    ],
    edges: [['r5', 'ev5'], { a: 'ev5', b: 'ev3', weight: 10 }, { a: 'ev3', b: 'door', weight: 40 }, ['door', 'plaza']],
  };
  const r = new VenueRouter(map).route('会議室1', '駅前広場');
  // 3F はエレベーターの 1 点だけなので省き、5F から直接外へ
  assert.deepEqual(r.segments.map((s) => s.floor.id), ['5F', 'OUT']);
  assert.equal(r.segments[0].exitVia.kind, 'entrance');
  assert.equal(r.segments[0].exitVia.name, 'エレベーター');
  assert.equal(r.segments[0].exitVia.through, '1階 出入口');
  assert.equal(r.segments[1].enterVia.name, '1階 出入口');
  assert.equal(r.segments[1].enterVia.through, 'エレベーター');
  // 5F 10m ＋ エレベーター 10m ＋ 1 階へ降りて出入口まで 40m ＋ 屋外 500m ＝ 560m → 7 分
  assert.equal(r.walk.meters, 560);
  assert.equal(r.walk.minutes, 7);
});
