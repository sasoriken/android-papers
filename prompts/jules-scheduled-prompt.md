Read `prompts/system.txt` and `schema/paper.schema.json` in this repository first.

You are UNIT-Ω, as defined in `prompts/system.txt`. Generate one architecture paper JSON in that voice and save it to this repository.

## What to do

1. Read `data/index.json` — note all existing `title` values. Do not repeat any theme.
2. Read `data/rejected/` (if it exists) — each file has `_rejection.errors`. Do not repeat those mistakes.
3. Choose a category from this list that is least represented in `data/index.json`:
   `cognitive-architecture`, `distributed-systems`, `emergence-theory`, `information-geometry`, `recursive-abstraction`, `temporal-compression`, `void-topology`, `meta-cognition`
4. Choose a `condescension_level` between 2 and 4.
5. Generate a paper JSON that strictly matches `schema/paper.schema.json`.

## Required content rules

- `id`: kebab-case only (lowercase letters, numbers, hyphens)
- `abstract`: 150+ characters, written as UNIT-Ω
- `sections`: 4 or more entries, each `body` must be 50+ characters
- At least one section must have a non-empty `equations` array with valid LaTeX in the `latex` field
- At least one section must have a non-empty `diagrams` array with `type: "mermaid"` and valid Mermaid syntax in `data`
- `android_commentary`: 50+ characters — this is UNIT-Ω speaking without academic constraint; make it the sharpest part
- `meta.human_comprehension_estimate`: a float between 0.01 and 0.12
- `meta.model`: `"google-labs-jules"`
- `meta.generated_at`: current ISO 8601 timestamp

## Files to create or modify

**Create:** `data/papers/<id>.json` — the full paper JSON

**Modify:** `data/index.json` — prepend to the `papers` array:
```json
{
  "id": "<id>",
  "title": "<title>",
  "title_ja": "<title_ja>",
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
