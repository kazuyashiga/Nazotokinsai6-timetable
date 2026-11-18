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
