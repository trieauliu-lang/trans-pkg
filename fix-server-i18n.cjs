// fix-server-i18n.cjs
const fs = require('fs');
const path = require('path');

const SERVER_PATH = path.join(__dirname, 'server', 'index.js');

if (!fs.existsSync(SERVER_PATH)) { console.error('❌ 找不到 server/index.js'); process.exit(1); }

function readNormalized(p) {
    const raw = fs.readFileSync(p, 'utf8');
    const hasCRLF = raw.includes('\r\n');
    return { content: raw.replace(/\r\n/g, '\n'), hasCRLF };
}
function writeNormalized(p, content, hasCRLF) {
    fs.writeFileSync(p, hasCRLF ? content.replace(/\n/g, '\r\n') : content, 'utf8');
}

const { content: original, hasCRLF } = readNormalized(SERVER_PATH);
let content = original;

try {
    const lines = content.split('\n');

    // 1. 判断模块类型
    let useImport = false;
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
        useImport = pkg.type === 'module';
    } catch {}
    console.log('==> 模块类型：', useImport ? 'ESM (import)' : 'CJS (require)');

    // 2. 找到最后一个顶部 import / require 行
    let lastImportIdx = -1;
    for (let i = 0; i < Math.min(lines.length, 80); i++) {
        const line = lines[i];
        if (/^\s*import\s/.test(line) || /^\s*(const|let|var)\s+.*=\s*require\(/.test(line)) {
            lastImportIdx = i;
        }
    }
    if (lastImportIdx === -1) throw new Error('未找到顶部 import/require 锚点');
    console.log('==> 锚点：第 ' + (lastImportIdx + 1) + ' 行', lines[lastImportIdx].trim());

    const injection = useImport
        ? [
            '',
            '// ===== football-team-names-zh 队名归一化 =====',
            "import * as teamNamePkg from 'football-team-names-zh';",
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
        ]
        : [
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

    if (!content.includes('getTeamChineseName')) {
        lines.splice(lastImportIdx + 1, 0, ...injection);
        content = lines.join('\n');
        console.log('    ✅ 注入辅助函数');
    } else {
        console.log('    辅助函数已存在，跳过');
    }

    // 3. 修改 /api/fixtures
    const newLines = content.split('\n');
    const targetIdx = newLines.findIndex(l => /fixtures:\s*result\.data,/.test(l));
    if (targetIdx === -1) throw new Error('未找到 fixtures: result.data 行');
    console.log('==> 找到 fixtures 行：第 ' + (targetIdx + 1) + ' 行');

    let respIdx = -1;
    for (let i = targetIdx - 1; i >= 0 && i >= targetIdx - 6; i--) {
        if (/response\.json\(\{/.test(newLines[i])) { respIdx = i; break; }
    }
    if (respIdx === -1) throw new Error('未找到 response.json({ 锚点');

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
        console.log('    ✅ 插入 enrichedFixtures 定义');
    } else {
        console.log('    enrichedFixtures 已存在，跳过');
    }

    const finalLines = newLines.map(l =>
        /fixtures:\s*result\.data,/.test(l) ? l.replace(/fixtures:\s*result\.data,/, 'fixtures: enrichedFixtures,') : l
    );
    content = finalLines.join('\n');

    fs.writeFileSync(SERVER_PATH + '.bak', original, 'utf8');
    writeNormalized(SERVER_PATH, content, hasCRLF);
    console.log('    ✅ server/index.js 已修改');
    console.log('    备份：server/index.js.bak');
} catch (e) {
    console.error('❌ 失败：', e.message);
    console.error('   文件未改');
    process.exit(1);
}