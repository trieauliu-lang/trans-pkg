import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readBatch(name) {
  return fs.readFileSync(path.join(rootDir, name), 'utf8');
}

test('Windows one-click installer launches the supervised service', () => {
  const installer = readBatch('ONE-CLICK-INSTALL.bat');
  assert.match(installer, /start "比分提醒服务" \/min cmd \/c call RUN-SERVICE\.bat/);
  assert.doesNotMatch(installer, /cd \/d ""%CD%""|\^&\^& node/);
});

test('Windows service launcher restarts the Node process after an exit', () => {
  const launcher = readBatch('RUN-SERVICE.bat');
  assert.match(launcher, /node --env-file-if-exists=\.env server\\index\.js --production/);
  assert.match(launcher, /timeout \/t 5 \/nobreak >nul/);
  assert.match(launcher, /goto run/);
});

test('Windows batch files keep CRLF line endings', () => {
  for (const name of ['ONE-CLICK-INSTALL.bat', 'RUN-SERVICE.bat', 'start-windows.bat', 'install-windows.bat']) {
    const source = readBatch(name);
    assert.equal(source.replace(/\r\n/g, '').includes('\n'), false, `${name} must use CRLF`);
  }
});
