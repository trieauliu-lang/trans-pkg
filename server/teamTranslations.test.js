import assert from 'node:assert/strict';
import test from 'node:test';
import { getKnownTeamTranslations, translateKnownTeamName } from './teamTranslations.js';

test('uses standard Chinese club names for known teams', () => {
  assert.equal(translateKnownTeamName('Manchester United'), '曼联');
  assert.equal(translateKnownTeamName('Hapoel Kfar Saba'), '哈普尔卡法萨巴');
  assert.equal(translateKnownTeamName('  FC Copenhagen  '), '哥本哈根');
  assert.equal(translateKnownTeamName('Beşiktaş U21'), '贝西克塔斯U21');
  assert.equal(translateKnownTeamName('Atletico-Mineiro'), '米内罗竞技');
});

test('keeps names that are already Chinese', () => {
  assert.equal(translateKnownTeamName('上海海港'), '上海海港');
});

test('returns an empty value when a name still needs automatic translation', () => {
  assert.equal(translateKnownTeamName('A Previously Unknown Club'), '');
});

test('exposes known names for Chinese search before fixtures are visible', () => {
  const translations = getKnownTeamTranslations();
  assert.equal(translations['FC Copenhagen'], '哥本哈根');
  assert.equal(translations['AC Horsens'], '霍森斯');
});
