/**
 * 表を下へ送って列の頭（題名・ポスター）が見えなくなったら、
 * 上部バーのすぐ下に「公演名だけの帯」を出し、横スクロールにも合わせて動かす。
 * 表の列（#timetable-grid）が描き直されたら、自動で作り直す。
 */
export class ColTitleStrip {
  constructor({ nav, scroller, grid, section }) {
    this.nav = nav;
    this.scroller = scroller;
    this.grid = grid;
    this.section = section;
    this.raf = 0;

    this.el = document.createElement('div');
    this.el.className = 'col-title-strip';
    this.el.setAttribute('aria-hidden', 'true');
    this.el.innerHTML = '<div class="cts-window"><div class="cts-track"></div><div class="cts-axis"></div></div>';
    this.windowEl = this.el.querySelector('.cts-window');
    this.trackEl = this.el.querySelector('.cts-track');
    this.axisEl = this.el.querySelector('.cts-axis');
    nav.append(this.el);

    const schedule = () => {
      if (this.raf) return;
      this.raf = requestAnimationFrame(() => { this.raf = 0; this.update(); });
    };
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', () => { this.rebuild(); schedule(); });
    scroller.addEventListener('scroll', schedule, { passive: true });
    new MutationObserver(() => { this.rebuild(); schedule(); }).observe(grid, { childList: true });
    this.rebuild();
  }

  rebuild() {
    const axis = this.scroller.querySelector('.time-axis-col');
    const axisW = axis ? axis.offsetWidth : 0;
    this.axisEl.style.width = `${axisW}px`;
    const cells = [...this.grid.querySelectorAll('.venue-col')].map((col) => {
      const t = col.querySelector('.show-title');
      const cell = document.createElement('div');
      cell.className = `cts-cell${t && t.classList.contains('mystic-text') ? ' mystic-text' : ''}`;
      cell.style.width = `${col.offsetWidth}px`;
      cell.textContent = t ? t.textContent.trim() : '';
      return cell;
    });
    const spacer = document.createElement('div');
    spacer.className = 'cts-spacer';
    spacer.style.width = `${axisW}px`;
    this.trackEl.replaceChildren(spacer, ...cells);
    this.firstTitle = this.grid.querySelector('.venue-col .show-title');
  }

  update() {
    const navRect = this.nav.getBoundingClientRect();
    const secRect = this.section.getBoundingClientRect();
    const titleRect = this.firstTitle && this.firstTitle.isConnected ? this.firstTitle.getBoundingClientRect() : null;
    // 列の題名がバーの下に隠れ、かつ表がまだ画面に残っている間だけ出す
    const show = Boolean(titleRect)
      && !this.section.classList.contains('hidden')
      && titleRect.bottom < navRect.bottom
      && secRect.bottom > navRect.bottom + 60;
    this.el.classList.toggle('is-shown', show);
    if (!show) return;
    const sRect = this.scroller.getBoundingClientRect();
    this.windowEl.style.left = `${sRect.left - navRect.left}px`;
    this.windowEl.style.width = `${sRect.width}px`;
    this.trackEl.style.transform = `translateX(${-this.scroller.scrollLeft}px)`;
  }
}
