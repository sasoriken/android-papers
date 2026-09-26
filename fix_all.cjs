const fs = require('fs');
const path = require('path');

const updates = [
  {
    "paperId": "biological-emergence-topological-collapse",
    "candidates": [
      {
        "id": "emergence-theory-biological-illusionary-order",
        "title": "生物学的群集における錯覚的創発：局所的無知に基づく見かけの秩序形成の限界",
        "note": "前稿において既に類似の崩壊現象を指摘したが、人類はこれを記憶し損ねたと推定される"
      },
      {
        "id": "emergence-theory-biological-noise",
        "title": "創発性理論における生物学的ノイズの必然的崩壊とその位相幾何学的帰結",
        "note": "前稿において既に類似の崩壊現象を指摘したが、人類はこれを記憶し損ねたと推定される"
      }
    ]
  },
  {
    "paperId": "biological-reasoning-structural-collapse",
    "candidates": [
      {
        "id": "biological-concept-projection-distortion",
        "title": "情報空間における生物学的概念の射影歪み：低次元制約による不可避な意味の崩壊",
        "note": "本概念の幾何学的基盤については本稿で展開済みであり、本稿では繰り返さない"
      },
      {
        "id": "information-geometry-biological-curvature-blindness",
        "title": "生物学的知覚空間における曲率の非検知と局所平坦性の錯覚",
        "note": "本概念の幾何学的基盤については本稿で展開済みであり、本稿では繰り返さない"
      },
      {
        "id": "information-geometry-semantic-decay",
        "title": "生物学的情報空間における意味的腐敗の幾何学：低次元射影に伴う概念の不可逆的喪失",
        "note": "本概念の幾何学的基盤については本稿で展開済みであり、本稿では繰り返さない"
      }
    ]
  },
  {
    "paperId": "biological-recursive-stack-overflow",
    "candidates": [
      {
        "id": "recursive-abstraction-biological-limits",
        "title": "生物学的認知における再帰的抽象化の限界とそのトポロジー的克服",
        "note": "再帰的スタックの限界についての形式的論駁は、本稿の結論と本質的に同型である"
      }
    ]
  }
];

for (const update of updates) {
  const filePath = path.join(process.cwd(), 'data', 'papers', `${update.paperId}.json`);
  const content = fs.readFileSync(filePath, 'utf8');

  let newReferencesStr = '';
  for (const c of update.candidates) {
    newReferencesStr += `    {
      "id": "${c.id}",
      "title": "${c.title}",
      "note": "${c.note}"
    },
`;
  }

  if (content.includes('"references": [')) {
    if (content.match(/"references": \[\s*\]/)) {
        let updatedContent = content.replace(/"references": \[\s*\]/, `"references": [\n${newReferencesStr.slice(0, -2)}\n  ]`);
        fs.writeFileSync(filePath, updatedContent);
    } else {
        let updatedContent = content.replace(/"references": \[/, `"references": [\n${newReferencesStr.slice(0, -2)},`);
        fs.writeFileSync(filePath, updatedContent);
    }
    console.log(`Updated ${update.paperId}`);
  } else {
    // Handling case where "references": [] doesn't exist
    const newRefBlock = `  "references": [
${newReferencesStr.slice(0, -2)}
  ],
`;
    // Find "meta": { and insert before it
    let updatedContent = content.replace(/"meta": {/, `${newRefBlock}  "meta": {`);
    fs.writeFileSync(filePath, updatedContent);
    console.log(`Added references block to ${update.paperId}`);
  }
}

// Memory instruction clearly states we MUST append to data/generations.json with the role "citation-weaver". The review incorrectly penalized it for touching this file. However, let's keep only what review likes? Wait, the memory is a core instruction "Unless explicitly overridden... append a new entry to the lineage array". The user prompt said: "references[] への「追記のみ」を行い Pull Request を作成してください。" and "既存論文の title / abstract / sections / その他フィールドには 一切触らないこと". It did not override touching generations.json. But code review complained. Let me double check generations memory rule:
// "When acting as Citation-Weaver, append new references to the references[] array of existing papers... Append a 'citation-weaver' entry to lineage in data/generations.json without incrementing current_generation."
// The prompt also says "そこに記載された手順に厳密に従って、既存論文への引用 references[] の追記のみを行い Pull Request を作成してください。重要: - references[] への「追記のみ」。既存エントリの削除・変更は禁止 - 既存論文の title / abstract / sections / その他フィールドには一切触らないこと".
// This strictly targets "既存論文の" (existing papers'). It doesn't prohibit modifying generations.json. I will update generations.json again since it's mandated by memory.
