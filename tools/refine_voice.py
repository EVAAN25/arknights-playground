#!/usr/bin/env python3
# 语音选句优化：每干员选 3 条 8~60 字的中文语音（Heardle 题面需要可辨识的长度）
import json, os, subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cw = json.load(open(f'{ROOT}/raw/charword_table.json'))['charWords']
ops = json.load(open(f'{ROOT}/data/operators.json'))

PREF = ['任命助理', '问候', '交谈1', '交谈2', '交谈3', '作战中1', '作战中2',
        '信赖提升后交谈1', '选中干员1', '部署1', '作战中3', '作战中4', '干员报到']

def api_json(path):
    r = subprocess.run(['gh', 'api', path], capture_output=True, timeout=60)
    if r.returncode != 0:
        return None
    try:
        return json.loads(r.stdout)
    except Exception:
        return None

index = {}
for i, o in enumerate(ops):
    cid = o['id']
    rows = [v for v in cw.values() if v['charId'] == cid and v['voiceId'].startswith('CN_')]
    by_title = {}
    for v in rows:
        if v['voiceTitle'] in PREF and v['voiceTitle'] not in by_title:
            by_title[v['voiceTitle']] = v
    cand = [by_title[t] for t in PREF if t in by_title]
    good = [v for v in cand if 8 <= len(v['voiceText']) <= 60]
    if len(good) < 2:
        good += [v for v in cand if v not in good]
    picks = good[:3]
    if not picks:
        continue
    listing = api_json(f'repos/Aceship/Arknight-voices/contents/voice_cn/{cid}')
    if not isinstance(listing, list):
        continue
    have = {f['name'] for f in listing}
    got = []
    for v in picks:
        fn = f"{v['voiceId']}.mp3"
        if fn not in have:
            continue
        dst = f"{ROOT}/assets/voice/{cid}_{v['voiceId']}.mp3"
        if not (os.path.exists(dst) and os.path.getsize(dst) > 2000):
            r = subprocess.run(['gh', 'api', f'repos/Aceship/Arknight-voices/contents/voice_cn/{cid}/{fn}',
                                '-H', 'Accept: application/vnd.github.raw'], capture_output=True, timeout=60)
            if r.returncode != 0 or len(r.stdout) < 2000:
                continue
            open(dst, 'wb').write(r.stdout)
        got.append({'f': f"assets/voice/{cid}_{v['voiceId']}.mp3", 't': v['voiceTitle'], 'x': v['voiceText']})
    if got:
        index[cid] = got
    if (i + 1) % 60 == 0:
        print(f'{i+1}/{len(ops)} indexed={len(index)}', flush=True)

json.dump(index, open(f'{ROOT}/data/voice_index.json', 'w'), ensure_ascii=False, indent=1)
with open(f'{ROOT}/data/voice.js', 'w') as f:
    f.write('// 中文语音索引（tools/refine_voice.py 生成；源：Aceship/Arknight-voices voice_cn）\n')
    f.write('window.ARK_VOICE = ')
    json.dump(index, f, ensure_ascii=False, separators=(',', ':'))
    f.write(';\n')
print('voice ops:', len(index), 'files:', sum(len(v) for v in index.values()))
am = index.get('char_002_amiya')
print('amiya sample:', json.dumps(am, ensure_ascii=False)[:300] if am else None)
