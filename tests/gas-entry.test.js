// 出展団体の一括記入シート（scripts/gas/Code.js の entry* 関数）のうち、スプレッドシートに触れない部分の検査
//   node --test tests/gas-entry.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync(new URL('../scripts/gas/Code.js', import.meta.url), 'utf8');
const ctx = vm.createContext({ console });
const G = vm.runInContext(
  `${code}
;({ entryFieldSpec, entryDifficultySpec, entryBuildDraftRows, entryMergeRows, entryFingerprint, entryStatus, entryExtraColumns,
    entryDraftHeaders, entryFolderId_, entryCountBySource, entryCheckCountsBySource, entryParseSlotCapacities,
    entryTime_, entryDay_, entryTags_, ENTRY_MODE_SINGLE, ENTRY_MODE_MULTI, ENTRY_SOURCE_HEADER,
    ENTRY_SLOT_CAPACITY_HEADER, ENTRY_NOTE_MARK, ENTRY_EDITED_MARK, ENTRY_DIFFICULTY_PRESETS })`,
  ctx,
);
// vm の配列は別の Realm のものなので、比べる前に JSON で通常の値へ直す
const plain = (v) => JSON.parse(JSON.stringify(v));

const baseValues = {
  group: '謎解き研究所', contactName: '山田 太郎', contactEmail: 'yamada@example.com', contactTel: '090-1111-2222',
  xAccount: '@nazo_lab', groupTag: '#謎解き研究所', title: 'からくり時計塔からの脱出', kana: 'からくりどけいとう',
  catch: '止まった時計が、真実を指す。', intro: '紹介文', showTag: '#時計塔', format: 'ルーム型', premiere: '新作',
  tags: '初心者歓迎・ストーリー重視', duration: 60, limit: 45, capacity: 24, team: '最大6人', difficulty: 5,
  fee: 2500, feeNote: 'グループ券あり', reserveType: '事前予約', reserveUrl: 'https://example.com/t',
  room: '第1会議室', notice: '小学生以下は保護者同伴', opsNote: '搬入は9時以降',
};
// スプレッドシートの時刻セルは 1899/12/30 の Date で届く
const t = (h, m) => new Date(1899, 11, 30, h, m);
const schedule = [
  { day: '1日目（11/14(土)）', start: t(14, 0), acceptEnd: '', capacity: '', note: '' },
  { day: '1日目（11/14(土)）', start: t(11, 0), acceptEnd: '', capacity: 20, note: '' },
  { day: '2日目（11/15(日)）', start: '10:30', acceptEnd: '', capacity: '', note: '機材の都合で少人数' },
];

test('1つの建物：日程ごとに 1 行、開演は早い順、タグは形式・新作・タグの順', () => {
  const r = plain(G.entryBuildDraftRows(baseValues, schedule, { mode: G.ENTRY_MODE_SINGLE, sourceId: 'SHEET1', visualUrl: 'https://drive.google.com/file/d/X/view' }));
  assert.deepEqual(r.errors, []);
  assert.equal(r.rows.length, 2);
  const h = plain(G.entryDraftHeaders());
  const row = Object.fromEntries(h.map((k, i) => [k, r.rows[0][i]]));
  assert.equal(row['日程'], '1日目');
  assert.equal(row['開始時間リスト'], '11:00, 14:00');
  assert.equal(row['内容目安'], '・ルーム型・新作・初心者歓迎・ストーリー重視');
  assert.equal(row['公演ビジュアルURL'], 'https://drive.google.com/file/d/X/view');
  assert.equal(row['会場住所'], '');
  assert.equal(row[G.ENTRY_SLOT_CAPACITY_HEADER], '11:00=20');
  assert.equal(row[G.ENTRY_SOURCE_HEADER], 'SHEET1');
  assert.equal(r.rows[1][4], '10:30');
  // 回ごとの定員・備考は取り込み履歴のメモに残す
  assert.ok(r.notes.some((n) => n.includes('定員 20 人')));
  assert.ok(r.notes.some((n) => n.includes('少人数')));
});

test('連絡先（担当者名・メール・電話・運営への連絡事項）は公開用の行に一切入らない', () => {
  const r = plain(G.entryBuildDraftRows(baseValues, schedule, { mode: G.ENTRY_MODE_MULTI, sourceId: 'S', visualUrl: '' }));
  const flat = JSON.stringify(r.rows);
  for (const secret of ['山田 太郎', 'yamada@example.com', '090-1111-2222', '搬入は9時以降']) {
    assert.ok(!flat.includes(secret), `${secret} が公開用の行に入っている`);
  }
  assert.equal(r.contact.email, 'yamada@example.com');
  assert.equal(r.contact.note, '搬入は9時以降');
});

test('モード：住所は「複数の建物」だけ。1つの建物では欄自体が無い', () => {
  const single = plain(G.entryFieldSpec(G.ENTRY_MODE_SINGLE)).map((f) => f.key);
  const multi = plain(G.entryFieldSpec(G.ENTRY_MODE_MULTI)).map((f) => f.key);
  assert.ok(!single.includes('address'));
  assert.ok(multi.includes('address'));
  assert.ok(!single.concat(multi).some((k) => /station|駅/.test(String(k))), '最寄駅は置かない');
  const roomSingle = plain(G.entryFieldSpec(G.ENTRY_MODE_SINGLE)).find((f) => f.key === 'room');
  assert.equal(roomSingle.type, 'list:rooms');

  const noAddr = plain(G.entryBuildDraftRows(baseValues, schedule, { mode: G.ENTRY_MODE_MULTI, sourceId: 'S', visualUrl: 'u' }));
  assert.ok(noAddr.errors.includes('未記入：会場住所'));
  const withAddr = plain(G.entryBuildDraftRows({ ...baseValues, address: '大阪市中央区1-2-3' }, schedule, { mode: G.ENTRY_MODE_MULTI, sourceId: 'S', visualUrl: 'u' }));
  assert.deepEqual(withAddr.errors, []);
  assert.equal(withAddr.rows[0][plain(G.entryDraftHeaders()).indexOf('会場住所')], '大阪市中央区1-2-3');
});

test('必須の未記入・形式の誤り・スケジュールの誤りを知らせる', () => {
  const r = plain(G.entryBuildDraftRows({ ...baseValues, catch: '', fee: '2,500円', reserveUrl: 'example.com' },
    [{ day: '', start: t(10, 0) }, { day: '1日目', start: '25:00' }], { mode: G.ENTRY_MODE_SINGLE, sourceId: 'S', visualUrl: '' }));
  assert.ok(r.errors.includes('未記入：キャッチコピー'));
  assert.ok(r.errors.some((e) => e.startsWith('数字で記入してください') && e.includes('料金')));
  assert.ok(r.errors.some((e) => e.includes('https://')));
  assert.ok(r.errors.some((e) => e.includes('1 行目：日程')));
  assert.ok(r.errors.some((e) => e.includes('2 行目：開演')));
  assert.ok(r.errors.includes('公演スケジュールが 1 回も記入されていません'));
  // 画像が無いのは取り込みを止めず、知らせるだけ
  assert.ok(r.warnings.includes('未提出：公演ビジュアル'));
});

test('当日受付なら予約URLは空欄でよい。随時受付は「開始-終了」で入る', () => {
  const r = plain(G.entryBuildDraftRows({ ...baseValues, reserveType: '当日受付(ファミレス式)', reserveUrl: '' },
    [{ day: '1日目', start: t(10, 0), acceptEnd: t(12, 0) }, { day: '1日目', start: '13:00', acceptEnd: '18:00' }],
    { mode: G.ENTRY_MODE_SINGLE, sourceId: 'S', visualUrl: 'u' }));
  assert.deepEqual(r.errors, []);
  assert.equal(r.rows[0][4], '10:00-12:00, 13:00-18:00');
});

test('時刻・日程・タグの読み取り', () => {
  assert.equal(G.entryTime_(t(9, 5)), '09:05');
  assert.equal(G.entryTime_(0.5625), '13:30');
  assert.equal(G.entryTime_('１３：３０'), '13:30');
  assert.equal(G.entryTime_('あとで'), '');
  assert.equal(G.entryDay_('2日目（11/15(日)）'), '2日目');
  assert.equal(G.entryDay_('二日目'), '');
  assert.equal(G.entryTags_('ルーム型', '', 'ルーム型、初心者歓迎 / 謎多め'), '・ルーム型・初心者歓迎・謎多め');
});

test('取り込みの合わせ方：主催だけ→主催、団体だけ→団体、両方→主催の値を残して要確認', () => {
  const ctxv = { mode: G.ENTRY_MODE_SINGLE, sourceId: 'S', visualUrl: 'u' };
  const base = plain(G.entryBuildDraftRows(baseValues, schedule, ctxv)).rows;
  const H = plain(G.entryDraftHeaders());
  const col = (h) => H.indexOf(h);
  const cur = base.map((r) => r.slice());
  cur[0][col('公演名')] = 'からくり時計塔からの脱出！';      // 主催だけ
  cur[0][col('キャッチコピー')] = '主催の直し';             // 両方
  cur[1][col('所要時間(分)')] = 90;                          // 主催と団体が同じ値に
  const next = plain(G.entryBuildDraftRows({ ...baseValues, fee: 3000, catch: '団体の直し', duration: 90 }, schedule, ctxv)).rows;
  const m = plain(G.entryMergeRows(base, cur, next));
  assert.deepEqual(m.adds, []);
  assert.deepEqual(m.deletes, []);
  const u0 = m.updates.find((u) => u.curIndex === 0);
  assert.equal(u0.values[col('公演名')], 'からくり時計塔からの脱出！');
  assert.equal(String(u0.values[col('参加料金')]), '3000');
  assert.equal(u0.values[col('キャッチコピー')], '主催の直し');
  assert.deepEqual(u0.conflicts.map((c) => [c.mine, c.theirs]), [['主催の直し', '団体の直し']]);
  assert.equal(m.checks, 1);
  assert.ok(m.log.some((l) => l.column === '参加料金' && l.before === '2500' && l.after === '3000' && l.kind === '反映'));
  assert.ok(!m.log.some((l) => l.column.startsWith('公演名')));
  // 2日目は主催と団体が同じ 90 に直した → 何も言わない（1日目は団体だけの直しなので反映）
  assert.ok(!m.log.some((l) => l.day === '2日目' && l.column.startsWith('所要時間')), '同じ値に直したなら何も言わない');
  assert.ok(m.log.some((l) => l.day === '1日目' && l.column === '所要時間(分)' && l.kind === '反映'));
});

test('取り込みの合わせ方：日程の増減・消えた行・控えが無い行・記入用シートに無い日程', () => {
  const ctxv = { mode: G.ENTRY_MODE_SINGLE, sourceId: 'S', visualUrl: 'u' };
  const H = plain(G.entryDraftHeaders());
  const base = plain(G.entryBuildDraftRows(baseValues, schedule, ctxv)).rows; // 1日目・2日目
  // 初めて：すべて足して（新規）
  const first = plain(G.entryMergeRows([], [], base));
  assert.equal(first.adds.length, 2);
  assert.ok(first.log.every((l) => l.column === '（新規）'));
  // 主催が 2日目の行を消した → 入れ直す
  const back = plain(G.entryMergeRows(base, [base[0]], base));
  assert.equal(back.adds.length, 1);
  assert.equal(back.log.find((l) => l.day === '2日目').column, '（消えていた行を入れ直し）');
  // 団体が 2日目をやめた：主催が直していなければ消す、直していれば消して要確認
  const one = plain(G.entryBuildDraftRows(baseValues, schedule.slice(0, 2), ctxv)).rows;
  const del = plain(G.entryMergeRows(base, base, one));
  assert.deepEqual(del.deletes, [1]);
  assert.equal(del.checks, 0);
  const edited = base.map((r) => r.slice());
  edited[1][H.indexOf('公演名')] = '主催の直し';
  const del2 = plain(G.entryMergeRows(base, edited, one));
  assert.deepEqual(del2.deletes, [1]);
  assert.equal(del2.log.find((l) => l.day === '2日目').kind, '要確認');
  // 控えが無い（前の版で取り込んだ）行：違うセルは主催の値を残して要確認
  const next = plain(G.entryBuildDraftRows({ ...baseValues, fee: 3000 }, schedule, ctxv)).rows;
  const legacy = plain(G.entryMergeRows([], base, next));
  assert.equal(String(legacy.updates[0].values[H.indexOf('参加料金')]), '2500');
  assert.equal(legacy.checks, 2);
  // 主催が日程を1つだけ書き換えた場合：曖昧さが無ければ1対1で結び付け、主催の日程を保ちつつ重複追加しない
  const moved = base.map((r) => r.slice());
  moved[1][0] = '3日目';
  const orphan = plain(G.entryMergeRows(base, moved, base));
  assert.deepEqual(orphan.deletes, []);
  assert.equal(orphan.adds.length, 0);
  assert.equal(orphan.checks, 0);
  const movedUpd = orphan.updates.find((u) => u.curIndex === 1);
  assert.equal(movedUpd.values[0], '3日目');
  assert.deepEqual(movedUpd.organizerEdited, [{ k: 0, mine: '3日目', base: '2日目' }]);
  // 2行以上同時に未知の日程に書き換えた曖昧な場合は従来通り残して要確認
  const movedTwo = base.map((r) => r.slice());
  movedTwo[0][0] = '3日目';
  movedTwo[1][0] = '4日目';
  const ambig = plain(G.entryMergeRows(base, movedTwo, base));
  assert.equal(ambig.adds.length, 2);
  assert.equal(ambig.checks, 2);
  assert.ok(ambig.log.some((l) => l.day === '3日目' && l.kind === '要確認'));
  assert.ok(ambig.log.some((l) => l.day === '4日目' && l.kind === '要確認'));
  // 時刻のセル（Date）と文字の "10:30"、数値と文字の "2500" は同じとみなす
  const asCells = base.map((r) => r.slice());
  asCells[1][4] = new Date(1899, 11, 30, 10, 30);
  asCells[0][H.indexOf('参加料金')] = 2500;
  assert.equal(G.entryMergeRows(base, asCells, base).log.length, 0);
});

test('指紋と状態：直したら「提出後に変更あり」になり、要確認件数も数える', () => {
  const ok = G.entryBuildDraftRows(baseValues, schedule, { mode: G.ENTRY_MODE_SINGLE, sourceId: 'S', visualUrl: 'u' });
  const fp1 = G.entryFingerprint(baseValues, schedule);
  const fp2 = G.entryFingerprint({ ...baseValues, fee: 3000 }, schedule);
  assert.notEqual(fp1, fp2);
  assert.equal(G.entryFingerprint(baseValues, schedule), fp1);
  assert.equal(G.entryStatus(false, ok, fp1, '', false), '未着手');
  assert.equal(G.entryStatus(false, ok, fp1, '', true), '記入中');
  assert.equal(G.entryStatus(true, ok, fp1, '', true), '提出済み（未取り込み）');
  assert.equal(G.entryStatus(true, ok, fp1, fp1, true), '取り込み済み');
  assert.equal(G.entryStatus(true, ok, fp1, fp1, true, true, 2), '取り込み済み（要確認 2 か所）');
  assert.equal(G.entryStatus(true, ok, fp2, fp1, true), '提出後に変更あり');
  // 主催が行を消したら知らせる（中身を直した場合は「変更あり」が先）
  assert.equal(G.entryStatus(true, ok, fp1, fp1, true, false), '取り込み済みの行が消えています（もう一度取り込めます）');
  assert.equal(G.entryStatus(true, ok, fp1, fp1, true, true), '取り込み済み');
  assert.equal(G.entryStatus(true, ok, fp2, fp1, true, false), '提出後に変更あり');
  const head = plain(G.entryDraftHeaders());
  const src = head.indexOf(G.ENTRY_SOURCE_HEADER);
  const row = (id) => { const r = new Array(head.length).fill(''); r[src] = id; return r; };
  assert.deepEqual(plain(G.entryCountBySource(head, [row('A'), row('B'), row('A'), row('')])), { A: 2, B: 1 });
  assert.deepEqual(plain(G.entryCountBySource(head.slice(0, 19), [row('A')])), {});
  assert.deepEqual(
    plain(G.entryCheckCountsBySource(
      head,
      [row('A'), row('B'), row('A')],
      [[G.ENTRY_NOTE_MARK + ' diff1', ''], ['通常メモ'], [G.ENTRY_NOTE_MARK + ' diff2', G.ENTRY_NOTE_MARK + ' diff3']],
    )),
    { A: 3 },
  );
});

test('公演一覧へ引き継ぐ列：20 列目以降のうち、取り込み元・回ごとの定員は出さない', () => {
  const header = plain(G.entryDraftHeaders());
  const cols = plain(G.entryExtraColumns(header)).map((c) => c.header);
  assert.ok(cols.includes('キャッチコピー'));
  assert.ok(cols.includes('会場住所'));
  assert.ok(!cols.includes(G.ENTRY_SOURCE_HEADER));
  assert.ok(!cols.includes(G.ENTRY_SLOT_CAPACITY_HEADER));
  assert.ok(!cols.includes('日程'));
  // 古いシート（19 列だけ）では何も足さない
  assert.deepEqual(plain(G.entryExtraColumns(header.slice(0, 19))), []);
});

test('回ごとの定員：テキスト展開とパース', () => {
  assert.deepEqual(plain(G.entryParseSlotCapacities('11:00=20, 14:00=18')), { '11:00': '20', '14:00': '18' });
  assert.deepEqual(plain(G.entryParseSlotCapacities('9:00=12、10:30=15')), { '09:00': '12', '10:30': '15' });
  assert.deepEqual(plain(G.entryParseSlotCapacities('')), {});
});

test('難易度の表し方プリセット：5種類と「使わない」時の項目除外・"-"出力', () => {
  assert.deepEqual(plain(G.ENTRY_DIFFICULTY_PRESETS), ['1〜10', '1〜5', '★1〜★5', '初級・中級・上級', '使わない']);
  const starSpec = plain(G.entryDifficultySpec('★1〜★5'));
  assert.equal(starSpec.enabled, true);
  assert.deepEqual(starSpec.options, ['★1', '★2', '★3', '★4', '★5', '未定']);
  const starField = plain(G.entryFieldSpec(G.ENTRY_MODE_SINGLE, '★1〜★5')).find((f) => f.key === 'difficulty');
  assert.deepEqual(starField.options, ['★1', '★2', '★3', '★4', '★5', '未定']);

  const noneSpec = plain(G.entryDifficultySpec('使わない'));
  assert.equal(noneSpec.enabled, false);
  const noneFields = plain(G.entryFieldSpec(G.ENTRY_MODE_SINGLE, '使わない')).map((f) => f.key);
  assert.ok(!noneFields.includes('difficulty'));

  const built = plain(G.entryBuildDraftRows(
    { ...baseValues, difficulty: '' },
    schedule,
    { mode: G.ENTRY_MODE_SINGLE, difficultyPreset: '使わない', sourceId: 'S', visualUrl: 'u' },
  ));
  assert.deepEqual(built.errors, []);
  const diffIdx = plain(G.entryDraftHeaders()).indexOf('難易度');
  assert.equal(built.rows[0][diffIdx], '-');
});

test('entryTime_：タイムゾーン指定およびスプレッドシート設定のタイムゾーンでフォーマットされる', () => {
  const calls = [];
  const subCtx = vm.createContext({
    console,
    Utilities: {
      formatDate(d, tz, fmt) {
        calls.push({ ms: d.getTime(), tz, fmt });
        return '11:00';
      },
    },
    SpreadsheetApp: {
      getActiveSpreadsheet() {
        return { getSpreadsheetTimeZone: () => 'Etc/GMT-9' };
      },
    },
  });
  const sub = vm.runInContext(`${code}; ({ entryTime_ })`, subCtx);
  const sampleDate = new Date(Date.UTC(1899, 11, 30, 2, 0));
  assert.equal(sub.entryTime_(sampleDate, 'Asia/Tokyo'), '11:00');
  assert.equal(sub.entryTime_(sampleDate), '11:00');
  assert.equal(calls[0].tz, 'Asia/Tokyo');
  assert.equal(calls[0].fmt, 'HH:mm');
  assert.equal(calls[1].tz, 'Etc/GMT-9');
});

test('entryMergeRows：主催だけが直したセルは organizerEdited に記録され、一致したら解除される', () => {
  const H = plain(G.entryDraftHeaders());
  const titleCol = H.indexOf('公演名');
  const base = plain(G.entryBuildDraftRows(baseValues, schedule, { mode: G.ENTRY_MODE_SINGLE, sourceId: 'S', visualUrl: 'u' })).rows;
  const cur = base.map((r) => r.slice());
  cur[0][titleCol] = '主催修正タイトル';

  // 団体はそのまま
  const res = plain(G.entryMergeRows(base, cur, base));
  assert.equal(res.checks, 0);
  assert.deepEqual(res.updates[0].organizerEdited, [{ k: titleCol, mine: '主催修正タイトル', base: 'からくり時計塔からの脱出' }]);

  // 団体が後から同じ値に合わせた場合は matched に移り organizerEdited は空になる
  const nextMatched = base.map((r) => r.slice());
  nextMatched[0][titleCol] = '主催修正タイトル';
  const res2 = plain(G.entryMergeRows(base, cur, nextMatched));
  assert.deepEqual(res2.updates[0].organizerEdited, []);
  assert.ok(res2.updates[0].matched.includes(titleCol));
});

test('保存先フォルダ：URL・?id=・ID そのものを読み、読めないものは空', () => {
  const id = '1AbC_dEf-GhIjKlMnOp';
  assert.equal(G.entryFolderId_(`https://drive.google.com/drive/folders/${id}`), id);
  assert.equal(G.entryFolderId_(`https://drive.google.com/drive/u/0/folders/${id}?usp=sharing`), id);
  assert.equal(G.entryFolderId_(`https://drive.google.com/open?id=${id}`), id);
  assert.equal(G.entryFolderId_(` ${id} `), id);
  assert.equal(G.entryFolderId_(''), '');
  assert.equal(G.entryFolderId_('マイドライブ/謎フェス'), '');
});
