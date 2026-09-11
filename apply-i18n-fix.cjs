// apply-i18n-fix.cjs
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = __dirname;
const SERVER_PATH = path.join(ROOT, 'server', 'index.js');
const APP_PATH = path.join(ROOT, 'src', 'App.jsx');

if (!fs.existsSync(SERVER_PATH)) { console.error('❌ 找不到 server/index.js'); process.exit(1); }
if (!fs.existsSync(APP_PATH)) { console.error('❌ 找不到 src/App.jsx'); process.exit(1); }

// ---------- 读取文件，统一按 LF 处理，保存时保持原换行风格 ----------
function readNormalized(p) {
    const raw = fs.readFileSync(p, 'utf8');
    const hasCRLF = raw.includes('\r\n');
    return { content: raw.replace(/\r\n/g, '\n'), hasCRLF };
}
function writeNormalized(p, content, hasCRLF) {
    fs.writeFileSync(p, hasCRLF ? content.replace(/\n/g, '\r\n') : content, 'utf8');
}

// ---------- 1. 探测包导出结构 ----------
console.log('==> 探测 football-team-names-zh 导出结构');
let probeInfo = '';
try {
    const probe = execSync(
        `node -e "const m=require('football-team-names-zh'); console.log(Object.keys(m).join(',')); console.log(typeof (m.normalizeTeam||m.default));"`,
        { cwd: ROOT, encoding: 'utf8' }
    );
    probeInfo = probe.trim();
    console.log(probeInfo);
} catch (e) {
    console.error('❌ 探测失败：', e.message);
    console.error('   （不阻断，继续尝试修改）');
}

// ---------- 2. 修改 server/index.js ----------
console.log('\n==> 修改 server/index.js');
{
    const { content: original, hasCRLF } = readNormalized(SERVER_PATH);
    let content = original;
    let serverOk = false;

    try {
        const lines = content.split('\n');

        // 2.1 在最后一个 require 行之后插入辅助函数
        let lastRequireIdx = -1;
        for (let i = 0; i < Math.min(lines.length, 60); i++) {
            if (/require\(/.test(lines[i]) && /^\s*(const|let|var|import)\s/.test(lines[i])) {
                lastRequireIdx = i;
            }
        }
        if (lastRequireIdx === -1) throw new Error('未找到 require 锚点');

        // 检查是否已经注入过
        const alreadyInjected = content.includes('getTeamChineseName');
        if (!alreadyInjected) {
            const injection = [
                '',
                '// ===== football-team-names-zh 队名归一化 =====',
                "const teamNamePkg = require('football-team-names-zh');",
                'const normalizeTeam =',
                "  teamNamePkg.normalizeTeam || teamNamePkg.default || (() => null);",
                '',
                'function getTeamChineseName(team) {',
                "  if (!team || !team.name) return '';",
                '  try {',
                '    const normalized = normalizeTeam(team.name);',
                '    return (normalized && (normalized.zh_name || normalized.zhName || normalized.zh)) || team.name;',
                '  } catch {',
                '    return team.name;',
                '  }',
                '}',
            ];
            lines.splice(lastRequireIdx + 1, 0, ...injection);
            content = lines.join('\n');
        } else {
            console.log('    辅助函数已存在，跳过注入');
        }

        // 2.2 替换 fixtures: result.data, 并插入 enrichedFixtures 定义
        const newLines = content.split('\n');
        const targetIdx = newLines.findIndex(l => /fixtures:\s*result\.data,/.test(l));
        if (targetIdx === -1) throw new Error('未找到 fixtures: result.data 行');

        // 往上找最近的 response.json({
        let respIdx = -1;
        for (let i = targetIdx - 1; i >= 0 && i >= targetIdx - 5; i--) {
            if (/response\.json\(\{/.test(newLines[i])) { respIdx = i; break; }
        }
        if (respIdx === -1) throw new Error('未找到 response.json({ 锚点');

        // 插入 enrichedFixtures 定义（放在 response.json({ 之前）
        const block = [
            '    const enrichedFixtures = result.data.map((fixture) => ({',
            '      ...fixture,',
            '      teams: {',
            '        ...fixture.teams,',
            '        home: { ...fixture.teams.home, zhName: getTeamChineseName(fixture.teams.home) },',
            '        away: { ...fixture.teams.away, zhName: getTeamChineseName(fixture.teams.away) },',
            '      },',
            '    }));',
        ];
        if (!content.includes('enrichedFixtures')) {
            newLines.splice(respIdx, 0, ...block);
        }

        // 替换 fixtures: result.data → fixtures: enrichedFixtures
        const finalLines = newLines.map(l =>
            /fixtures:\s*result\.data,/.test(l) ? l.replace(/fixtures:\s*result\.data,/, 'fixtures: enrichedFixtures,') : l
        );
        content = finalLines.join('\n');

        fs.writeFileSync(SERVER_PATH + '.bak', original, 'utf8');
        writeNormalized(SERVER_PATH, content, hasCRLF);
        console.log('    ✅ server/index.js 已修改');
        serverOk = true;
    } catch (e) {
        console.error('❌ server/index.js 修改失败：', e.message);
        console.error('   文件未改');
    }
}

// ---------- 3. 修改 src/App.jsx ----------
console.log('\n==> 修改 src/App.jsx');
{
    const { content: original, hasCRLF } = readNormalized(APP_PATH);
    let content = original;

    try {
        const lines = content.split('\n');
        const homeIdx = lines.findIndex(l => /const homeName = translations\[homeOriginal\] \|\| homeOriginal;/.test(l));
        const awayIdx = lines.findIndex(l => /const awayName = translations\[awayOriginal\] \|\| awayOriginal;/.test(l));
        if (homeIdx === -1) throw new Error('未找到 homeName 定义行');
        if (awayIdx === -1) throw new Error('未找到 awayName 定义行');

        // 保留原缩进
        const indentHome = lines[homeIdx].match(/^\s*/)[0];
        const indentAway = lines[awayIdx].match(/^\s*/)[0];

        lines[homeIdx] = `${indentHome}const homeName = fixture.teams.home.zhName || translations[homeOriginal] || homeOriginal;`;
        lines[awayIdx] = `${indentAway}const awayName = fixture.teams.away.zhName || translations[awayOriginal] || awayOriginal;`;

        content = lines.join('\n');

        fs.writeFileSync(APP_PATH + '.bak2', original, 'utf8');
        writeNormalized(APP_PATH, content, hasCRLF);
        console.log('    ✅ src/App.jsx 已修改');
    } catch (e) {
        console.error('❌ src/App.jsx 修改失败：', e.message);
        console.error('   文件未改');
    }
}

console.log('\n===== 完成 =====');
console.log('备份：server/index.js.bak  src/App.jsx.bak2');
console.log('\n下一步：npm run build');