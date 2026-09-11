// server/tencentTranslator.js
// 用 @tencent-sdk/capi 直接调用腾讯翻译 API，绕开 tencentcloud-sdk-nodejs 的方法缺失问题
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

let Capi = null;
let loadError = null;
try {
  const capiPkg = require('@tencent-sdk/capi');
  Capi = capiPkg.Capi || capiPkg.default || null;
  if (!Capi) {
    console.error('[i18n] @tencent-sdk/capi 未导出 Capi，导出 keys:', Object.keys(capiPkg || {}));
  }
} catch (e) {
  loadError = e;
  console.error('[i18n] 加载 @tencent-sdk/capi 失败:', e.message);
}

let client = null;
function getClient() {
  if (client) return client;
  const secretId = process.env.TENCENT_SECRET_ID;
  const secretKey = process.env.TENCENT_SECRET_KEY;
  if (!secretId || !secretKey || !Capi) return null;
  client = new Capi({
    Region: 'ap-guangzhou',
    SecretId: secretId,
    SecretKey: secretKey,
    ServiceType: 'tmt',
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
  if (!c) return text;

  try {
    const res = await c.request(
      {
        Action: 'TextTranslate',
        Version: '2018-03-21',
        SourceText: text,
        Source: 'en',
        Target: 'zh',
        ProjectId: 0,
      },
      {
        host: 'tmt.tencentcloudapi.com',
      }
    );
    const result = (res && (res.TargetText || res.targetText)) || text;
    cache.set(text, result);
    return result;
  } catch (error) {
    console.error('[i18n] 腾讯翻译失败:', error.message);
    return text;
  }
}
