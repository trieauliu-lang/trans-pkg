// apply-cache-fix.cjs
const fs = require('fs');
const path = require('path');

const APP_PATH = path.join(__dirname, 'src', 'App.jsx');

if (!fs.existsSync(APP_PATH)) {
    console.error('❌ 找不到 src/App.jsx，请在项目根目录运行本脚本');
    process.exit(1);
}

const original = fs.readFileSync(APP_PATH, 'utf8');
let content = original;

// ---------- 按精确片段替换 ----------
function replaceOnce(needle, replacement, label) {
    const first = content.indexOf(needle);
    if (first === -1) throw new Error(`未找到目标片段：${label}`);
    if (content.indexOf(needle, first + 1) !== -1) throw new Error(`目标片段出现多次：${label}`);
    content = content.slice(0, first) + replacement + content.slice(first + needle.length);
}

// ---------- 按行定位，在某行之后插入 ----------
function insertAfterLine(lineMatcher, linesToInsert, label, { requireUnique = true } = {}) {
    const lines = content.split('\n');
    const hits = [];
    lines.forEach((line, idx) => {
        if (lineMatcher(line)) hits.push(idx);
    });
    if (hits.length === 0) throw new Error(`未找到目标行：${label}`);
    if (requireUnique && hits.length > 1) throw new Error(`目标行出现多次：${label}（${hits.length} 处）`);
    // 从后往前插，避免索引错位
    for (let i = hits.length - 1; i >= 0; i--) {
        lines.splice(hits[i] + 1, 0, ...linesToInsert);
    }
    content = lines.join('\n');
}

// ---------- 按行定位，把某行替换为多行 ----------
function replaceLine(lineMatcher, newLines, label, { requireUnique = true } = {}) {
    const lines = content.split('\n');
    const hits = [];
    lines.forEach((line, idx) => {
        if (lineMatcher(line)) hits.push(idx);
    });
    if (hits.length === 0) throw new Error(`未找到目标行：${label}`);
    if (requireUnique && hits.length > 1) throw new Error(`目标行出现多次：${label}（${hits.length} 处）`);
    for (let i = hits.length - 1; i >= 0; i--) {
        lines.splice(hits[i], 1, ...newLines);
    }
    content = lines.join('\n');
}

// ---------- 在某函数体内、某行之后插入（限定范围） ----------
function insertInsideFunction(funcStartMatcher, funcEndMatcher, anchorLineMatcher, linesToInsert, label) {
    const lines = content.split('\n');
    const startIdx = lines.findIndex(funcStartMatcher);
    if (startIdx === -1) throw new Error(`未找到函数起点：${label}`);
    const endIdx = lines.findIndex((line, idx) => idx > startIdx && funcEndMatcher(line));
    if (endIdx === -1) throw new Error(`未找到函数终点：${label}`);
    const anchorIdx = lines.findIndex((line, idx) => idx > startIdx && idx < endIdx && anchorLineMatcher(line));
    if (anchorIdx === -1) throw new Error(`未找到插入锚点：${label}`);
    lines.splice(anchorIdx + 1, 0, ...linesToInsert);
    content = lines.join('\n');
}

try {
    // ===== 1. fixtures 初始化 =====
    replaceOnce(
        'const [fixtures, setFixtures] = useState([]);',
        `const [fixtures, setFixtures] = useState(() => {
    try {
      const saved = localStorage.getItem('matchPulse:fixtures');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });`,
        'fixtures 初始化'
    );

    // ===== 2. fixtureMeta 初始化 =====
    replaceOnce(
        'const [fixtureMeta, setFixtureMeta] = useState({ cache: null, quota: null });',
        `const [fixtureMeta, setFixtureMeta] = useState(() => {
    try {
      const saved = localStorage.getItem('matchPulse:fixtureMeta');
      return saved ? JSON.parse(saved) : { cache: null, quota: null };
    } catch {
      return { cache: null, quota: null };
    }
  });`,
        'fixtureMeta 初始化'
    );

    // ===== 3. hasQueriedFixtures 初始化 =====
    replaceOnce(
        'const [hasQueriedFixtures, setHasQueriedFixtures] = useState(false);',
        `const [hasQueriedFixtures, setHasQueriedFixtures] = useState(() => {
    return localStorage.getItem('matchPulse:hasQueried') === '1';
  });`,
        'hasQueriedFixtures 初始化'
    );

    // ===== 4. loadFixtures 成功后写入 localStorage =====
    // 锚点：函数体内第一处 setHasQueriedFixtures(true); 这一行
    insertInsideFunction(
        (line) => line.includes('async function loadFixtures('),
        (line) => /^\s{2}\}\s*$/.test(line),   // 函数体的结束大括号（2 空格缩进）
        (line) => line.trim() === 'setHasQueriedFixtures(true);',
        [
            "      localStorage.setItem('matchPulse:fixtures', JSON.stringify(body.fixtures));",
            "      localStorage.setItem('matchPulse:fixtureMeta', JSON.stringify({ cache: body.cache || null, quota: body.quota || null }));",
            "      localStorage.setItem('matchPulse:hasQueried', '1');",
        ],
        'loadFixtures 保存缓存'
    );

    // ===== 5. chooseDate 清空缓存 =====
    insertInsideFunction(
        (line) => line.includes('function chooseDate('),
        (line) => /^\s{2}\}\s*$/.test(line),
        (line) => line.trim() === 'setHasQueriedFixtures(false);',
        [
            "    localStorage.removeItem('matchPulse:fixtures');",
            "    localStorage.removeItem('matchPulse:fixtureMeta');",
            "    localStorage.setItem('matchPulse:hasQueried', '0');",
        ],
        'chooseDate 清空缓存'
    );

    // ===== 6. acceptApiKeyState 清空缓存 =====
    insertInsideFunction(
        (line) => line.includes('function acceptApiKeyState('),
        (line) => /^\s{2}\}\s*$/.test(line),
        (line) => line.trim() === 'setHasQueriedFixtures(false);',
        [
            "    localStorage.removeItem('matchPulse:fixtures');",
            "    localStorage.removeItem('matchPulse:fixtureMeta');",
            "    localStorage.setItem('matchPulse:hasQueried', '0');",
        ],
        'acceptApiKeyState 清空缓存'
    );

    // 确保每个函数内只改一次（幂等校验）
    const checks = [
        ["localStorage.setItem('matchPulse:fixtures'", 1],
        ["localStorage.removeItem('matchPulse:fixtures'", 2],
    ];
    for (const [needle, expected] of checks) {
        const count = content.split(needle).length - 1;
        if (count !== expected) {
            throw new Error(`幂等校验失败：'${needle}' 出现 ${count} 次，预期 ${expected} 次`);
        }
    }

    fs.writeFileSync(APP_PATH + '.bak', original, 'utf8');
    fs.writeFileSync(APP_PATH, content, 'utf8');
    console.log('✅ 6 处修改完成');
    console.log('📦 原文件已备份：src/App.jsx.bak');
} catch (err) {
    console.error('❌ 修改失败：', err.message);
    console.error('   文件未做任何修改。');
    process.exit(1);
}