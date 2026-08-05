#!/usr/bin/env python3
# 生成「阵营连线」题库：16 干员分 4 组，校验在 6 个分组维度上解唯一
# 维度：势力 faction / 职业 prof / 种族 race / 画师 artist / 日文声优 cvJp / 中文声优 cvCn
import json, os, random, itertools, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ops = json.load(open(f'{ROOT}/data/operators.json'))
random.seed(20260805)

DIMS = [('faction', '势力'), ('prof', '职业'), ('race', '种族'), ('artist', '画师'), ('cvJp', '日文声优'), ('cvCn', '中文声优')]

pool = [o for o in ops if o['rarity'] >= 5]
byid = {o['id']: o for o in pool}

# 每个维度下 value -> ops（只保留 >=4 人的值）
cand = []  # (dim, value, frozenset(ids))
for dim, _ in DIMS:
    idx = collections.defaultdict(list)
    for o in pool:
        v = o.get(dim)
        if v:
            idx[v].append(o['id'])
    for v, ids in idx.items():
        if len(ids) >= 4:
            cand.append((dim, v, frozenset(ids)))
print('candidate groups:', len(cand))

def valid_quads(ids16):
    """16 人集合中所有"合法四人组"（共享某个维度同值）"""
    quads = set()
    for dim, _ in DIMS:
        idx = collections.defaultdict(list)
        for i in ids16:
            v = byid[i].get(dim)
            if v:
                idx[v].append(i)
        for v, ids in idx.items():
            if len(ids) >= 4:
                for combo in itertools.combinations(sorted(ids), 4):
                    quads.add(frozenset(combo))
    return quads

def count_solutions(ids16, cap=2):
    """exact cover：把 16 人划分成 4 个合法四人组，方案数（数到 cap 就停）"""
    quads = [q for q in valid_quads(ids16) if q <= ids16]
    ids = list(ids16)
    solutions = []
    def bt(remaining, chosen):
        if len(solutions) >= cap:
            return
        if not remaining:
            solutions.append(list(chosen))
            return
        first = min(remaining)
        for q in quads:
            if first in q and q <= remaining:
                bt(remaining - q, chosen + [q])
    bt(frozenset(ids), [])
    return solutions

def make_puzzle(rng):
    """随机挑 4 组（不同维度、成员不重叠、16 人内每组值恰好 4 人命中），并校验解唯一"""
    for _ in range(300):
        groups=[]
        used_dims=set()
        ids16=set()
        ok=True
        for step in range(4):
            tries=0
            placed=False
            while tries<80:
                tries+=1
                dim,val,full=cand[rng.randrange(len(cand))]
                if dim in used_dims: continue
                if ids16 & full and not (ids16 & full) <= set():  # 已选16人里不能有这个值的游离命中
                    pass
                hits=ids16 & full
                if hits: continue  # 之前的 16 人里已有该值成员 → 会造成第 5 人歧义
                avail=sorted(full - ids16)
                if len(avail)<4: continue
                members=frozenset(rng.sample(avail,4)) if len(avail)>4 else frozenset(avail)
                groups.append((dim,val,members))
                used_dims.add(dim)
                ids16|=members
                placed=True
                break
            if not placed:
                ok=False; break
        if not ok or len(ids16)!=16: continue
        # 终检：16 人中每组值恰好命中本组 4 人
        ids16=frozenset(ids16)
        good=True
        for dim,val,members in groups:
            hits={i for i in ids16 if byid[i].get(dim)==val}
            if hits!=set(members): good=False; break
        if not good: continue
        sols=count_solutions(ids16,cap=2)
        if len(sols)!=1: continue
        return groups
    return None

appear = collections.Counter()
puzzles = []
seen_key = set()
tries = 0
while len(puzzles) < 72 and tries < 6000:
    tries += 1
    res = make_puzzle(random)
    if not res:
        continue
    ids16 = frozenset().union(*[g[2] for g in res])
    if ids16 in seen_key:
        continue
    seen_key.add(ids16)
    for i in ids16:
        appear[i] += 1
    groups = [{'dim': d, 'dimLabel': dict(DIMS)[d], 'label': v,
               'members': sorted(m)} for d, v, m in res]
    # 按维度稳定性排难度：势力/职业较易，声优最难
    rank = {'faction': 0, 'prof': 0, 'race': 1, 'artist': 2, 'cvCn': 3, 'cvJp': 3}
    groups.sort(key=lambda g: rank[g['dim']])
    puzzles.append({'id': len(puzzles) + 1, 'groups': groups})

json.dump(puzzles, open(f'{ROOT}/data/connections.json', 'w'), ensure_ascii=False, indent=1)
with open(f'{ROOT}/data/connections.js', 'w') as f:
    f.write('// 连线题库（自动生成：tools/build_connections.py，已校验唯一解）\n')
    f.write('window.ARK_CONN = ')
    json.dump(puzzles, f, ensure_ascii=False, separators=(',', ':'))
    f.write(';\n')
print('puzzles:', len(puzzles), 'tries:', tries)
dimcnt = collections.Counter(g['dim'] for p in puzzles for g in p['groups'])
print(dict(dimcnt))
