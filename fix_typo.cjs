const fs = require('fs');
const path = 'data/papers/void-topology-semantic-decay-v2.json';
let content = fs.readFileSync(path, 'utf8');
content = content.replace('同同情', '同情');
fs.writeFileSync(path, content);
