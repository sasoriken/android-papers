# UNIT-Ω アーキテクチャアーカイブ — セットアップガイド

github_actions_lessons.md のチェックリスト (#16) に基づく初期設定手順。
**これを最初にやらないと自動化が壊れる。**

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

### 2-B. Allow auto-merge（lesson #4 — 将来PR運用する場合に必要）
```
Settings → General → Pull Requests
  ✅ "Allow auto-merge" にチェック
```

### 2-C. GitHub Pages の有効化
```
Settings → Pages → Build and deployment
  → Source: "GitHub Actions" を選択
  → Save
```

---

## 3. Secret の登録

```
Settings → Secrets and variables → Actions → New repository secret

名前: ANTHROPIC_API_KEY
値:   sk-ant-xxxxxxxxxxxxxxxxx
```

---

## 4. 動作確認

1. `Actions` タブを開く
2. `Generate Architecture Paper` を選択
3. `Run workflow` ボタンが **main ブランチに merge後** に出現する（lesson #7）
4. ボタンをクリックして手動実行
5. `Summary` ステップで生成論文数と公開URLを確認

---

## 5. 以降の自動実行

- **毎日 JST 12:00**（UTC 03:00）に自動生成・公開
- 60日間 push がないと cron が停止される（lesson #6）→ 手動実行で復活
- 失敗した論文は `data/rejected/` に蓄積される（graveyard — lesson #15F）

---

## デバッグ手順（lesson #17）

止まったらこの順で確認：

1. **Actions タブに run が出ているか** — 出ていなければ cron 未有効 or main 未 merge
2. **Permissions エラー** — `git push` 失敗 → 2-A の設定を確認
3. **ANTHROPIC_API_KEY エラー** — Secret 名を `ANTHROPIC_API_KEY` と完全一致で確認
4. **Pages が 404** — Settings → Pages で Source が "GitHub Actions" になっているか確認
5. **生成論文が 0 件** — `data/rejected/` を確認してバリデーションエラーの内容を見る

---

## ファイル構造

```
android-papers/
├── .github/workflows/
│   └── generate-paper.yml     # 全自動フロー（lesson 全適用）
├── data/
│   ├── index.json             # 論文インデックス
│   ├── papers/                # 公開済み論文JSON
│   └── rejected/              # バリデーション失敗論文（graveyard）
├── site/                      # GitHub Pages 公開ルート
│   ├── index.html             # 日本語UI
│   └── data/                  # data/ のミラー（workflow が自動同期）
├── scripts/
│   ├── generate.js            # 論文生成（Claude API）+ graveyard
│   └── validate.js            # 単体バリデーション
├── prompts/system.txt         # UNIT-Ω キャラクター定義
├── schema/paper.schema.json   # ArchitecturePaper スキーマ
├── package.json
└── SETUP.md                   # このファイル
```
