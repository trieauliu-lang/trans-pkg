// server/tencentTranslator.js
import tencentcloud from 'tencentcloud-sdk-nodejs-tmt';

const TmtClient = tencentcloud.tmt.v20180321.Client;

let client = null;
function getClient() {
  if (client) return client;
  const secretId = process.env.TENCENT_SECRET_ID;
  const secretKey = process.env.TENCENT_SECRET_KEY;
  if (!secretId || !secretKey) return null;
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
    console.warn('[i18n] 未配置 TENCENT_SECRET_ID / TENCENT_SECRET_KEY，跳过翻译');
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
