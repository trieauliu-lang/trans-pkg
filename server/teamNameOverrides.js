// server/teamNameOverrides.js
// 自定义队名覆盖表，优先级最高。
// 键：API 返回的英文原名（与 fixture.teams.home.name 完全一致）
// 值：规范中文译名
// 说明：腾讯翻译对单个专有名词（如 Botafogo）会原样返回，需要在这里补充。

export const TEAM_NAME_OVERRIDES = {
  // 巴西
  'Botafogo': '博塔弗戈',
  'Fluminense': '弗鲁米嫩塞',
  'Palmeiras': '帕尔梅拉斯',
  'Corinthians': '科林蒂安',
  'Santos': '桑托斯',
  'Gremio': '格雷米奥',
  'Internacional': '巴西国际',
  'Cruzeiro': '克鲁塞罗',
  'Atletico Mineiro': '米内罗竞技',
  'Vasco da Gama': '瓦斯科达伽马',

  // 阿根廷
  'Boca Juniors': '博卡青年',
  'River Plate': '河床',
  'Racing Club': '竞技俱乐部',
  'Independiente': '独立队',
  'San Lorenzo': '圣洛伦索',

  // 南美其它
  'Colo-Colo': '科洛科洛',
  'Penarol': '佩纳罗尔',
  'Nacional': '民族队',
  'Atletico Nacional': '国民竞技',
  'Millonarios': '百万富翁',
  'LDU Quito': '基多大学',
  'Barcelona SC': '巴塞罗那SC',
  'Emelec': '埃梅莱克',

  // 亚洲
  'Persija Jakarta': '佩西加雅加达',
  'Bali United': '巴厘联',
  'Buriram United': '武里南联',
  'Muangthong United': '蒙通联',
  'BG Pathum United': '巴吞联',
  'Johor Darul Ta'zim': '柔佛DT',
  'Kawasaki Frontale': '川崎前锋',
  'Urawa Red Diamonds': '浦和红钻',
  'Yokohama F. Marinos': '横滨水手',
  'Vissel Kobe': '神户胜利船',
  'Ulsan Hyundai': '蔚山现代',
  'Jeonbuk Hyundai Motors': '全北现代',
  'Al Hilal': '利雅得新月',
  'Al Nassr': '利雅得胜利',
  'Al Ittihad': '吉达联合',
  'Al Ahli': '吉达国民',
};

// 反向映射：中文 → 英文（辅助用）
export const TEAM_NAME_ZH_TO_EN = Object.fromEntries(
  Object.entries(TEAM_NAME_OVERRIDES).map(([en, zh]) => [zh, en])
);
