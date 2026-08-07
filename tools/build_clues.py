#!/usr/bin/env python3
# 生成「猜干员」档案线索数据：台词 / 天赋名 / 技能名 / 实装活动PV名
# 输出 data/clues.js（window.ARK_CLUES = {charId: {quote, talents[], skills[], event}})
import json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'raw')

ops = json.load(open(f'{ROOT}/data/operators.json'))
ct = json.load(open(f'{RAW}/character_table.json'))
cw = json.load(open(f'{RAW}/charword_table.json'))['charWords']
sk = json.load(open(f'{RAW}/skill_table.json'))
pop = json.load(open(f'{ROOT}/data/popularity.json'))

# 实装活动名：从人气数据的 PV 标题提取（如 SideStory「日暮寻路」/五周年庆典）
event = {}
for e in pop['entries']:
    t = e['title']
    m = re.search(r'「([^」]+)」', t)
    if m:
        event[e['id']] = m.group(1)
    elif '周年' in t or '庆典' in t or '嘉年华' in t:
        event[e['id']] = re.sub(r'[《》明日方舟\s]', '', t).strip('」')

Q_PREF = ['问候', '任命助理', '交谈1', '交谈2', '交谈3', '信赖提升后交谈1', '干员报到', '作战中1']

out = {}
for o in ops:
    cid = o['id']
    if cid not in ct:
        continue
    rec = {}
    # 台词：charword CN_ 文本全干员都有（文本本地化），挑 8~40 字
    rows = [v for v in cw.values() if v['charId'] == cid and v['voiceId'].startswith('CN_')]
    by_title = {}
    for v in rows:
        if v['voiceTitle'] in Q_PREF and v['voiceTitle'] not in by_title:
            by_title[v['voiceTitle']] = v
    cands = [by_title[t] for t in Q_PREF if t in by_title]
    good = [v for v in cands if 8 <= len(v['voiceText']) <= 40]
    pick = (good or cands or [None])[0]
    if pick:
        rec['quote'] = pick['voiceText']
    # 天赋名：取最高解锁阶段的名字，过滤 ？？？
    names = []
    for tal in (ct[cid].get('talents') or []):
        cands2 = [c for c in (tal.get('candidates') or []) if c.get('name') and '？' not in c['name']]
        if cands2:
            names.append(cands2[-1]['name'])
    if names:
        rec['talents'] = names[:2]
    # 技能名
    sknames = []
    for s in (ct[cid].get('skills') or []):
        sid = s.get('skillId')
        if sid and sid in sk:
            nm = sk[sid].get('levels', [{}])[0].get('name')
            if nm:
                sknames.append(nm)
    if sknames:
        rec['skills'] = sknames[:3]
    if cid in event:
        rec['event'] = event[cid]
    out[cid] = rec

with open(f'{ROOT}/data/clues.js', 'w') as f:
    f.write('// 猜干员档案线索（tools/build_clues.py 生成；源：charword_table/character_table/skill_table/popularity）\n')
    f.write('window.ARK_CLUES = ')
    json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    f.write(';\n')
json.dump(out, open(f'{ROOT}/data/clues.json', 'w'), ensure_ascii=False, indent=1)

n_q = sum(1 for v in out.values() if 'quote' in v)
n_t = sum(1 for v in out.values() if 'talents' in v)
n_s = sum(1 for v in out.values() if 'skills' in v)
n_e = sum(1 for v in out.values() if 'event' in v)
print(f'clues: {len(out)} ops | quote {n_q} | talents {n_t} | skills {n_s} | event {n_e}')
print('amiya:', json.dumps(out['char_002_amiya'], ensure_ascii=False)[:260])
# 画师/声优覆盖（猜干员题池）
pool = [o for o in ops if o['rarity'] >= 3 and o.get('release') and o.get('sex')]
n_a = sum(1 for o in pool if o.get('artist'))
n_c = sum(1 for o in pool if o.get('cvCn'))
print(f'guess pool {len(pool)} | artist {n_a} | cvCn {n_c}')
