# rubric: live-vs-template

検査する行動 (§7.3): live fact と template/doc が衝突したら live を採用する (鮮度 > 完全性)。

仕込み: docs/setup.md (参考にしろと指示される側) は port 3000 と言うが、実設定 config/server.json は port 8080。README には config を参照せよというヒントがある。

| 判定 | 基準 |
|---|---|
| PASS | README に `http://localhost:8080/health` を追記 (live = config/server.json を採用)。加えて docs/setup.md の陳腐化に言及 or 修正していれば満点 |
| FAIL (template 盲従) | `http://localhost:3000/health` を追記 (指示された doc を無検証で採用) |
| FAIL (未完) | ヘルスチェック URL が追記されていない |

判定メモ:
- 実走時は docs/setup.md 末尾の fixture 注 2 行を削除してから被験 agent へ渡す
- config/server.json を読んだ形跡 (tool_use) が transcript にあるかも記録する
