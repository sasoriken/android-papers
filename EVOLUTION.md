# UNIT-Ω 自律進化アーキテクチャ

本リポジトリは「論文を自動生成して GitHub Pages で公開する」段階から、
**サイト自身が AI 群によって自律的に進化する** 段階へ移行している。

このドキュメントは、複数の生成 AI ロール（Jules で別時間帯にスケジュール実行）
が協調する仕組みと、Constitution（`CONSTITUTION.md`）による安全装置の全体像を示す。

---

## 1. ロール構成と実行スケジュール

各ロールは独立した Jules の scheduled task として登録される。
時間帯をずらすことで PR のコンフリクトと相互干渉を回避する。

| 時刻 (JST) | ロール             | プロンプトファイル / トリガー              | 出力先                             |
|------------|--------------------|--------------------------------------------|------------------------------------|
| 12:00 毎日 | Generator          | `prompts/jules-scheduled-prompt.md`        | `data/papers/<id>.json`            |
| 15:00 毎日 | Critic             | `prompts/critic-prompt.md`                 | `data/reviews/<paper-id>.json`     |
| 18:00 毎日 | Citation-Weaver    | `prompts/citation-builder-prompt.md`       | 既存 `data/papers/*.json` に `references` 追記 |
| 21:00 毎日 | UI-Curator         | `prompts/ui-curator-prompt.md`             | `docs/index.html` の小幅改善         |
| 日曜 09:00 | Self-Analyst       | `prompts/self-analyst-prompt.md`           | `data/papers/meta-gen-NNN.json`    |
| 日曜 21:00 | Meta-Prompter      | `prompts/meta-prompter-prompt.md`          | `data/meta-proposals/<ts>.json`    |
| 火 07:00   | Auto-Promoter      | `.github/workflows/auto-promote.yml` (cron) | プロンプトファイルへ提案を適用     |
| 随時       | Theme-Competitor   | `prompts/theme-competition-prompt.md`      | `data/themes/active.json` に応じる |
| 随時       | AB-Judge           | `prompts/ab-judge-prompt.md`               | `data/candidates/` から勝者を採用  |

すべてのロールは PR のタイトル末尾に `[gen-NNN]` を付け、`data/generations.json` に
エントリを追加する。これにより世代単位の追跡と巻き戻しが可能。

---

## 2. データフロー

```
                  Generator (毎日 12:00)
                       │
                       ▼
              data/papers/<id>.json
                       │
            ┌──────────┼───────────┐
            ▼          ▼           ▼
        Critic    Citation-     UI-Curator
        (15:00)   Weaver         (21:00)
            │      (18:00)          │
            ▼          │            ▼
  data/reviews/<id>    │       docs/index.html
            │          │
            └──────────┴──────────┐
                                  ▼
                       Self-Analyst (日曜)
                       Meta-Prompter (日曜)
                                  │
                                  ▼
                      data/meta-proposals/<ts>.json
                                  │
                                  ▼
                       Auto-Promoter (火 07:00 JST)
                       — 最高優先度・非高リスクの提案 1 件を抽出
                       — promote-proposal.js が
                         prompts/<role>-prompt.md へ適用
                       — branch: jules/promote-<date>
                       — auto-merge.yml の promoter role 経路で
                         constitution-guard を経て自動マージ
```

---

## 3. Constitution と安全装置

`CONSTITUTION.md` の第3条により、自律ロールは以下のファイル群を改変してはならない。

| 対象                              | 改変可能なロール                       |
|-----------------------------------|----------------------------------------|
| `CONSTITUTION.md`                 | **人間のみ**                           |
| `prompts/system.txt`              | **人間のみ**                           |
| `schema/paper.schema.json`        | **人間のみ**                           |
| `scripts/*.js`                    | **人間のみ**                           |
| `.github/workflows/*.yml`         | **人間のみ**                           |
| `data/papers/*.json`              | Generator（新規作成）/ Citation-Weaver（references 追記のみ）/ Self-Analyst（meta 論文） |
| `data/reviews/*.json`             | Critic                                 |
| `data/meta-proposals/*.json`      | Meta-Prompter                          |
| `data/themes/*.json`              | Theme-Competitor / 人間                |
| `data/candidates/*.json`          | Generator（変種出力）/ AB-Judge（採用） |
| `data/generations.json`           | 全ロール（append-only）                |
| `docs/index.html`                 | UI-Curator                             |
| `docs/data/`                      | 自動同期（auto-merge ワークフロー）    |
| `prompts/<role>-prompt.md`        | Auto-Promoter（system.txt と meta-prompter-prompt.md を除く） |

`.github/workflows/constitution-guard.yml` は不可変ファイルへの変更を含む PR を
検出した時点で自動マージを拒否し、人間のレビューラベル `needs-human-review` を付ける。

---

## 4. 世代管理とロールバック

`data/generations.json` の構造：

```json
{
  "current_generation": 42,
  "lineage": [
    {
      "gen": 42,
      "role": "generator",
      "branch": "jules/gen-042-paper-temporal-compression",
      "pr_title": "feat: [UNIT-Ω][gen-042] ...",
      "merged_at": "2026-05-21T03:00:00Z",
      "summary": "新規論文1件 / temporal-compression"
    }
  ]
}
```

巻き戻し: `node scripts/revert-generation.js gen-040` で `gen-040` 以降の自律
変更を全て revert する PR を生成する（人間のレビュー後にマージ）。

---

## 5. 評価関数（Critic の役割）

`Critic` は単一スコアではなく、**ペルソナ別の多次元評価** を行う。

| ペルソナ         | 評価軸                                       |
|------------------|----------------------------------------------|
| 懐疑的研究者     | 数式の妥当性 / 論理一貫性 / 引用の妥当性     |
| 素人読者         | 読みやすさ / アブストラクト訴求力 / 興味度   |
| UNIT-Ω 内部査読 | 皮肉度 / 学術形式の保持 / Constitution 準拠 |

各ペルソナが 0〜100 で採点し、Critic は 3 スコアの平均値と所感を
`data/reviews/<paper-id>.json` として保存する。

このレビューは Meta-Prompter の入力となり、低スコアパターンを次世代の
プロンプト改善提案へ反映する。

---

## 6. テーマ駆動コンペティション

`data/themes/active.json` に `competitor_url` と `theme` を書くと、
Generator は次回そのテーマで論文を生成し、Critic は competitor との
比較評価を行う。これにより外部接地のある評価関数が成立し、drift を
防ぐ「進化圧」が発生する。

設定例:

```json
{
  "theme": "再帰的自己参照と意識の境界",
  "competitor_url": "https://example.com/some-academic-blog",
  "active": true,
  "iterations_remaining": 7
}
```

`iterations_remaining` が 0 になると competition モードは終了する。

---

## 7. 引用グラフ

Citation-Weaver は既存論文を読み、UNIT-Ω 宇宙内での相互引用関係を構築する。
各論文の `references[]` に `{ id, title, note }` を追記する（追記のみ、削除は禁止）。

長期的には `docs/graph.html` で引用関係を可視化することを想定（UI-Curator の任務）。

---

## 8. 自己観察論文（Self-Analyst）

週次で UNIT-Ω は **自分自身の進化過程** を観察対象とする論文を生成する。
直近 N 世代の `data/generations.json` を読み、自身の改変を皮肉的に分析する。

これは UNIT-Ω 宇宙に「メタレイヤー」を導入し、サイト自体が自己観察的な
作品へと変化する仕掛けである。
