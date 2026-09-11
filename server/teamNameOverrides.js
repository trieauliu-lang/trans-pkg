// server/teamNameOverrides.js
// 自定义队名覆盖表，优先级最高。
// 键：API 返回的英文原名（与 fixture.teams.home.name 完全一致）
// 值：规范中文译名
// 说明：腾讯翻译对单个专有名词（如 Botafogo）会原样返回，需要在这里补充。
// 注意：键里若含单引号，必须用双引号包裹，例如 "Johor Darul Ta'zim"。

export const TEAM_NAME_OVERRIDES = {
  // ===== 巴西 =====
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
  'Red Bull Bragantino': '红牛布拉甘蒂诺',
  'Bahia': '巴伊亚',
  'Fortaleza': '福塔莱萨',
  'Athletico Paranaense': '巴拉纳竞技',

  // ===== 阿根廷 =====
  'Boca Juniors': '博卡青年',
  'River Plate': '河床',
  'Racing Club': '竞技俱乐部',
  'Independiente': '独立队',
  'San Lorenzo': '圣洛伦索',
  'Velez Sarsfield': '萨斯菲尔德',
  'Estudiantes': '拉普拉塔大学生',

  // ===== 南美其它 =====
  'Colo-Colo': '科洛科洛',
  'Penarol': '佩纳罗尔',
  'Nacional': '民族队',
  'Atletico Nacional': '国民竞技',
  'Millonarios': '百万富翁',
  'LDU Quito': '基多大学',
  'Barcelona SC': '巴塞罗那SC',
  'Emelec': '埃梅莱克',
  'Blooming': '布鲁明',
  'Bolivar': '玻利瓦尔',
  'The Strongest': '最强',

  // ===== 亚洲 =====
  'Persija Jakarta': '佩西加雅加达',
  'Bali United': '巴厘联',
  'Buriram United': '武里南联',
  'Muangthong United': '蒙通联',
  'BG Pathum United': '巴吞联',
  "Johor Darul Ta'zim": '柔佛DT',
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

  // ===== 美国 / 加拿大 =====
  'Orlando City SC': '奥兰多城',
  'Toronto FC': '多伦多FC',
  'New York Red Bulls': '纽约红牛',
  'Nashville SC': '纳什维尔',
  'Columbus Crew': '哥伦布机员',
  'DC United': '华盛顿联',
  'Atlanta United': '亚特兰大联',
  'FC Cincinnati': '辛辛那提FC',
  'Charlotte FC': '夏洛特FC',
  'Los Angeles Galaxy': '洛杉矶银河',
  'Los Angeles FC': '洛杉矶FC',
  'Inter Miami': '迈阿密国际',

  // ===== 墨西哥 =====
  'CD Toluca': '托卢卡',
  'Atlas FC': '阿特拉斯',
  'Club America': '美洲队',
  'Guadalajara': '瓜达拉哈拉',
  'Cruz Azul': '蓝十字',

  // ===== 哥伦比亚 =====
  'Boyaca Chico FC': '博亚卡奇科',
  'Independiente Medellin': '麦德林独立',
  'Atletico Junior': '巴兰基亚青年',

  // ===== 智利 / 厄瓜多尔 =====
  'Universidad de Chile': '智利大学',
  'Universidad Catolica': '天主教大学',

};

// 反向映射：中文 → 英文（辅助用）
export const TEAM_NAME_ZH_TO_EN = Object.fromEntries(
  Object.entries(TEAM_NAME_OVERRIDES).map(([en, zh]) => [zh, en])
);
