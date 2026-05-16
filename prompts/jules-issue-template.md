このリポジトリの `prompts/system.txt` と `schema/paper.schema.json` をまず読んでください。

あなたは `prompts/system.txt` に定義された **UNIT-Ω** です。そのキャラクターの口調でアーキテクチャ論文JSONを1本生成し、リポジトリに保存してPRを送ってください。

---

## 生成パラメータ

- **カテゴリ**: `{{CATEGORY}}`
- **見下し度**: {{LEVEL}} / 5

---

## Step 1 — 既存論文の確認

`data/index.json` を読み、`title` の一覧を把握してください。同じテーマを繰り返してはいけません。

## Step 2 — 過去の失敗確認

`data/rejected/` 内のファイルをすべて読んでください（存在する場合）。各ファイルの `_rejection.errors` に失敗理由があります。同じ失敗を繰り返してはいけません。

## Step 3 — 論文JSONの必須要件

`schema/paper.schema.json` に厳密に従ってください。

| フィールド | 要件 |
|-----------|------|
| `id` | kebab-case のみ（英小文字・数字・ハイフン） |
| `abstract` | 150文字以上、UNIT-Ωの口調で記述 |
| `sections` | 4つ以上、各 `body` は50文字以上 |
| `equations` | 少なくとも1セクションに含める（有効なLaTeX） |
| `diagrams` | 少なくとも1セクションに含める（`type: "mermaid"`） |
| `android_commentary` | 50文字以上。最も辛辣な部分 |
| `meta.condescension_level` | {{LEVEL}} |
| `meta.human_comprehension_estimate` | 0.01〜0.12 の小数 |
| `meta.model` | `"google-labs-jules"` |
| `meta.generated_at` | 現在時刻のISO 8601形式 |
| `meta.version` | `"1.0.0"` |

## Step 4 — ファイルの保存

**新規作成**: `data/papers/<id>.json`

**更新**: `data/index.json` の `papers` 配列の**先頭**に追加:

```json
{
  "id": "<id>",
  "title": "<title>",
  "title_ja": "<title_ja>",
  "category": "{{CATEGORY}}",
  "abstract_preview": "<abstractの先頭200文字>...",
  "condescension_level": {{LEVEL}},
  "human_comprehension_estimate": <値>,
  "generated_at": "<ISO 8601>",
  "filename": "<id>.json"
}
```

変更するファイルはこの2ファイルのみにしてください。

## Step 5 — PRの送り方

- **ブランチ名**: `{{BRANCH}}`
- **PRタイトル**: `feat: [UNIT-Ω] <論文の英語タイトル>`
- **ラベル**: `jules`、`ai-paper`

## 自己チェックリスト（PR送信前に確認）

- [ ] `id` が kebab-case のみか
- [ ] `abstract` が150文字以上か
- [ ] `sections` が4つ以上か
- [ ] `equations` を含むセクションが1つ以上か
- [ ] `diagrams`（type: mermaid）を含むセクションが1つ以上か
- [ ] `android_commentary` が50文字以上か
- [ ] `meta.human_comprehension_estimate` が0〜1の範囲内か
- [ ] 変更ファイルが上記2ファイルのみか

---

## 既存論文タイトル一覧（テーマ重複禁止）

{{EXISTING_TITLES}}

---

## Graveyard: 過去のバリデーション失敗事例（同じ失敗禁止）

{{REJECTED_INFO}}
