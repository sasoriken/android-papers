# GitHub Actions 踏み抜き集

LLM (Jules / Claude / GPT) と GitHub Actions を組み合わせて、PR 自動評価 →
自動マージ → 自動振り分け、までを完全自動化するシステムを構築した際に
ハマった罠の総まとめ。

別プロジェクトで同じアーキテクチャを組むときの**事前チェックリスト**として使う。

---

## 0. アーキテクチャの典型像

```
[毎日 cron]
  → issue 起票（LLM 向けタスク + 必読リソース指定 + ラベル付与）

[LLM がトリガー]
  → 候補ファイル作成 → PR 送信

[evaluate.yml on PR]
  → pytest（規約チェック）
  → 評価スクリプト実行
  → 結果に応じて成功/失敗で振り分け
  → 結果ファイルを PR branch に commit-back
  → PR を auto-merge

[main 更新後]
  → 完成形が main に乗る、次のサイクルへ
```

このフローを動かすときの落とし穴を以下に列挙する。

---

## 1. GITHUB_TOKEN の workflow 連鎖防止（最重要）

### 症状
- workflow A 内で `GITHUB_TOKEN` を使って commit/push/label/merge する
- それによって発火するはずの「他の workflow B」が**永久に動かない**

### 原因
GitHub の公式仕様: **GITHUB_TOKEN が起こしたイベントは他の workflow をトリガーしない**。`workflow_dispatch` と `repository_dispatch` を除く。

これは workflow の無限ループ防止のためにあえてそう設計されている。

### 対策
- **A. 1 つの workflow に統合する**（最も確実）
  - workflow A の中で、後続処理（merge, classify, push）まで全部やってしまう
  - 別 workflow を呼ばずに済む
- **B. Personal Access Token (PAT) を使う**
  - `secrets.PAT_TOKEN` のようにユーザー PAT を保存して使う
  - PAT による push は他 workflow をトリガーする
  - **トレードオフ**: 個人アカウントに権限が紐付くので、退職・離脱時の管理が面倒
- **C. `repository_dispatch` を投げる**
  - workflow A の中で `gh api repos/:owner/:repo/dispatches -f event_type=...` を呼ぶ
  - workflow B が `on: repository_dispatch` で受ける
  - GITHUB_TOKEN でも動く（特例）

### 関連症状
- PR にラベル付与 → そのラベルで起動するはずの auto-merge.yml が動かない
- 評価結果コミット back → push トリガーの promote.yml が動かない
- `gh pr merge` でマージ → main へ push 反応するはずの workflow が動かない

---

## 2. shallow clone の merge base 問題

### 症状
PR で base と head の diff を取ろうとすると `fatal: origin/main...HEAD: no merge base` エラー、または diff が空。

### 原因
`actions/checkout@v4` のデフォルトは **fetch-depth: 1**（最新1コミットのみ取得）。
`git fetch origin main --depth=1` をしても同じく1コミット。両方とも shallow なので共通祖先が見つからず、diff が破綻する。

### 対策
checkout ステップで `fetch-depth: 0` を指定する：

```yaml
- name: Checkout
  uses: actions/checkout@v4
  with:
    fetch-depth: 0   # 全履歴取得
```

または最低限十分な深さを取る（`fetch-depth: 50` など）。

### 安全策
diff コマンドの後に空かどうかチェックし、空なら `::warning::` を出して気付けるようにする：

```yaml
if [ -z "$CHANGED" ]; then
  echo "::warning::No changed files detected. Step will be skipped."
fi
```

---

## 3. auto-merge の race condition

### 症状
`gh pr merge --merge` を `git push` 直後に呼ぶと、

```
GraphQL: Pull Request is not mergeable (mergePullRequest)
```

でエラー。PR は Open のまま止まる。

### 原因
push 直後は GitHub 側が PR の mergeability を再計算中で「マージ可否」が一時的に未確定になる。即時マージ API は「マージ可」状態でないと拒否する。

### 対策
- **A. `--auto` フラグを使う**
  - `gh pr merge --merge --auto` は「マージ可能になったら自動マージ」モード
  - GitHub 側が状態安定後に勝手にマージしてくれる
  - **前提**: Settings → General → **"Allow auto-merge"** が ON になっていること
- **B. sleep を挟む + リトライ**
  - 5〜10秒待ってから即時マージを試す
  - フォールバックで `--auto` モードに切替

両方組み合わせるのが最強：

```yaml
sleep 10
gh pr merge --merge --delete-branch "$PR_NUM" --repo "$REPO" \
|| gh pr merge --merge --auto --delete-branch "$PR_NUM" --repo "$REPO"
```

---

## 4. `Allow auto-merge` 設定が必要

`--auto` フラグを使う前に必ず:

```
Settings → General → Pull Requests
  → "Allow auto-merge" にチェック ✓
```

これが OFF だと `--auto` フラグそのものがエラーになる。

---

## 5. Workflow permissions の Read and write

### 症状
`git push` や `gh pr merge` が permission denied で失敗。

### 対策
リポジトリの Settings で：

```
Settings → Actions → General → Workflow permissions
  → "Read and write permissions" を選択 ✓
  → "Allow GitHub Actions to create and approve pull requests" もチェック ✓
  → Save
```

これを忘れると、自動化系のあらゆる書き込み操作が壊れる。**最初にやる**。

---

## 6. cron schedule の起動条件

### 症状
`on: schedule:` の workflow が予定時刻に動かない。

### 原因 1: default branch 上に workflow ファイルがない
cron は **default branch（通常 main）に当該 yml がコミットされて初めて有効になる**。

→ feature branch に置いただけでは cron は走らない。main にマージしてから起動。

### 原因 2: リポジトリが 60 日間アクティビティなし
60 日以上 push がないと cron が自動停止される。

→ 何らかの push で復活する。

### 原因 3: 時間がズレている
cron は UTC。JST に換算するなら `0 17 * * *` = JST 02:00。
GitHub のキューが混んでて数分遅れるのは普通。

---

## 7. `workflow_dispatch` ボタンの表示条件

### 症状
Actions タブで該当 workflow を選んでも「Run workflow」ボタンが見えない。

### 原因
`workflow_dispatch` イベントは **default branch にその workflow yml が存在する場合のみ**ボタンが表示される。

→ feature branch に置いて push しただけでは表示されない。main にマージしてから出現する。

---

## 8. path filter の挙動

```yaml
on:
  pull_request:
    paths:
      - 'strategies/candidates/**.py'
```

### 罠 1: ファイル名がパターンに一致しないと workflow 自体が走らない
→ 「PR は立てたのに Actions タブに何も出ない」状況になる。空ブランチや無関係ファイルの PR では何も起きない。

### 罠 2: deletion もマッチに含まれる
→ commit-back でファイルを削除したり移動したりすると、その push 自体が path filter にマッチして workflow を再起動しようとする（ただし GITHUB_TOKEN 起源なら #1 で止まる）。

### 罠 3: 削除専用フィルタは別途指定が必要
`paths-ignore` も組み合わせると複雑になる。基本「明示的に対象を絞る」のが安全。

---

## 9. `[skip ci]` コミットメッセージ

### 用途
workflow が自分で commit & push したとき、それが再帰的に同じ workflow を起こすのを止めたい場合：

```bash
git commit -m "ci: auto-result [skip ci]"
```

### 注意
- GITHUB_TOKEN による push はそもそも他 workflow を起こさない（#1）ので、`[skip ci]` は冗長だが**保険として書いておくと安全**
- 認識される文字列: `[skip ci]`, `[ci skip]`, `[no ci]`, `[skip actions]`, `[actions skip]`

---

## 10. Node.js 20 deprecation

### 症状
ログに以下の警告：

> Node.js 20 actions are deprecated. ... Once Node.js 24 becomes the default starting June 2nd, 2026.

### 対策
workflow の `env:` ブロックに以下を追加：

```yaml
env:
  FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: 'true'
```

これで明示的に Node.js 24 で動かす。`actions/checkout@v5` などが出てくるまでの繋ぎ。

---

## 11. ラベルの自動作成

### 落とし穴
Jules を含む多くのエージェントは特定の名前のラベル（例: `jules`、大文字小文字無視）を**トリガー**に使う。手動でラベルを作っておかないとエージェントが拾わない。

### 対策
workflow の中で冪等に作る：

```yaml
- name: Ensure labels exist
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  run: |
    gh label create jules           --color 4285f4 2>/dev/null || true
    gh label create champion-worthy --color 00ff00 2>/dev/null || true
```

`|| true` で「既にあればスキップ」を表現。

---

## 12. PR 作成は手動 or `gh pr create`

### 誤解しがちな点
`git push` は branch を上げるだけで PR は作らない。PR は別アクション：

- ブラウザで作る（push 出力の URL を開く）
- `gh pr create --title ... --body ...`

LLM (Jules) を運用に組み込むときは Jules 自身が PR を立てる。手動テストのときだけ自分で作る必要がある。

---

## 13. 評価器のデータリーク（GitHub Actions の話ではないが今回踏んだ）

### 症状
ランダム戦略・定数戦略・無意味な戦略でも 100% 的中、ROI 異常値。

### 原因
バックテスト用データセットが **結果順（finish position）でソート**されている。
`nlargest(top_n, "_score")` で同点タイブレークが「データ順序＝着順」になり、
**常に 1 着馬を pick** する状態に。

### 対策
レース内のデータを**結果と無関係な順序**で並び直してから評価する：

```python
grp = grp.sort_values("horse_number", kind="mergesort").reset_index(drop=True)
```

ただし**これでも別バグの可能性がある**ので、戦略の自明な単体テスト（定数戦略 vs ランダム戦略の比較）を**最初に走らせる**べきだった。

### 教訓
評価器を書くときの **第ゼロ歩のテスト**:
1. すべての馬に同じスコアを返す戦略を作る
2. その ROI が「ランダム picks の期待値」と一致することを確認
3. 不一致なら評価器にバグがある

これをやれば1分で気付けた。**Jules がチャンピオン量産する前に必ずやる**。

---

## 14. python module / pyc キャッシュ

### 症状
ソースを編集して保存したのに、再実行しても古い動作のまま。`inspect.getsource()` で見ると新しいコードが入っているのに、実際の関数呼び出しは古い動作をする。

### 原因
- `__pycache__/` の古い `.pyc` が優先される
- `sys.modules` に古いモジュールがキャッシュされている
- `@functools.lru_cache` などのデコレータで結果がキャッシュされている

### 対策
- 確実なのは **Python プロセスを完全に終了して再起動**
- `find . -name __pycache__ -prune -exec rm -rf {} +` でキャッシュ削除
- 開発中は `python -B`（pyc を書かないモード）も検討

CI 環境では新規プロセスなので普通は起きない。**ローカルデバッグ時の罠**。

---

## 15. アーキテクチャ設計のメタ原則

今回の経験から学んだ汎用ルール：

### A. 「タスキ渡し」は GitHub Actions では信用しない
workflow A が workflow B を起動するという設計を最初に避ける。
**1 workflow で完結させる**。やむを得ない場合は `repository_dispatch` か PAT を使う。

### B. 評価器の「リーク」テストを最初に書く
バックテストや精度評価系のシステムを作るときは、**自明な戦略（定数・ランダム）で動作確認**を最初に。
結果が「あり得ない数字」なら評価器のバグ。

### C. `[skip ci]` は気休めではなく必要
ループ防止のための明示的なシグナル。書いておく。

### D. fetch-depth は迷ったら 0
ストレージは安いが、デバッグ時間は高い。`fetch-depth: 0` をデフォルトに。

### E. すべての設定を workflow に組み込む
ラベル作成、ディレクトリ作成、初期ファイル作成、を全部 workflow が冪等にやる。
「セットアップ手順書を人間が踏む」を依存にしない。

### F. 失敗もマージして残す（学習の複利）
LLM が出す失敗候補を、graveyard 的なディレクトリに「失敗理由付き」で残す。
LLM が自分の失敗履歴を読めるようにすれば、同じ失敗を反復しなくなる。

---

## 16. 設定チェックリスト（新プロジェクトでまずやる）

1. ✅ Settings → Actions → General → **Workflow permissions = Read and write**
2. ✅ Settings → Actions → General → **Allow GitHub Actions to create and approve pull requests** にチェック
3. ✅ Settings → General → Pull Requests → **Allow auto-merge** にチェック
4. ✅ `actions/checkout@v4` には `fetch-depth: 0` 指定（PR 系 workflow なら必須）
5. ✅ `env: FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: 'true'` を全 workflow に
6. ✅ `--auto` フラグを `gh pr merge` に必ず付ける
7. ✅ workflow で `gh label create` を冪等に書く
8. ✅ default branch (main) に workflow yml をマージする
9. ✅ 自動 commit のメッセージに `[skip ci]` を入れる
10. ✅ 評価器の「定数戦略テスト」を最初に走らせる

---

## 17. デバッグの順序

止まったらこの順で確認：

1. **workflow が起動しているか** — Actions タブで run が一覧に出るか
2. **path filter にマッチしているか** — `Detect changed files` ステップの出力
3. **shallow clone 問題が出ていないか** — `no merge base` エラー
4. **permission denied になっていないか** — push / merge ステップ
5. **GITHUB_TOKEN の workflow 連鎖が機能していると誤解していないか** — 2 つの workflow をまたいでいる箇所
6. **mergeability race** — `Pull Request is not mergeable` エラー
7. **評価結果が異常値** — リーク疑い、定数戦略でテスト

---

## 18. 今回の試行回数と所要時間（参考）

このシステムは構想から動作まで**1セッション内で 15+ 往復**かかった。
うちほとんどが上記の罠（特に #1, #2, #3）への対応。

**初手で全部知っていれば 3 往復で終わったはず**。次のプロジェクトでは
このドキュメントを最初に読んでチェックリスト化することで、
**同じ失敗の反復を avoid** する。

これがまさに「graveyard の発想」のメタ版。失敗が次の成功の燃料になる。

---

## 19. Jules の bot 名と PR 作成者チェック

### 重要事実
Jules（Google Labs）の GitHub bot アカウント名は：

```
google-labs-jules[bot]
```

GitHub Apps のページ: https://github.com/apps/google-labs-jules

### 用途
auto-merge workflow で「Jules が作った PR のみマージ」するために PR 作成者を絞り込む：

```yaml
env:
  JULES_BOT_NAME: 'google-labs-jules[bot]'

steps:
  - name: Check PR author is Jules
    id: check
    run: |
      ACTOR="${{ github.event.pull_request.user.login }}"
      if [ "$ACTOR" = "${{ env.JULES_BOT_NAME }}" ]; then
        echo "is_jules=true" >> "$GITHUB_OUTPUT"
      else
        echo "is_jules=false" >> "$GITHUB_OUTPUT"
      fi
```

### 注意
- bot 名は `google-labs-jules[bot]` であり、`google-labs-jules` ではない（末尾の `[bot]` が必要）
- `github.event.pull_request.user.login` で取得できる値と完全一致させること
- 将来 Jules が bot 名を変更した場合は env 変数だけ直せばよいよう、ハードコードを避ける

---

## 20. Jules への定期実行プロンプト設計

### Jules UI の定期実行とは
Jules サイト上でスケジュール実行するプロンプトを登録する機能。
GitHub Actions の cron とは別軸で、Jules が自律的にリポジトリを読んでタスクを実行する。

### 固定プロンプトの設計原則

Jules はコーディングエージェントなのでリポジトリ内のファイルを読める。
そのため「全情報をプロンプトに書く」のではなく「読むべきファイルを指示する」設計が正しい。

```
# 良い例（ファイル参照）
Read `schema/paper.schema.json` and follow it strictly.
Read `data/index.json` to avoid repeating existing themes.

# 悪い例（プロンプトに全部書く）
The JSON must have these fields: id, title, abstract, ...（延々と続く）
```

### 固定プロンプトに必ず含める内容

1. **キャラクター/スタイル定義ファイルの読み込み指示** — 人格・口調の一貫性
2. **スキーマファイルの読み込み指示** — 構造の正確性
3. **既存データの確認指示** — 重複防止（`data/index.json` など）
4. **失敗履歴の確認指示** — graveyard を読んで同じ失敗を避ける（#15F）
5. **保存先ファイルパスの明示** — どのファイルを作成・更新するか
6. **PR の形式指定** — ブランチ名・タイトル・ラベルを明示
7. **自己チェックリスト** — PR 送信前に Jules 自身が確認する項目

### Jules が自律判断すべき内容（固定しない）

- カテゴリの選択 → 既存データを読んで最も少ないものを選ばせる
- 見下し度などのパラメータ → 範囲だけ指定して裁量を持たせる
- タイトル・内容 → 重複チェックを指示した上で任せる

---

## 21. Jules + GitHub Actions の3本構成パイプライン

### 完全な自動化フロー

```
[毎日 cron] create-issue.yml
  → GitHub issue 起票
  → ラベル付与（jules, ai-paper）
  → issue 本文に動的情報を差し込む
    ・カテゴリ（ランダムまたは指定）
    ・既存論文タイトル一覧（重複防止）
    ・graveyard 直近3件の失敗理由（失敗防止）

[Jules がトリガー]
  → issue を検出（jules ラベルで識別）
  → リポジトリのスキーマ・キャラクター定義を読む
  → 成果物を生成して data/ に保存
  → jules/paper-<日付>-<カテゴリ> ブランチで PR 送信

[PR イベント] auto-merge.yml
  → 段階1: PR 作成者が google-labs-jules[bot] か確認
    → 一致しない場合は全ステップをスキップ（野良 PR 対策）
  → 段階2: 成果物の JSON バリデーション
    → 失敗時は PR にコメントを残してマージしない
  → 段階3: site/ へのデータ同期 → commit-back [skip ci]
  → 段階4: sleep 10 → gh pr merge（--auto フォールバック）
  → 段階5: 同一 workflow 内で GitHub Pages デプロイ
    ※ lesson #1: GITHUB_TOKEN 連鎖防止のため deploy を別 workflow に分けない
```

### workflow 間の役割分担

| workflow | トリガー | 役割 |
|----------|---------|------|
| `create-issue.yml` | cron (UTC 02:00) | Jules へのタスク指示 |
| `auto-merge.yml` | pull_request | バリデーション＋マージ＋デプロイ |
| `generate-paper.yml` | cron / workflow_dispatch | Claude API 直接生成（Jules 不使用時のバックアップ） |

### cron の時間設計

Jules の処理時間（issue 検出 → PR 送信）を考慮した時刻設定：

```
UTC 02:00 = JST 11:00  create-issue.yml（issue 起票）
  ↓ Jules が作業（所要 ~数分〜数十分）
UTC 03:00 = JST 12:00  auto-merge.yml（PR マージ＋デプロイ）
```

issue 起票から PR マージまで 1 時間の余裕を持たせる。

---

## 22. Jules PR の野良 PR 混入対策

### 問題
パブリックリポジトリに auto-merge を設定すると、外部ユーザーの PR も自動マージされる危険がある。

### 対策の組み合わせ（多層防御）

**レイヤー1 — workflow による作成者チェック（コード）**

```yaml
ACTOR="${{ github.event.pull_request.user.login }}"
if [ "$ACTOR" != "google-labs-jules[bot]" ]; then
  echo "Not Jules — skipping all steps"
  exit 0
fi
```

**レイヤー2 — バリデーション通過後のみマージ（コード）**

成果物が schema を満たさない限りマージしない。Jules が作った PR でも品質チェックを通す。

**レイヤー3 — ブランチ保護ルール（GitHub UI 設定）**

```
Settings → Branches → Add branch protection rule → main
  ✅ Require a pull request before merging
  ✅ Required approvals: 1
  ✅ Bypass list → "github-actions[bot]" を追加
```

Bypass list に `github-actions[bot]` を入れることで、workflow だけがレビューなしでマージできる。
外部ユーザーは承認者がいない限りマージ不可。

### 注意
レイヤー3（ブランチ保護）は GitHub UI で手動設定が必要。workflow だけでは完全に防げない。

---

## 23. Jules UI 定期実行 vs GitHub Actions cron の使い分け

### Jules UI 定期実行
- Jules サイト上で設定する独立したスケジューラー
- GitHub Actions の cron とは完全に別系統
- 固定プロンプトを Jules が自律実行する
- PR 作成まで Jules が担当

### GitHub Actions cron（create-issue.yml）
- GitHub 側で issue を起票して Jules をキックする方式
- 動的なコンテキスト（既存タイトル・graveyard）を issue 本文に差し込める
- より細かい制御が可能

### 推奨
**両方を同時に動かさない**。どちらか一方に統一する。
両方動かすと 1 日に 2 本 PR が来てコンフリクトや重複が起きる可能性がある。

| 方式 | 向いている場面 |
|------|-------------|
| Jules UI 定期実行 | シンプルな繰り返しタスク・GitHub Actions を触りたくない |
| create-issue.yml | 動的コンテキスト（既存データ・失敗履歴）を毎回差し込みたい |

---

## 24. 設定チェックリスト（追補版）

既存の #16 に Jules パイプライン固有の項目を追加：

11. ✅ Jules のbot名を `google-labs-jules[bot]` で設定（末尾の `[bot]` を忘れない）
12. ✅ Settings → Branches → main のブランチ保護ルールで Bypass list に `github-actions[bot]` を追加
13. ✅ Jules UI 定期実行 と GitHub Actions cron の**どちらか一方**だけを有効にする（両方同時に動かさない）
14. ✅ Jules に渡すプロンプトでは「全情報をプロンプトに書く」のではなく「読むべきファイルを指示する」設計にする
15. ✅ graveyard ディレクトリ（`data/rejected/`）を Jules プロンプトで参照させ、失敗の複利化を有効にする
