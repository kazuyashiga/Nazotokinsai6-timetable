// サンプル会場（public/samples・public/venues）の中身の検査
//   node --test tests/sample-venues.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { VenueRouter } from '../src/core/VenueRouter.js';

const read = (p) => JSON.parse(fs.readFileSync(new URL(`../public/${p}`, import.meta.url), 'utf8'));
const SAMPLES = [
  { shows: 'samples/sample-hall.json', map: 'venues/sample-hall/venue_map.json' },
  { shows: 'samples/sample-hall2.json', map: 'venues/sample-hall2/venue_map.json' },
];

for (const s of SAMPLES) {
  test(`${s.shows}：公演の部屋がすべて地図にあり、どの 2 部屋の間にもルートがある`, () => {
    const router = new VenueRouter(read(s.map));
    const rooms = [...new Set(read(s.shows).shows.map((x) => x['会場(部屋)']))];
    assert.deepEqual(router.unknownRooms(rooms), []);
    // 別名で同じ部屋を指すもの（例：館内全域(受付:ホール) → ホール）どうしは除く
    for (const a of rooms) for (const b of rooms) {
      if (router.roomNode(a).id !== router.roomNode(b).id) assert.ok(router.route(a, b), `${a} → ${b} のルートが無い`);
    }
  });
}

test('サンプル2：5F の会議室1・控室にはラウンジを通ってだけ入る。和室へはエレベーターと給湯室の間の隙間から', () => {
  const router = new VenueRouter(read('venues/sample-hall2/venue_map.json'));
  const lastTwo = (from, to) => {
    const r = router.route(from, to);
    const ids = r.segments[r.segments.length - 1].points.map((p) => p.id);
    return ids[ids.length - 2];
  };
  for (const to of ['会議室1', '控室']) {
    const rooms = [...router.nodes.values()].filter((n) => n.room && n.room !== to && n.room !== 'ラウンジ').map((n) => n.room);
    for (const from of rooms) assert.equal(lastTwo(from, to), '5f-lg', `${from} → ${to} がラウンジを通らない`);
  }
  for (const from of ['会議室2', '控室', '研修室1']) assert.equal(lastTwo(from, '和室'), '5f-g2', `${from} → 和室 がエレベーターと給湯室の間の隙間を通らない`);
});

test('サンプル2：入れない所（3F 情報コーナー・ライブラリー、4F 事務室）には通路網の点が無い', () => {
  const map = read('venues/sample-hall2/venue_map.json');
  const inside = (n, [x0, y0, x1, y1]) => n.x > x0 && n.x < x1 && n.y > y0 && n.y < y1;
  const OY = 44;
  // 3F 情報コーナー（390〜1237, 0〜410）、4F 事務室の上の部分（420〜1680, 0〜315）
  assert.deepEqual(map.nodes.filter((n) => n.floor === '3F' && inside(n, [390, 0 + OY, 1237, 410 + OY])).map((n) => n.id), []);
  assert.deepEqual(map.nodes.filter((n) => n.floor === '4F' && inside(n, [420, 0 + OY, 1680, 315 + OY])).map((n) => n.id), []);
  // 3F ライブラリー（395〜1265, 553〜960）
  assert.deepEqual(map.nodes.filter((n) => n.floor === '3F' && inside(n, [395, 553 + OY, 1265, 960 + OY])).map((n) => n.id), []);

});
