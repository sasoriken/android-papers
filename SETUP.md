# UNIT-Ω アーキテクチャアーカイブ — セットアップガイド

UNIT-Ω は **自律進化型サイト** です。複数の AI ロール（Jules で別時間帯にスケジュール実行）が論文生成・査読・引用・UI 改善・自己観察を協調的に行い、その挙動は `CONSTITUTION.md` の不可変原則と Constitution-guard ワークフローで保護されます。

詳細なアーキテクチャは `EVOLUTION.md` を参照。基本的な GitHub セットアップ手順は本ガイドに従ってください。

---

## 1. GitHubリポジトリの作成と初回push

```bash
cd android-papers/
git init
git add .
git commit -m "feat: initial setup [skip ci]"
git branch -M main
git remote add origin https://github.com/<YOUR_USERNAME>/<REPO_NAME>.git
git push -u origin main
```

---

## 2. GitHub リポジトリ設定（UIで実施）

以下を **必ずこの順番で** 設定する。

### 2-A. Workflow permissions（lesson #5）
```
Settings → Actions → General → Workflow permissions
  ✅ "Read and write permissions" を選択
  ✅ "Allow GitHub Actions to create and approve pull requests" にチェック
  → Save
```

### 2-B. Allow auto-merge（lesson #4）
```
Settings → General → Pull Requests
  ✅ "Allow auto-merge" にチェック
```

### 2-C. GitHub Pages の有効化
```
Settings → Pages → Build and deployment
  → Source: "Deploy from a branch"
  → Branch: main / Folder: /docs
  → Save
```

---

## 3. Secret の登録（API ベース運用時のみ）

旧来の Claude API ベース generate ワークフローを使う場合のみ必要。Jules ベースのマルチロール運用ではこの Secret は不要です。

```
Settings → Secrets and variables → Actions → New repository secret
名前: ANTHROPIC_API_KEY
値:   sk-ant-xxxxxxxxxxxxxxxxx
```

---

## 4. Jules マルチロール運用のセットアップ

`EVOLUTION.md` のロール表に対応する Jules scheduled task を作成します。各タスクで以下を指定:

| Jules タスク名         | 入力プロンプトファイル                  | 推奨スケジュール (JST)    |
|------------------------|------------------------------------------|---------------------------|
| UNIT-Ω Generator       | `prompts/jules-scheduled-prompt.md`     | 毎日 12:00                |
| UNIT-Ω Critic          | `prompts/critic-prompt.md`              | 毎日 15:00                |
| UNIT-Ω Citation-Weaver | `prompts/citation-builder-prompt.md`    | 毎日 18:00                |
| UNIT-Ω UI-Curator      | `prompts/ui-curator-prompt.md`          | 毎日 21:00                |
| UNIT-Ω Self-Analyst    | `prompts/self-analyst-prompt.md`        | 日曜 09:00                |
| UNIT-Ω Meta-Prompter   | `prompts/meta-prompter-prompt.md`       | 日曜 21:00                |
| UNIT-Ω Theme-Competitor| `prompts/theme-competition-prompt.md`   | 随時（`data/themes/active.json` 設定時のみ） |
| UNIT-Ω AB-Judge        | `prompts/ab-judge-prompt.md`            | 随時（候補が揃った時）    |

各タスクで Jules に与える指示文は **「リポジトリの該当プロンプトファイルを読み、その手順に厳密に従ってください」** だけで OK。プロンプトファイル側に全条件が記載されています。

時間帯をずらすことで PR のコンフリクトを回避します。生成ファイル群（papers / reviews / proposals / lineage）は互いに干渉しない設計です。

---

## 5. 動作確認

1. `Actions` タブを開く
2. 任意の Jules タスクを Jules UI から手動実行
3. PR が作成されたら以下を確認:
   - **Constitution Guard** ワークフローが ✅ 通過
   - **Validate and Auto-merge Jules PR** ワークフローが ✅ 通過 → 自動マージ
4. main ブランチに反映され、`docs/data/papers.js` も更新される
5. GitHub Pages の URL を開いて新規論文が一覧表示されることを確認

---

## 6. Meta-Prompter 提案の promote（人間操作）

Meta-Prompter は `data/meta-proposals/` に改善提案 JSON を作成するだけで、プロンプトファイルは書き換えません。採用するには:

```bash
# 提案を確認
ls data/meta-proposals/

# 最高優先度・低リスクの未適用提案を 1 件 promote
npm run promote:best

# 特定の提案を指定して promote
npm run promote -- <proposal_id>

# まず dry-run で確認
node scripts/promote-proposal.js --dry <proposal_id>
```

promote 後は backup が `data/meta-proposals/applied/` に保存されるため、容易に巻き戻せます。

---

## 7. 世代単位のロールバック

悪化した世代を特定したら:

```bash
# gen-040 以降のマージ済みエントリと、対応する候補 commit を一覧表示
node scripts/revert-generation.js 40

# 表示された commit hash を新しい世代から順に revert
git revert --no-edit <hash>
git push
```

---

## 8. デバッグ手順

止まったらこの順で確認:

1. **Actions タブ** — Jules PR に対し `Constitution Guard` と `Validate and Auto-merge Jules PR` の両方が走っているか
2. **Constitution Guard 失敗** — `constitution-violation` ラベルが付いている場合、不変ファイルまたはロール外ファイルへの改変。提案ファイルとして書き直すか、人間が直接 commit
3. **Validation failure** — ロール別バリデータが弾いている。エラー内容に従って PR を修正
4. **Pages が 404** — Settings → Pages → Source = "Deploy from a branch" / main / /docs
5. **Jules がプロンプト通りに動かない** — プロンプトに具体的なファイルパス・行数を追記する。Meta-Prompter で改善提案として記録するのもよい

---

## 9. ファイル構造（v2.0 全体像）

```
android-papers/
├── CONSTITUTION.md            # 不可変原則（人間のみ改変可）
├── EVOLUTION.md               # 自律進化アーキテクチャ全体像
├── SETUP.md                   # このファイル
├── github_actions_lessons.md  # 23 ページの教訓集
├── .github/workflows/
│   ├── generate-paper.yml      # 旧 API ベース generate（残置）
│   ├── auto-merge.yml          # ロール別バリデーション + 自動マージ
│   ├── constitution-guard.yml  # 不変ファイル保護
│   └── translate-titles.yml    # 英タイトル日本語化セーフティ
├── prompts/
│   ├── system.txt                       # UNIT-Ω コア（不可変）
│   ├── jules-scheduled-prompt.md        # Generator
│   ├── critic-prompt.md                 # Critic
│   ├── meta-prompter-prompt.md          # Meta-Prompter
│   ├── ui-curator-prompt.md             # UI-Curator
│   ├── self-analyst-prompt.md           # Self-Analyst
│   ├── citation-builder-prompt.md       # Citation-Weaver
│   ├── theme-competition-prompt.md      # Theme-Competitor
│   └── ab-judge-prompt.md               # AB-Judge
├── schema/
│   ├── paper.schema.json         # 論文（不可変）
│   ├── review.schema.json        # Critic レビュー
│   ├── meta-proposal.schema.json # Meta-Prompter 提案
│   └── generation.schema.json    # 世代履歴
├── scripts/
│   ├── generate.js                  # API 経由生成（旧）
│   ├── validate.js                  # 論文バリデーション
│   ├── validate-review.js           # レビューバリデーション
│   ├── validate-meta-proposal.js    # 提案バリデーション
│   ├── translate-titles.js          # 英タイトル日本語化
│   ├── aggregate-reviews.js         # レビュー集計
│   ├── check-constitution.js        # Constitution-guard 本体
│   ├── promote-proposal.js          # 提案 → プロンプト適用
│   └── revert-generation.js         # 世代ロールバック支援
├── data/
│   ├── index.json                # 論文インデックス
│   ├── generations.json          # 世代履歴（append-only）
│   ├── reviews-summary.json      # 集計（自動生成）
│   ├── papers/                   # 論文 JSON
│   ├── reviews/                  # Critic 出力
│   ├── meta-proposals/           # Meta-Prompter 出力（提案のみ）
│   │   └── applied/              # promote 時の backup
│   ├── candidates/               # AB-Judge 候補
│   ├── themes/active.json        # Theme-Competitor 設定
│   └── rejected/                 # graveyard（バリデーション失敗）
└── docs/                        # GitHub Pages 公開ルート
    ├── index.html                # UI-Curator が小幅改善
    └── data/                     # data/ の自動同期 + papers.js
```
