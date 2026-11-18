import { DataAdapter } from './DataAdapter.js';

/**
 * ローカルの mock_data.json からデータを取得するアダプター（配布・オフライン用）
 */
export class MockAdapter extends DataAdapter {
  constructor(mockPath = './mock_data.json') {
    super();
    this.mockPath = mockPath;
  }

  async fetchData() {
    // GitHub Pages は JSON を最大 10 分ブラウザに保持させるため、更新がすぐ反映されないことがある。
    // no-cache で毎回サーバーに確認する（変わっていなければ 304 で軽い）
    const response = await fetch(this.mockPath, { cache: 'no-cache' });
    if (!response.ok) {
      throw new Error(`モックデータ取得エラー: HTTP ${response.status} (${this.mockPath})`);
    }
    return await response.json();
  }
}
