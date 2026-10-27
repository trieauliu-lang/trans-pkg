import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readScript(name) {
  return fs.readFileSync(path.join(rootDir, name), 'utf8');
}

test('Windows launchers start the hidden background supervisor', () => {
  for (const name of ['ONE-CLICK-INSTALL.bat', 'start-windows.bat']) {
    const launcher = readScript(name);
    assert.match(launcher, /powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0START-BACKGROUND\.ps1"/);
    assert.doesNotMatch(launcher, /RUN-SERVICE\.bat|start "比分提醒服务" \/min/);
  }
});

test('Windows service supervisor is hidden and restarts Node after an exit', () => {
  const launcher = readScript('RUN-SERVICE.ps1');
  assert.match(launcher, /Start-Process/);
  assert.match(launcher, /-WindowStyle Hidden/);
  assert.match(launcher, /--env-file-if-exists=\.env/);
  assert.match(launcher, /server\\index\.js/);
  assert.match(launcher, /Start-Sleep -Seconds 5/);
  assert.match(launcher, /service\.pid/);
  assert.match(launcher, /node\.pid/);
});

test('Windows stop script only stops recorded service processes', () => {
  const stopper = readScript('STOP-BACKGROUND.ps1');
  assert.match(stopper, /Get-Process -Id \$recordedId/);
  assert.match(stopper, /Stop-Process -Id \$recordedId/);
  assert.doesNotMatch(stopper, /Get-Process\s+(node|powershell)|taskkill/);
});

test('Windows PowerShell 5.1 scripts include a UTF-8 BOM', () => {
  for (const name of ['RUN-SERVICE.ps1', 'START-BACKGROUND.ps1', 'STOP-BACKGROUND.ps1']) {
    const source = fs.readFileSync(path.join(rootDir, name));
    assert.deepEqual([...source.subarray(0, 3)], [0xef, 0xbb, 0xbf], `${name} must start with a UTF-8 BOM`);
  }
});

test('Windows batch files keep CRLF line endings', () => {
  for (const name of ['ONE-CLICK-INSTALL.bat', 'STOP-SERVICE.bat', 'start-windows.bat', 'install-windows.bat']) {
    const source = readScript(name);
    assert.equal(source.replace(/\r\n/g, '').includes('\n'), false, `${name} must use CRLF`);
  }
});
