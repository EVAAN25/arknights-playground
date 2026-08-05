#!/usr/bin/env python3
# 人气对决数据：干员 -> B站官号视频播放量
# 优先取干员个人前瞻/技能展示PV；否则取实装活动宣传PV（按实装日期±窗口匹配）
import json, os, re, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'raw')
SNAPSHOT = '2026-08-05'

ops = json.load(open(f'{ROOT}/data/operators.json'))
pvs = json.load(open(f'{RAW}/bili_pvs.json'))

def day(s):
    return datetime.date.fromisoformat(s)

personal = []   # (name, play, title, d)
events = []     # (play, title, d)
for v in pvs:
    m = re.search(r'干员「([^」]+)」', v['title'])
    if m:
        personal.append((m.group(1), v['play'], v['title'], v['d']))
    else:
        events.append((v['play'], v['title'], v['d']))

EXCLUDE = re.compile(r'(复刻|合作|联动|动画|危机合约|集成战略|生息演算|联锁竞赛|矢量突破|卫戍协议|促融共竞|争锋频道|游城拓荒|概念宣传PV|肯德基|WWF|罗森|日清)')
events = [e for e in events if not EXCLUDE.search(e[1])]

def rank(title):
    if '宣传PV' in title:
        return 0
    if '先导PV' in title:
        return 1
    return 2

entries = []
for o in ops:
    if o['rarity'] < 5:
        continue
    hit = None
    for name, play, title, d in personal:
        if name == o['name']:
            hit = {'play': play, 'title': title, 'videoDate': d, 'type': '干员PV'}
            break
    # 开服干员（2019-04-30 随游戏上线）早于任何活动 PV，不做活动 PV 关联
    if not hit and o.get('release') and o['release'] > '2019-05-15':
        rel = day(o['release'])
        cands = []
        for play, title, d in events:
            dd = day(d)
            delta = (rel - dd).days
            if -1 <= delta <= 24:
                cands.append((delta < 0, abs(delta), rank(title), play, title, d))
        if cands:
            cands.sort()
            _, _, _, play, title, d = cands[0]
            hit = {'play': play, 'title': title, 'videoDate': d, 'type': '活动PV'}
    if hit and hit['type'] == '活动PV' and hit['videoDate'] <= '2019-06-15' and o['name'] not in ('斯卡蒂', '夜魔'):
        hit = None
    if hit:
        entries.append({'id': o['id'], 'name': o['name'], **hit})

# 去重防御：同 id 只留一条
seen = set()
uniq = []
for e in entries:
    if e['id'] in seen:
        continue
    seen.add(e['id'])
    uniq.append(e)

out = {'snapshot': SNAPSHOT,
       'source': 'B站官号「明日方舟」(mid=161775300) 空间视频列表',
       'note': '播放量为页面显示值取整（如236.5万→2365000），精度到千位；官号联合投稿视频不在其空间列表，相关干员未收录',
       'entries': uniq}
json.dump(out, open(f'{ROOT}/data/popularity.json', 'w'), ensure_ascii=False, indent=1)
with open(f'{ROOT}/data/popularity.js', 'w') as f:
    f.write('// B站官号视频播放量快照（自动生成：tools/build_popularity.py，快照日期 %s）\n' % SNAPSHOT)
    f.write('window.ARK_POP = ')
    json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    f.write(';\n')
print('entries:', len(uniq), '| 个人PV:', sum(1 for e in uniq if e['type'] == '干员PV'))
for e in uniq[:8]:
    print(e['name'], e['play'], e['type'], e['title'][:36])
