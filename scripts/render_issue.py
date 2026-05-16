"""
Jules 向け issue 本文をテンプレートからレンダリングする。

horse-analis の render_jules_prompt.py と同じパターン。
シェルでの複数行文字列操作を避けるためにPythonで処理する。

使い方:
    python scripts/render_issue.py \
      --template prompts/jules-issue-template.md \
      --index data/index.json \
      --rejected data/rejected \
      --category cognitive-architecture \
      --level 3 \
      --date 2026-05-16 \
      --branch jules/paper-2026-05-16-cognitive-architecture \
      --output issue_body.md
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def get_existing_titles(index_path: Path, limit: int = 20) -> str:
    """既存論文タイトルを箇条書きで返す。"""
    if not index_path.exists():
        return "（なし）"
    data = json.loads(index_path.read_text(encoding="utf-8"))
    titles = [p["title"] for p in data.get("papers", [])][:limit]
    if not titles:
        return "（なし）"
    return "\n".join(f"- {t}" for t in titles)


def get_rejected_info(rejected_dir: Path, limit: int = 3) -> str:
    """直近の失敗事例を返す。"""
    if not rejected_dir.exists():
        return "（なし）"
    files = sorted(rejected_dir.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)[:limit]
    if not files:
        return "（なし）"

    lines = []
    for f in files:
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            title = data.get("title", "(無題)")
            errors = data.get("_rejection", {}).get("errors", [])
            lines.append(f'- "{title}":')
            for e in errors:
                lines.append(f"  - {e}")
        except Exception:
            lines.append(f"- {f.name}: (読み込みエラー)")
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--template",  type=Path, required=True)
    ap.add_argument("--index",     type=Path, required=True)
    ap.add_argument("--rejected",  type=Path, required=True)
    ap.add_argument("--category",  required=True)
    ap.add_argument("--level",     required=True)
    ap.add_argument("--date",      required=True)
    ap.add_argument("--branch",    required=True)
    ap.add_argument("--output",    type=Path, required=True)
    args = ap.parse_args()

    tmpl = args.template.read_text(encoding="utf-8")
    existing = get_existing_titles(args.index)
    rejected = get_rejected_info(args.rejected)

    body = (
        tmpl
        .replace("{{CATEGORY}}", args.category)
        .replace("{{LEVEL}}",    args.level)
        .replace("{{DATE}}",     args.date)
        .replace("{{BRANCH}}",   args.branch)
        .replace("{{EXISTING_TITLES}}", existing)
        .replace("{{REJECTED_INFO}}",   rejected)
    )

    args.output.write_text(body, encoding="utf-8")
    print(f"[OK] rendered: {args.output}")


if __name__ == "__main__":
    main()
