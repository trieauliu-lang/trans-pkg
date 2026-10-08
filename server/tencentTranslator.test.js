import test from 'node:test';
import assert from 'node:assert/strict';

test('Tencent translation requests are deduplicated and stay below the provider rate limit', async () => {
  const originalFetch = global.fetch;
  const originalSecretId = process.env.TENCENT_SECRET_ID;
  const originalSecretKey = process.env.TENCENT_SECRET_KEY;
  const requestTimes = [];
  let requestCount = 0;

  process.env.TENCENT_SECRET_ID = 'test-secret-id';
  process.env.TENCENT_SECRET_KEY = 'test-secret-key';
  global.fetch = async (_url, options) => {
    requestTimes.push(Date.now());
    requestCount += 1;
    const source = JSON.parse(options.body).SourceText;
    return { json: async () => ({ Response: { TargetText: `中文-${source}` } }) };
  };

  try {
    const { translateToChinese } = await import(`./tencentTranslator.js?test=${Date.now()}`);
    const results = await Promise.all([
      translateToChinese('Club A'),
      translateToChinese('Club A'),
      translateToChinese('Club B'),
      translateToChinese('Club C'),
    ]);

    assert.deepEqual(results, ['中文-Club A', '中文-Club A', '中文-Club B', '中文-Club C']);
    assert.equal(requestCount, 3);
    assert.ok(requestTimes[1] - requestTimes[0] >= 250);
    assert.ok(requestTimes[2] - requestTimes[1] >= 250);
  } finally {
    global.fetch = originalFetch;
    if (originalSecretId == null) delete process.env.TENCENT_SECRET_ID;
    else process.env.TENCENT_SECRET_ID = originalSecretId;
    if (originalSecretKey == null) delete process.env.TENCENT_SECRET_KEY;
    else process.env.TENCENT_SECRET_KEY = originalSecretKey;
  }
});
