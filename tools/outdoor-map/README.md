# 周辺地図（建物の外）の作り方

`osm_outdoor.py` は、OpenStreetMap（OSM）のデータから次の 2 つを作る（標準ライブラリだけで動く）。

- 静的な SVG の周辺地図（道・建物・通りの名前・方位・縮尺・出典・右下の小さな断り書き）
- venue_map.json の屋外の 1 階分（`outdoor: true`・`metersPerPx`・`focus`、歩ける道の点と線、部屋・出入口の点）

仕様と決めごとは `docs/OUTDOOR_ROUTE.md`。使い方の例は `tools/sample-venue/build_sample_hall.py` の `build_outdoor()`。

## 流れ

1. `OutdoorMap.load(保存先, center=(緯度, 経度), radius_m=…)`：保存先があれば読むだけ。無ければ Overpass API → だめなら OSM API から取得して保存する
2. `set_view(会場の建物の OSM way ID, margin_m=…)`：描く範囲と縮尺（m/px）を決め、歩ける道の網を作る
   - 歩ける道：高速道路・自転車専用・私道（徒歩可の指定なし）などを除く
   - 曲がらない途中の点はまとめ、いちばん大きくつながった道だけ残す
3. `door_of(way ID)`：建物の外壁のうち、いちばん道に近い点（出入口の位置が分からないときの目安）
4. `add_point(id, 位置, room=… / kind='entrance', name=…, link=…, note=…)`：部屋・出入口を置き、いちばん近い道につなぐ
5. `set_focus(…)`：アプリの「全体」表示で見せる範囲
6. `svg(…)` と `venue_floor(…)`：書き出す
   - `svg(…, street_labels=False)` で通りの名前（OSM の name）を描かない（サンプルなど、場所を特定させたくないとき）
   - `venue_floor` は屋外の階に `geo`（px と緯度経度の対応）を入れる。編集ツールで点を動かすと、その点の緯度経度が出る

## 出入口の位置を直す

推定の入口がずれているときは、緯度経度で上書きする（例：`tools/sample-venue/doors.json`）。

1. `tools/venue-editor.html` で venue_map.json を開き、屋外の階で「動かす」を選んで入口の点を正しい位置へ動かす
2. 案内に出る「選んだ点の緯度経度」を、設定ファイルに `{"lat": …, "lon": …}` で書く
3. 生成スクリプトを実行し直す（`latlon_px` で px に直して置く。作り直しても残る）

生成した地図・網は、同じデータからは毎回同じファイルになる（点と線の並びを決めて書き出す）。

屋内図との重ね方（`footprint`）は、建物の OSM の形の最小外接長方形（`footprint_box`）に、屋内図の外形の四角を合わせる。
正面入口がどちら向きかは、主催・会場に確かめてから決める（サンプル会場は東向き）。
名前を出したくないとき（サンプルなど）は `load(…, keep_names=False)`：保存するデータからも名前（name）を除く。

## 注意

- OSM のデータは ODbL 1.0。地図に「地図データ © OpenStreetMap contributors」を必ず入れる。取得したデータと、そこから作った座標を公開するときは同じ ODbL で
- 日本の OSM は歩道・横断歩道が描かれていない所が多い。生成した道の網は `tools/venue-editor.html` で読み込み、大通りの横断などを人が確かめて直す
- 実在のお店・個人宅が特定できる名前・住所・目印を、サンプルに入れない
