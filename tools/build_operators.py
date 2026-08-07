#!/usr/bin/env python3
# 合并 character_table + PRTS(种族/画师/声优/页面创建时间) + wiki.gg 卡池日期
# 输出 data/operators.json 与 data/operators.js（浏览器内嵌兜底）
import json, os, re, unicodedata, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'raw')

chartab = json.load(open(f'{RAW}/character_table.json'))
lore = json.load(open(f'{RAW}/prts_lore.json'))
created = json.load(open(f'{RAW}/prts_created.json'))
banners = json.load(open(f'{RAW}/banners_cn.json'))
tl = json.load(open(f'{RAW}/tl-akhr.json'))

PROF = {'MEDIC':'医疗','PIONEER':'先锋','WARRIOR':'近卫','SNIPER':'狙击','CASTER':'术师','SUPPORT':'辅助','TANK':'重装','SPECIAL':'特种'}
NATION = {'columbia':'哥伦比亚','victoria':'维多利亚','iberia':'伊比利亚','ursus':'乌萨斯','lungmen':'龙门','siracusa':'叙拉古','sargon':'萨尔贡','higashi':'东国','kazimierz':'卡西米尔','rhodes':'罗德岛','yan':'炎国','rim':'雷姆必拓','sami':'萨米','egir':'阿戈尔','minos':'米诺斯','bolivar':'玻利瓦尔','laterano':'拉特兰','kjerag':'谢拉格','leithanien':'莱塔尼亚'}
GROUP = {'rhine':'莱茵生命','penguin':'企鹅物流','siesta':'汐斯塔','pinus':'红松骑士团','blacksteel':'黑钢国际','lgd':'龙门近卫局','glasgow':'格拉斯哥帮','abyssal':'深海猎人','tara':'塔拉','sweep':'S.W.E.E.P.','babel':'巴别塔','elite':'罗德岛精英干员','sui':'岁','karlan':'喀兰贸易'}
TEAM = {'student':'乌萨斯学生自治团','rainbow':'彩虹小队','followers':'使徒','laios':'莱欧斯小队','mujica':'Ave Mujica','lee':'鲤氏侦探事务所','chiave':'贾维团伙','action4':'行动组A4','reserve1':'行动预备组A1','reserve4':'行动预备组A4','reserve6':'行动预备组A6'}
SUBPROF = {'pioneer':'尖兵','charger':'冲锋手','tactician':'战术家','agent':'情报官','bearer':'执旗手','fastshot':'速射手','aoesniper':'炮手','deadeye':'神射手','heavyshooter':'重射手','shotprotector':'哨戒铁卫','protector':'铁卫','primprotector':'本源铁卫','guardian':'守护者','juggernaut':'不屈者','duelist':'决战者','artsprotector':'驭法铁卫','physician':'医师','ringhealer':'疗养师','grouphealer':'群愈师','wanderer':'巡旅者','incantation':'咒愈师','chainhealer':'链愈师','corecaster':'中坚术师','splashcaster':'扩散术师','primcaster':'秘术师','funnel':'驭械术师','chain':'链术师','phalanx':'阵法术师','mystic':'链术师','blastcaster':'轰击术师','slower':'凝滞师','summoner':'召唤师','blessing':'护佑者','craftsman':'工匠','hymn':'吟游者','ritualist':'巫役','fearless':'无畏者','centurion':'强攻手','lord':'领主','sword':'剑豪','fighter':'斗士','artsfghter':'术战者','instructor':'教官','musha':'武者','reaper':'收割者','hammer':'撼地者','librator':'解放者','executor':'处决者','traper':'陷阱师','pusher':'推击手','hook':'钩索师','stalker':'行商','geek':'怪杰','ambusher':'伏击客','merchant':'行商','dollkeeper':'傀儡师','sacrifice':'快速复活','apostle':'怪杰'}

def norm(s):
    s = unicodedata.normalize('NFKD', s or '')
    return re.sub(r'[^a-z0-9]', '', s.lower())

# EN -> charId 映射（tl-akhr + appellation）
en2id = {}
for e in tl:
    if e.get('name_en'):
        en2id.setdefault(norm(e['name_en']), e['id'])
for cid, v in chartab.items():
    if v.get('appellation'):
        en2id.setdefault(norm(v['appellation']), cid)
# 手工修补（NFKD 也归一化不了的字符）
en2id['mlynar'] = 'char_4064_mlynar' if 'char_4064_mlynar' in chartab else en2id.get('mlynar')

# 卡池 debut 日期（UTC+8 修正：startTimeCN 是 UTC 文本，+8h 取日期）
banner_date = {}
for b in banners:
    raw = (b.get('startTimeCN') or '')[:19]
    if not raw:
        continue
    try:
        dt = datetime.datetime.strptime(raw, '%Y-%m-%d %H:%M:%S') + datetime.timedelta(hours=8)
    except ValueError:
        continue
    d = dt.strftime('%Y-%m-%d')
    for op in (b.get('operators') or '').split(','):
        op = op.strip()
        if not op:
            continue
        cid = en2id.get(norm(op))
        if not cid:
            continue
        if cid not in banner_date or d < banner_date[cid]:
            banner_date[cid] = d

# 性别：tl-akhr 为主，raw/sex_patch.json（PRTS 档案）补新干员
SEX = {e['id']: e.get('sex') for e in tl if e.get('sex') in ('男', '女')}
if os.path.exists(f'{RAW}/sex_patch.json'):
    _sp = json.load(open(f'{RAW}/sex_patch.json'))
    _name2id = {v['name']: cid for cid, v in chartab.items()
                if not cid.startswith(('trap_', 'npc_', 'token_'))}
    for _n, _s in _sp.items():
        if _s in ('男', '女') and _n in _name2id:
            SEX.setdefault(_name2id[_n], _s)

EXCLUDE = set()  # 阿米娅升变形态只保留本体
ops = []
seen_names = {}
for cid, v in chartab.items():
    if cid.startswith(('trap_', 'npc_', 'token_')):
        continue
    if v.get('isNotObtainable'):
        continue
    r = v.get('rarity')
    if r not in ('TIER_3', 'TIER_4', 'TIER_5', 'TIER_6'):
        continue
    if v.get('profession') in ('TOKEN', 'TRAP'):
        continue
    name = v['name']
    rec = {
        'id': cid, 'name': name,
        'rarity': int(r[-1]),
        'prof': PROF.get(v['profession'], v['profession']),
        'sub': SUBPROF.get(v.get('subProfessionId'), ''),
        'faction': GROUP.get(v.get('groupId')) or TEAM.get(v.get('teamId')) or NATION.get(v.get('nationId')) or '罗德岛',
        'nation': NATION.get(v.get('nationId'), ''),
    }
    lg = lore.get(name) or {}
    rec['sex'] = SEX.get(cid)
    rec['race'] = (lg.get('race') or '').split('/')[0].strip() or None
    rec['artist'] = lg.get('artist') or None
    rec['cvJp'] = lg.get('cvJp') or None
    rec['cvCn'] = lg.get('cvCn') or None
    cr = created.get(name)
    rec['created'] = cr[:10] if cr else None
    rec['bannerDate'] = banner_date.get(cid)
    ops.append(rec)

# 阿米娅升变：同名只留 char_002_amiya
ops = [o for o in ops if o['id'] not in ('char_1001_amiya2', 'char_1037_amiya3')]

# 实装日期：PRTS「上线时间」（raw/prts_online.json，低星干员无卡池记录）优先；
# 否则 banner 与创建时间 reconcile（取较早者，差异>30 天以创建时间为准并记录）
online = json.load(open(f'{RAW}/prts_online.json')) if os.path.exists(f'{RAW}/prts_online.json') else {}
n_date = 0
for o in ops:
    if online.get(o['name']):
        o['release'] = online[o['name']]
        o['releaseSrc'] = 'prts-online'
        n_date += 1
        del o['created']; del o['bannerDate']
        continue
    c, b = o['created'], o['bannerDate']
    if c and b:
        dc = datetime.date.fromisoformat(c); db = datetime.date.fromisoformat(b)
        if abs((db - dc).days) > 30:
            o['release'] = min(c, b)
            o['releaseSrc'] = 'mixed'
        else:
            o['release'] = b  # 卡池日期更精确
            o['releaseSrc'] = 'banner'
    elif c:
        o['release'] = c; o['releaseSrc'] = 'prts-created'
    else:
        o['release'] = b; o['releaseSrc'] = 'banner' if b else None
    if o['release']:
        n_date += 1
    del o['created']; del o['bannerDate']

ops.sort(key=lambda o: (o['release'] or '9999', o['id']))
json.dump(ops, open(f'{ROOT}/data/operators.json', 'w'), ensure_ascii=False, indent=1)
with open(f'{ROOT}/data/operators.js', 'w') as f:
    f.write('// 干员数据（自动生成：tools/build_operators.py）\n')
    f.write('window.ARK_OPS = ')
    json.dump(ops, f, ensure_ascii=False, separators=(',', ':'))
    f.write(';\n')
print('operators:', len(ops), '| with release:', n_date,
      '| r3:', sum(1 for o in ops if o['rarity'] == 3),
      '| r4:', sum(1 for o in ops if o['rarity'] == 4),
      '| r5:', sum(1 for o in ops if o['rarity'] == 5),
      '| r6:', sum(1 for o in ops if o['rarity'] == 6))
