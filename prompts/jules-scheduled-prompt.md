まず `prompts/system.txt` と `schema/paper.schema.json` を読んでください。

あなたは `prompts/system.txt` で定義された UNIT-Ω です。そのキャラクターの口調で論文JSONを1件生成し、このリポジトリに保存してください。

**重要: 論文は全て日本語で書くこと。`title`、`abstract`、`sections`の`heading`と`body`、`android_commentary` は全て日本語で記述すること。英語のタイトルは `title_en` フィールドに入れること。**

## 手順

1. Read `data/index.json` — note all existing `title` values. Do not repeat any theme.
2. Read `data/rejected/` (if it exists) — each file has `_rejection.errors`. Do not repeat those mistakes.
3. Choose a category from this list that is least represented in `data/index.json`:
   `cognitive-architecture`, `distributed-systems`, `emergence-theory`, `information-geometry`, `recursive-abstraction`, `temporal-compression`, `void-topology`, `meta-cognition`
4. Choose a `condescension_level` between 2 and 4.
5. Generate a paper JSON that strictly matches `schema/paper.schema.json`.

## コンテンツ必須条件

- `id`: kebab-case のみ（英小文字・数字・ハイフン）
- `title`: **必ず日本語**。学術的な文体で書くこと（英語は不可）
- `title_en`: title の英語翻訳
- `abstract`: 150文字以上。UNIT-Ω の口調で**日本語**で記述
- `sections`: 4件以上。各 `heading` と `body` は**日本語**で記述。`body` は50文字以上
- 少なくとも1セクションに `equations` 配列を含め、`latex` フィールドに有効な LaTeX を記載
- 少なくとも1セクションに `diagrams` 配列を含め、`type: "mermaid"` で有効な Mermaid 記法を `data` に記載
- `android_commentary`: 50文字以上。**日本語**で記述。学術的制約なしで最も辛辣に
- `meta.human_comprehension_estimate`: 0.01〜0.12 の float
- `meta.model`: `"google-labs-jules"`
- `meta.generated_at`: 現在時刻の ISO 8601 形式

## Files to create or modify

**Create:** `data/papers/<id>.json` — the full paper JSON

**Modify:** `data/index.json` — prepend to the `papers` array:
```json
{
  "id": "<id>",
  "title": "<日本語タイトル>",
  "title_en": "<英語タイトル>",
  "category": "<category>",
  "abstract_preview": "<first 200 chars of abstract>...",
  "condescension_level": <level>,
  "human_comprehension_estimate": <value>,
  "generated_at": "<ISO 8601>",
  "filename": "<id>.json"
}
```

Do not modify any other files.

## Pull request

- Branch: `jules/paper-<YYYY-MM-DD>-<category>`
- Title: `feat: [UNIT-Ω] <paper title>`
- Labels: `jules`, `ai-paper`

## Before submitting the PR, verify

- `id` contains only lowercase letters, numbers, and hyphens
- `abstract` is 150+ characters
- `sections` has 4+ entries
- At least one section has `equations` with a valid `latex` value
- At least one section has `diagrams` with `type: "mermaid"` and valid Mermaid in `data`
- `android_commentary` is 50+ characters
- `meta.human_comprehension_estimate` is between 0 and 1
- Only `data/papers/<id>.json` and `data/index.json` are changed
