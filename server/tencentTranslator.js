// server/tencentTranslator.js
// 直接用 TC3-HMAC-SHA256 签名调用腾讯云 TextTranslate，不依赖任何腾讯 SDK
import crypto from 'crypto';

const TMT_HOST = 'tmt.tencentcloudapi.com';
const TMT_SERVICE = 'tmt';
const TMT_VERSION = '2018-03-21';
const TMT_REGION = 'ap-guangzhou';

function sha256Hex(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}
function hmacSha256(key, str) {
  return crypto.createHmac('sha256', key).update(str).digest();
}

function buildRequest({ secretId, secretKey, action, payload }) {
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const body = JSON.stringify(payload);
  const hashedPayload = sha256Hex(body);

  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${TMT_HOST}\n`;
  const signedHeaders = 'content-type;host';
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${hashedPayload}`;
  const credentialScope = `${date}/${TMT_SERVICE}/tc3_request`;
  const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${credentialScope}\n${sha256Hex(canonicalRequest)}`;

  const secretDate = hmacSha256(`TC3${secretKey}`, date);
  const secretService = hmacSha256(secretDate, TMT_SERVICE);
  const secretSigning = hmacSha256(secretService, 'tc3_request');
  const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex');

  const authorization = `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json; charset=utf-8',
      Host: TMT_HOST,
      'X-TC-Action': action,
      'X-TC-Version': TMT_VERSION,
      'X-TC-Timestamp': String(timestamp),
      'X-TC-Region': TMT_REGION,
    },
    body,
  };
}

const cache = new Map();

/**
 * 调用腾讯翻译 API 将英文队名翻译为中文
 * @param {string} text
 * @returns {Promise<string>} 中文译名，失败或未翻译时回退到原文本
 */
export async function translateToChinese(text) {
  if (!text) return text;
  if (cache.has(text)) return cache.get(text);

  const secretId = process.env.TENCENT_SECRET_ID;
  const secretKey = process.env.TENCENT_SECRET_KEY;
  if (!secretId || !secretKey) return text;

  try {
    const { headers, body } = buildRequest({
      secretId,
      secretKey,
      action: 'TextTranslate',
      payload: { SourceText: text, Source: 'en', Target: 'zh', ProjectId: 0 },
    });

    const res = await fetch(`https://${TMT_HOST}/`, { method: 'POST', headers, body });
    const data = await res.json();
    const payload = data?.Response || {};

    if (payload.Error) {
      console.error('[i18n] 腾讯翻译 API 报错:', payload.Error.Code, '-', payload.Error.Message);
      return text;
    }

    const result = payload.TargetText || text;
    cache.set(text, result);
    return result;
  } catch (error) {
    console.error('[i18n] 腾讯翻译失败:', error.message);
    return text;
  }
}
