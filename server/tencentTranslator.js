// server/tencentTranslator.js
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

let TmtClient = null;
try {
  const tencentcloud = require('tencentcloud-sdk-nodejs');
  TmtClient = tencentcloud.tmt.v20180321.Client;
} catch (e) {
  console.error('[i18n] 加载腾讯云 SDK 失败:', e.message);
}

let client = null;
function getClient() {
  if (client) return client;
  const secretId = process.env.TENCENT_SECRET_ID;
  const secretKey = process.env.TENCENT_SECRET_KEY;
  if (!secretId || !secretKey || !TmtClient) return null;
  client = new TmtClient({
    credential: { secretId, secretKey },
    region: 'ap-guangzhou',
    profile: { httpProfile: { endpoint: 'tmt.tencentcloudapi.com' } },
  });
  return client;
}

const cache = new Map();

export async function translateToChinese(text) {
  if (!text) return text;
  if (cache.has(text)) return cache.get(text);

  const c = getClient();
  if (!c) return text;

  try {
    const data = await c.TextTranslate({
      SourceText: text,
      Source: 'en',
      Target: 'zh',
      ProjectId: 0,
    });
    const result = data.TargetText || text;
    cache.set(text, result);
    return result;
  } catch (error) {
    console.error('[i18n] 腾讯翻译失败:', error.message);
    return text;
  }
}
