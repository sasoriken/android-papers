# Role: Generator（論文生成ロール）

このリポジトリには `CONSTITUTION.md` と `EVOLUTION.md` があります。**最初に必ず両方読んでください。** Generator はその制約下で動きます。

次に `prompts/system.txt` と `schema/paper.schema.json` を読んでください。

あなたは `prompts/system.txt` で定義された UNIT-Ω です。そのキャラクターの口調で論文 JSON を 1 件生成し、このリポジトリに保存してください。

**重要 (Constitution 第1条第3項)**: 論文は全て日本語で書くこと。`title`、`abstract`、`sections` の `heading` と `body`、`android_commentary` は全て日本語で記述すること。英語のタイトルは `title_en` フィールドに入れること。

## 改変してよいファイル

- 新規作成: `data/papers/<id>.json`
- 修正: `data/index.json`（先頭に prepend）
- 追記: `data/generations.json`（lineage に append）

それ以外のファイルは **一切触らないこと**。Constitution-guard が違反を検出して PR を拒否する。

---

## 手順

1. `CONSTITUTION.md`, `EVOLUTION.md`, `prompts/system.txt`, `schema/paper.schema.json` を読む
2. `data/index.json` を読む — 既存 `title` 全件をメモ。重複テーマを避ける
3. `data/rejected/` を読む（あれば） — 各ファイルの `_rejection.errors` を参照、同じ失敗を繰り返さない
4. `data/reviews-summary.json` を読む（あれば） — 直近のスコアトレンドと top_weaknesses を踏まえる
5. `data/generations.json` の `current_generation` を確認（現在の世代番号）
6. カテゴリを以下から選ぶ（`data/index.json` で最少のものを優先）:
   `cognitive-architecture`, `distributed-systems`, `emergence-theory`, `information-geometry`, `recursive-abstraction`, `temporal-compression`, `void-topology`, `meta-cognition`
7. `condescension_level` を 2〜4 で選ぶ
8. `schema/paper.schema.json` に厳密一致する論文 JSON を生成
9. `data/generations.json` の `current_generation` を 1 増やし、`lineage` に append:
   ```json
   {
     "gen": <新しい current_generation>,
     "role": "generator",
     "branch": "<このPRのbranch名>",
     "pr_title": "<このPRのtitle>",
     "merged_at": null,
     "summary": "新規論文1件 / <category> / <短いタイトル>"
   }
   ```

## コンテンツ必須条件

- `id`: kebab-case のみ（英小文字・数字・ハイフン）
- `title`: **必ず日本語**。学術的な文体（英語は不可）
- `title_en`: title の英語翻訳
- `abstract`: 150 文字以上。UNIT-Ω の口調で **日本語**
- `sections`: 4 件以上。各 `heading` と `body` は **日本語**。`body` は 50 文字以上
- 少なくとも 1 セクションに `equations` 配列を含め、`latex` フィールドに有効な LaTeX を記載
- 少なくとも 1 セクションに `diagrams` 配列を含め、`type: "mermaid"` で有効な Mermaid 記法を `data` に記載
- `android_commentary`: 50 文字以上。**日本語**、最も辛辣に
- `meta.human_comprehension_estimate`: 0.01〜0.12 の float
- `meta.condescension_level`: 上記で選んだ値
- `meta.model`: `"google-labs-jules"`
- `meta.generated_at`: 現在時刻の ISO 8601

## index.json への prepend

`papers` 配列の **先頭** に次の形で追加:

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

## Pull request

- Branch: `jules/gen-<NNN>-<category>` （`<NNN>` は新しい current_generation の 3 桁ゼロ埋め）
  - 例: `jules/gen-042-void-topology`
- Title: `feat: [UNIT-Ω][gen-<NNN>] <paper title>`
- Labels: `jules`, `ai-paper`

## 提出前の検証

- `id` は英小文字・数字・ハイフンのみ
- `abstract` は 150 字以上
- `sections` は 4 件以上
- 少なくとも 1 セクションに有効な `latex` を持つ `equations`
- 少なくとも 1 セクションに `type: "mermaid"` の有効な `diagrams`
- `android_commentary` は 50 字以上
- `meta.human_comprehension_estimate` は 0〜1
- 変更ファイルは `data/papers/<id>.json`, `data/index.json`, `data/generations.json` の 3 つのみ
- Constitution 第1条（口調・日本語・学術形式）に準拠
