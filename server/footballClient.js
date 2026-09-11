import { EnvHttpProxyAgent, fetch } from 'undici';

export class FootballError extends Error {
  constructor(code, message, retryAfterMs = 0) {
    super(message);
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}

export function networkError(error) {
  if (error instanceof FootballError) return error;
  const codes = [error?.name, error?.code, error?.cause?.code,
    ...(error?.cause?.errors || []).map((item) => item.code)];
  if (codes.some((code) => ['TimeoutError', 'AbortError', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'ETIMEDOUT'].includes(code))) {
    return new FootballError('TIMEOUT', '连接比分服务超时，请检查服务器网络或代理设置。');
  }
  if (codes.some((code) => ['ENOTFOUND', 'EAI_AGAIN'].includes(code))) {
    return new FootballError('DNS', '无法解析比分服务域名，请检查服务器 DNS 或代理设置。');
  }
  if (codes.some((code) => /CERT|TLS|SSL/.test(code || ''))) {
    return new FootballError('TLS', '比分服务的安全连接验证失败，请检查系统时间与证书配置。');
  }
  return new FootballError('NETWORK', '无法连接比分服务，请检查运行 Node 服务的网络及 HTTPS_PROXY 配置。');
}

export function retryDelay(intervalMinutes, failures, retryAfterMs = 0) {
  return Math.max(intervalMinutes * 60_000,
    Math.min(30 * 60_000, 3 * 60_000 * 2 ** Math.min(Math.max(failures - 1, 0), 4)),
    retryAfterMs);
}

export function createFootballClient({ apiKey, timeoutMs = 15_000, fetchImpl = fetch, dispatcher } = {}) {
  // One agent per client; respects HTTPS_PROXY, HTTP_PROXY and NO_PROXY.
  const agent = dispatcher ?? new EnvHttpProxyAgent();
  return async function footballRequest(endpoint, params = {}) {
    if (!apiKey || apiKey === 'replace_with_your_api_key') {
      throw new FootballError('CONFIG', '请在 .env 中填写有效的 API_FOOTBALL_KEY 并重启服务。');
    }
    const url = new URL(`https://v3.football.api-sports.io/${endpoint}`);
    Object.entries(params).forEach(([key, value]) => value !== undefined && value !== '' && url.searchParams.set(key, value));
    try {
      const response = await fetchImpl(url, {
        headers: { 'x-apisports-key': apiKey }, dispatcher: agent,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if ([401, 403].includes(response.status)) {
        await response.body?.cancel();
        throw new FootballError('AUTH', '比分服务拒绝访问，请检查 API Key、订阅权限及账号状态。');
      }
      if (response.status === 429) {
        const value = response.headers.get('retry-after');
        const delay = value ? (Number.isFinite(Number(value)) ? Number(value) * 1000 : Date.parse(value) - Date.now()) : 0;
        await response.body?.cancel();
        throw new FootballError('RATE_LIMIT', '比分服务请求额度或频率已达限制，请检查配额，系统将延后重试。', Math.max(0, delay || 0));
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new FootballError('UPSTREAM', `比分服务暂时不可用（HTTP ${response.status}），稍后自动重试。`);
      }
      let body;
      try { body = await response.json(); } catch (error) {
        if (error instanceof SyntaxError) throw new FootballError('INVALID_RESPONSE', '比分服务返回了无效数据，稍后自动重试。');
        throw error;
      }
      if (!body || Object.keys(body.errors || {}).length) {
        // Do not echo arbitrary upstream content, which may contain credentials.
        throw new FootballError('API_ERROR', '比分服务返回错误，请检查 API Key、套餐权限、请求参数及剩余配额。');
      }
      if (!Array.isArray(body.response)) throw new FootballError('INVALID_RESPONSE', '比分服务返回的数据格式不正确，稍后自动重试。');
      return { data: body.response, quota: {
        remaining: response.headers.get('x-ratelimit-requests-remaining'),
        limit: response.headers.get('x-ratelimit-requests-limit'),
      } };
    } catch (error) { throw networkError(error); }
  };
}
