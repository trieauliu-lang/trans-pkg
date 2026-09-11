// server/tencentTranslator.js
// 用 createRequire 加载 CJS 包，避免 ESM 默认导入拿到错误的构造
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

let TmtClient = null;
try {
  const tencentcloud = require('tencentcloud-sdk-nodejs-tmt');
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

/**
 * 调用腾讯翻译 API 将英文队名翻译为中文
 * @param {string} text
 * @returns {Promise<string>} 中文译名，失败时回退到原文本
 */
export async function translateToChinese(text) {
  if (!text) return text;
  if (cache.has(text)) return cache.get(text);

  const c = getClient();
  if (!c) {
    return text;
  }

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
