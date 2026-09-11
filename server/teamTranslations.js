import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEAM_NAME_OVERRIDES as MANUAL_TEAM_NAME_OVERRIDES } from './teamNameOverrides.js';
import { translateToChinese } from './tencentTranslator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '../data');
const cacheFile = path.join(dataDir, 'team-translations.json');
const HAS_CHINESE = /[\u3400-\u9fff]/;

// Football names are proper nouns. Keep the common Chinese names here so a
// literal machine translation never replaces a well-known club name.
export const TEAM_NAME_OVERRIDES = Object.freeze({
  ...MANUAL_TEAM_NAME_OVERRIDES,
  'AC Horsens': '霍森斯',
  'Al Ahli Doha': '多哈国民',
  'Al Ain': '艾因',
  'Al Ain U23': '艾因U23',
  'Al Jazeera': '阿尔贾兹拉',
  'Al Jazira U23': '阿尔贾兹拉U23',
  'Al Nassr W': '利雅得胜利女足',
  'Al Nasr U23': '迪拜胜利U23',
  'Al Quwa Al Jawiya': '巴格达空军',
  'Al Riffa': '里法',
  'Al Sadd': '萨德',
  'Al Wasl U23': '迪拜祈祷U23',
  'Al Zawra\'a': '扎瓦拉',
  'Al-Ettifaq': '达曼协作',
  'Al-Dhafra': '迪哈夫拉',
  'Al-Gharafa': '加拉法',
  'Al-Rayyan SC': '赖扬',
  'Al-Sailiya': '赛利亚',
  'Al-Wasl FC': '迪拜祈祷',
  'Adelaide City': '阿德莱德城',
  'Ararat-Armenia': '阿拉拉特亚美尼亚',
  'AS Roma': '罗马',
  'Assyriska FF': '阿西里斯卡',
  'AZ Alkmaar': '阿尔克马尔',
  'Bahla': '巴赫拉',
  'Balestier Khalsa': '马里士他卡沙',
  'Banfield Res.': '班菲尔德预备队',
  'Baník Ostrava U19': '俄斯特拉发矿工U19',
  'Bangkok United': '曼谷联',
  'Baniyas SC': '巴尼亚斯',
  'Barranquilla': '巴兰基亚',
  'Beerschot Wilrijk': '比尔肖特',
  'Beşiktaş': '贝西克塔斯',
  'Beşiktaş U19': '贝西克塔斯U19',
  'BFC Dynamo': '柏林迪纳摩',
  'Bhayangkara FC': '巴杨卡拉',
  'Bhawanipore': '巴瓦尼普尔',
  'Bnei Yehuda': '特拉维夫叶胡达',
  'Bóng đá Huế': '顺化足球',
  'Bulle': '布勒',
  'Bulleen Lions': '布林雄狮',
  'Buriram United': '武里南联',
  'Cannes': '戛纳',
  'Cantolagua': '坎托拉瓜',
  'Cerro': '塞罗',
  'Chapecoense U20': '沙佩科恩斯U20',
  'Chernihiv': '切尔尼戈夫',
  'Chiangrai United': '清莱联',
  'China PR U20 W': '中国女足U20',
  'Colombia U20 W': '哥伦比亚女足U20',
  'Corinthians U17': '科林蒂安U17',
  'Cuiabá U20': '库亚巴U20',
  'Da Nang': '岘港',
  'Daejeon Korail': '大田地铁',
  'Deportivo Riestra Res.': '利斯特雷预备队',
  'Dewa United': '德瓦联',
  'Djurgardens IF': '尤尔加登',
  'Dong Thap': '同塔',
  'Elva': '埃尔瓦',
  'Ekibastuz': '埃基巴斯图兹',
  'Enköping': '恩雪平',
  'Erzurumspor FK': '埃尔祖鲁姆体育',
  'Erzurumspor U19': '埃尔祖鲁姆体育U19',
  'Esan Pattaya': '芭堤雅联',
  'Esporte de Patos U20': '帕托斯体育U20',
  'Essendon Royals SC': '埃森登皇家',
  'Estrela': '埃斯特雷拉',
  'Estudiantes La Plata Res': '拉普拉塔大学生预备队',
  'Falkenbergs FF': '法尔肯贝里',
  'Fanja': '芬贾',
  'FC Copenhagen': '哥本哈根',
  'FC Midtjylland': '中日德兰',
  'FC Iberia 1999 II': '伊比利亚1999二队',
  'FCI Levadia II': '利瓦迪亚二队',
  'Ferroviario U20': '费罗维亚里奥U20',
  'Fenerbahçe': '费内巴切',
  'Fortaleza U17': '福塔雷萨U17',
  'Gagra': '加格拉',
  'Garudayaksa': '加鲁达亚克萨',
  'GIF Sundsvall': '松兹瓦尔',
  'Gimnasia Mendoza 2': '门多萨体操二队',
  'Godoy Cruz Res.': '戈多伊克鲁斯预备队',
  'Haninge': '哈宁厄',
  'Hapoel Afula': '阿富拉夏普尔',
  'Hapoel Kfar Saba': '哈普尔卡法萨巴',
  'Hapoel Kfar Shalem': '卡法沙莱姆夏普尔',
  'Hapoel Ra\'anana': '拉阿纳纳夏普尔',
  'Hapoel Rishon LeZion': '里雄莱锡安夏普尔',
  'Heracles': '赫拉克勒斯',
  'Ho Chi Minh': '胡志明市',
  'Huarte': '瓦尔特',
  'Huracán Res.': '飓风预备队',
  'IFK Norrkoping': '北雪平',
  'IK brage': '布莱格',
  'Independiente Riva. Res.': '门多萨独立预备队',
  'Ironi Modi\'in': '莫迪因城',
  'Jong Utrecht': '乌德勒支青年队',
  'Johor Darul Takzim FC': '柔佛新山',
  'Karpaty': '喀尔巴阡',
  'Kashima': '鹿岛鹿角',
  'Kashiwa Reysol': '柏太阳神',
  'Khalidiya': '哈利迪亚',
  'Khorfakkan': '豪尔费坎',
  'Kifisia': '基菲夏',
  'Kiryat Yam SC': '基里亚特雅姆',
  'Kolos Kovalivka': '高华尤夫卡科洛斯',
  'Kyoto Sanga': '京都不死鸟',
  'Lamphun Warrior': '南奔勇士',
  'Lanús Res.': '拉努斯预备队',
  'Lierse Kempenzonen': '利尔斯',
  'Long An': '隆安',
  'Lusail City': '卢赛尔城',
  'Luton': '卢顿',
  'Luunja': '卢尼亚',
  'Maccabi Ahi Nazareth': '阿希拿撒勒马卡比',
  'Maccabi Bnei Raina': '麦卡比布内雷纳',
  'Maccabi Kabilio Jaffa': '卡比利奥雅法马卡比',
  'Maccabi Kiryat Gat': '马卡比基尔亚特加特',
  'Manama': '麦纳麦',
  'Manchester United': '曼联',
  'Melbourne Victory II': '墨尔本胜利二队',
  'Mohammedan': '穆罕默德体育',
  'Muharraq': '穆哈拉格',
  'NAC Breda': '布雷达',
  'Nam Dinh': '南定',
  'Negeri Sembilan': '森美兰',
  'Neom SC W': '新未来城女足',
  'Newell\'s Old Boys Res.': '纽维尔老男孩预备队',
  'Nigeria U20 W': '尼日利亚女足U20',
  'Northcote City': '诺斯科特城',
  'Oakleigh Cannons': '欧克莱卡农',
  'Olimpia Grudziądz': '格鲁琼兹奥林匹亚',
  'Operário PR U20': '蓬塔格罗萨铁路U20',
  'Orebro SK': '奥雷布洛',
  'Osters IF': '奥斯达',
  'Ostersunds FK': '厄斯特松德',
  'Panathinaikos': '帕纳辛奈科斯',
  'Pardubice II': '帕尔杜比采二队',
  'Parramatta Eagles': '帕拉马塔雄鹰',
  'Persik Kediri': '谏义里佩西克',
  'Pho Hien': '福显',
  'Phu Dong': '富东',
  'Pisa': '比萨',
  'Police Tero': '泰路警察',
  'Port FC': '泰港',
  'Portugal U20 W': '葡萄牙女足U20',
  'PSV Eindhoven': 'PSV埃因霍温',
  'PSIS Semarang': '三宝垄',
  'Radnik Surdulica': '苏杜利察工人',
  'Ratchaburi': '拉查武里',
  'Rosario Central Res.': '罗萨里奥中央预备队',
  'Santos U20': '桑托斯U20',
  'SC Braga': '布拉加',
  'Shakhtar Donetsk': '顿涅茨克矿工',
  'Shabab Al Ordon': '约旦青年',
  'Shabab Al-Ahli Dubai U23': '迪拜青年国民U23',
  'Shinnik Yaroslavl': '雅罗斯拉夫尔辛尼克',
  'Smail': '斯迈尔',
  'Slovan Liberec II': '利贝雷茨斯洛万二队',
  'Sokół Kleczew': '克莱切夫猎鹰',
  'South Melbourne': '南墨尔本',
  'Stevenage': '斯蒂夫尼奇',
  'Sundby': '松比',
  'Super Nova': '超级新星',
  'Sur': '苏尔',
  'Syunik': '休尼克',
  'Tampines Rovers': '淡滨尼流浪',
  'Tartu Welco': '塔尔图威尔科',
  'Tasmania Berlin': '柏林塔斯马尼亚',
  'Thanh Hóa': '清化',
  'Tigre Res.': '堤格雷预备队',
  'Tobol 2': '托博尔二队',
  'Torpedo Kutaisi': '库塔伊西鱼雷',
  'Torpedo Moskva': '莫斯科鱼雷',
  'Tukums': '图库姆斯',
  'Tulevik': '图莱维克',
  'Ulsan Citizen': '蔚山市民',
  'United FC U23': '联合U23',
  'Urartu': '乌拉尔图',
  'Varbergs BoIS FC': '瓦尔贝里',
  'Varketili': '瓦尔凯蒂利',
  'Viimsi': '维姆西',
  'Vila Nova': '维拉诺瓦',
  'Vissel Kobe': '神户胜利船',
  'Virtus Entella': '维尔图斯恩泰拉',
  'West Torrens Birkalla': '西托伦斯伯卡拉',
  'West Ham': '西汉姆联',
  'West Ham United': '西汉姆联',
  'Wrexham': '雷克瑟姆',
  'Zbrojovka Brno U19': '布尔诺军械库U19',
  ...MANUAL_TEAM_NAME_OVERRIDES,
});

const MACHINE_TRANSLATION_BLOCKLIST = ['半岛电视台', '哥林多前书', '公关', '胸罩', '发电机'];

function normalizeName(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function lookupKey(value) {
  return normalizeName(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

const NORMALIZED_OVERRIDES = new Map(Object.entries(TEAM_NAME_OVERRIDES).map(([name, translated]) => [lookupKey(name), translated]));

function readCache() {
  try {
    const parsed = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

const cache = readCache();
let translationQueue = Promise.resolve();

function saveCache() {
  fs.mkdirSync(dataDir, { recursive: true });
  const temporaryFile = `${cacheFile}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(cache, null, 2));
  fs.renameSync(temporaryFile, cacheFile);
}

export function translateKnownTeamName(name) {
  const normalized = normalizeName(name);
  if (!normalized || HAS_CHINESE.test(normalized)) return normalized;
  const direct = TEAM_NAME_OVERRIDES[normalized] || NORMALIZED_OVERRIDES.get(lookupKey(normalized));
  if (direct) return direct;

  const suffixPatterns = [
    [/^(.*?)\s+U(\d+)\s+W$/i, (base, age) => `${base}女足U${age}`],
    [/^(.*?)\s+U(\d+)$/i, (base, age) => `${base}U${age}`],
    [/^(.*?)\s+W$/i, (base) => `${base}女足`],
    [/^(.*?)\s+Res\.?$/i, (base) => `${base}预备队`],
    [/^(.*?)\s+(?:II|2)$/i, (base) => `${base}二队`],
  ];
  for (const [pattern, format] of suffixPatterns) {
    const match = normalized.match(pattern);
    if (!match) continue;
    const baseTranslation = TEAM_NAME_OVERRIDES[normalizeName(match[1])] || NORMALIZED_OVERRIDES.get(lookupKey(match[1]));
    if (baseTranslation) return format(baseTranslation, match[2]);
  }
  return '';
}

export function getKnownTeamTranslations() {
  return { ...TEAM_NAME_OVERRIDES };
}

async function fetchTencentTranslations(names) {
  const translations = {};
  for (let index = 0; index < names.length; index += 6) {
    const batch = names.slice(index, index + 6);
    const values = await Promise.all(batch.map((name) => translateToChinese(name)));
    batch.forEach((name, valueIndex) => {
      const value = normalizeName(values[valueIndex]);
      if (HAS_CHINESE.test(value) && !MACHINE_TRANSLATION_BLOCKLIST.some((word) => value.includes(word))) translations[name] = value;
    });
  }
  return translations;
}

function escapeSparql(value) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');
}

async function fetchWikidataNames(names) {
  if (!names.length) return {};
  const values = names.map((name) => `"${escapeSparql(name)}"`).join(' ');
  const query = `
    SELECT ?source ?zh ?language WHERE {
      VALUES ?source { ${values} }
      ?club (rdfs:label|skos:altLabel) ?sourceLabel;
            wdt:P31/wdt:P279* wd:Q476028;
            rdfs:label ?zh.
      FILTER(LANG(?sourceLabel) = "en")
      FILTER(LCASE(STR(?sourceLabel)) = LCASE(STR(?source)))
      FILTER(LANG(?zh) IN ("zh-hans", "zh-cn", "zh"))
      BIND(LANG(?zh) AS ?language)
    }
  `;
  const response = await fetch('https://query.wikidata.org/sparql', {
    method: 'POST',
    headers: {
      Accept: 'application/sparql-results+json',
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'User-Agent': 'MatchPulse/0.1 (personal score monitor)',
    },
    body: new URLSearchParams({ query }).toString(),
    signal: AbortSignal.timeout(4_000),
  });
  if (!response.ok) throw new Error(`Wikidata ${response.status}`);
  const body = await response.json();
  const rank = { 'zh-hans': 3, 'zh-cn': 2, zh: 1 };
  const matches = {};
  for (const item of body.results?.bindings || []) {
    const source = normalizeName(item.source?.value);
    const translated = normalizeName(item.zh?.value);
    const language = item.language?.value || '';
    if (!source || !HAS_CHINESE.test(translated)) continue;
    if (!matches[source] || rank[language] > rank[matches[source].language]) {
      matches[source] = { value: translated, language };
    }
  }
  return Object.fromEntries(Object.entries(matches).map(([name, item]) => [name, item.value]));
}

function chunkNames(names, maxCharacters = 420) {
  const chunks = [];
  let current = [];
  let length = 0;
  for (const name of names) {
    const nextLength = length + name.length + (current.length ? 1 : 0);
    if (current.length && nextLength > maxCharacters) {
      chunks.push(current);
      current = [];
      length = 0;
    }
    current.push(name);
    length += name.length + (current.length > 1 ? 1 : 0);
  }
  if (current.length) chunks.push(current);
  return chunks;
}

async function fetchMachineTranslations(names) {
  const translations = {};
  const results = await Promise.all(chunkNames(names).map(async (chunk) => {
    const url = new URL('https://api.mymemory.translated.net/get');
    url.searchParams.set('q', chunk.join('\n'));
    url.searchParams.set('langpair', 'en|zh-CN');
    const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return {};
    const body = await response.json();
    const lines = String(body.responseData?.translatedText || '').split('\n').map(normalizeName);
    if (lines.length !== chunk.length) return {};
    const chunkTranslations = {};
    chunk.forEach((name, index) => {
      if (HAS_CHINESE.test(lines[index]) && !MACHINE_TRANSLATION_BLOCKLIST.some((word) => lines[index].includes(word))) {
        chunkTranslations[name] = lines[index];
      }
    });
    return chunkTranslations;
  }));
  Object.assign(translations, ...results);
  return translations;
}

async function performTranslation(names) {
  const normalizedNames = [...new Set(names.map(normalizeName).filter(Boolean))].slice(0, 80);
  const translations = {};
  const missing = [];

  for (const name of normalizedNames) {
    const cached = HAS_CHINESE.test(cache[name] || '') ? cache[name] : '';
    const known = translateKnownTeamName(name) || cached;
    if (known) translations[name] = known;
    else missing.push(name);
  }

  if (missing.length) {
    const [wikiResult, machineResult, tencentResult] = await Promise.allSettled([
      fetchWikidataNames(missing),
      fetchMachineTranslations(missing),
      fetchTencentTranslations(missing),
    ]);
    if (machineResult.status === 'fulfilled') Object.assign(translations, machineResult.value);
    if (tencentResult.status === 'fulfilled') Object.assign(translations, tencentResult.value);
    if (wikiResult.status === 'fulfilled') Object.assign(translations, wikiResult.value);
  }

  for (const name of normalizedNames) {
    translations[name] ||= name;
    if (HAS_CHINESE.test(translations[name])) cache[name] = translations[name];
    else delete cache[name];
  }
  if (normalizedNames.length) saveCache();
  return translations;
}

export function translateTeamNames(names) {
  const next = translationQueue.then(() => performTranslation(Array.isArray(names) ? names : []));
  translationQueue = next.catch(() => {});
  return next;
}
