/**
 * モーション版（Film）の素材を用意する。
 *   node promo-video/capture/motion_assets.cjs     ※ 先に node promo-video/capture/record.cjs route を実行しておく
 *
 * 出力（promo-video/public/motion/）
 *   - route_last.jpg … 地図の場面の後もスマホに残す、素材 route の最後のコマ
 *   - select_start / select_end / filter_start / filter_end / ticket_start.jpg … 基本機能の 3 台の止め絵
 *   - gap_end.jpg … スキマ提案の素材の最後のコマ
 */
const fs = require('node:fs');
const path = require('node:path');

const OUT = path.join(__dirname, '..', 'public', 'motion');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  // 地図の場面の後に残す静止画：素材 route（record.cjs route で撮ったコマ）の最後のコマ
  const raw = path.join(__dirname, 'raw', 'route');
  if (!fs.existsSync(raw)) {
    console.warn('capture/raw/route がありません。先に node promo-video/capture/record.cjs route を実行してください');
    return;
  }
  const last = fs.readdirSync(raw).filter((n) => n.endsWith('.jpg')).sort().pop();
  fs.copyFileSync(path.join(raw, last), path.join(OUT, 'route_last.jpg'));
  console.log('route_last.jpg <-', last);
  // 基本機能（3 台）の止め絵：再生前・再生後に見せるコマ（record.cjs select filter ticket で撮ったもの）
  const gapLast = fs.readdirSync(path.join(__dirname, 'raw', 'gap')).filter((n) => n.endsWith('.jpg')).sort().pop();
  fs.copyFileSync(path.join(__dirname, 'raw', 'gap', gapLast), path.join(OUT, 'gap_end.jpg'));
  const stills = [['select', 60, 'select_start'], ['select', 190, 'select_end'], ['filter', 0, 'filter_start'], ['filter', 164, 'filter_end'], ['ticket', 51, 'ticket_start']];
  for (const [clip, frame, name] of stills) {
    const src = path.join(__dirname, 'raw', clip, `${String(frame).padStart(5, '0')}.jpg`);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(OUT, `${name}.jpg`));
    else console.warn(`${src} がありません`);
  }
})();
