#!/usr/bin/env python3
# 抓取干员头像（Aceship/Arknight-Images）与中文语音（Aceship/Arknight-voices voice_cn）
# 用法: python3 tools/fetch_assets.py
# 依赖: gh CLI 已登录；raw/ 下已有 character_table.json / charword_table.json / pool_56.json
import json, os, subprocess, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'raw')
POOL4 = os.path.exists(os.path.join(RAW, 'pool_4.json'))

if os.path.exists(os.path.join(ROOT, 'data', 'operators.json')):
    pool = {o['id']: o['name'] for o in json.load(open(os.path.join(ROOT, 'data', 'operators.json')))}
else:
    pool = json.load(open(os.path.join(RAW, 'pool_56.json')))
cw = json.load(open(os.path.join(RAW, 'charword_table.json')))['charWords']

# 每干员按标题偏好+文本长度选最多 3 条短语音
PREF = ['任命助理', '问候', '交谈1', '交谈2', '作战中1', '作战中2', '交谈3', '选中干员1', '部署1', '信赖提升后交谈1']

def gh(path, out=None):
    cmd = ['gh', 'api', path, '-H', 'Accept: application/vnd.github.raw']
    if out:
        cmd += ['> ' + out]  # not used; see download()
    r = subprocess.run(cmd, capture_output=True, timeout=60)
    if r.returncode != 0:
        return None
    return r.stdout

def api_json(path):
    r = subprocess.run(['gh', 'api', path], capture_output=True, timeout=60)
    if r.returncode != 0:
        return None
    try:
        return json.loads(r.stdout)
    except Exception:
        return None

# ---- 1. 头像 ----
os.makedirs(f'{ROOT}/assets/avatars', exist_ok=True)
n_ok = n_skip = n_fail = 0
for cid in pool:
    dst = f'{ROOT}/assets/avatars/{cid}.png'
    if os.path.exists(dst) and os.path.getsize(dst) > 1000:
        n_skip += 1
        continue
    r = subprocess.run(['gh', 'api', f'repos/Aceship/Arknight-Images/contents/avatars/{cid}.png',
                        '-H', 'Accept: application/vnd.github.raw'], capture_output=True, timeout=60)
    if r.returncode == 0 and len(r.stdout) > 1000 and r.stdout[:4] == b'\x89PNG':
        open(dst, 'wb').write(r.stdout); n_ok += 1
    else:
        n_fail += 1
print(f'avatars ok={n_ok} skip={n_skip} fail={n_fail}', flush=True)

# ---- 2. 语音 ----
# 选候选 voiceId
picks = {}  # cid -> [(voiceId, title, text)]
for cid in pool:
    rows = [v for v in cw.values() if v['charId'] == cid and v['voiceId'].startswith('CN_')]
    by_title = {}
    for v in rows:
        t = v['voiceTitle']
        if t in PREF and t not in by_title:
            by_title[t] = v
    cand = [by_title[t] for t in PREF if t in by_title]
    cand.sort(key=lambda v: len(v['voiceText']))
    picks[cid] = [(v['voiceId'], v['voiceTitle'], v['voiceText']) for v in cand[:3]]

os.makedirs(f'{ROOT}/assets/voice', exist_ok=True)
voice_index = {}
for i, cid in enumerate(pool):
    listing = api_json(f'repos/Aceship/Arknight-voices/contents/voice_cn/{cid}')
    if not isinstance(listing, list):
        continue
    have = {f['name'] for f in listing}
    got = []
    for vid, title, text in picks[cid]:
        fn = f'{vid}.mp3'
        if fn not in have:
            continue
        dst = f'{ROOT}/assets/voice/{cid}_{vid}.mp3'
        if not (os.path.exists(dst) and os.path.getsize(dst) > 2000):
            r = subprocess.run(['gh', 'api', f'repos/Aceship/Arknight-voices/contents/voice_cn/{cid}/{fn}',
                                '-H', 'Accept: application/vnd.github.raw'], capture_output=True, timeout=60)
            if r.returncode != 0 or len(r.stdout) < 2000:
                continue
            open(dst, 'wb').write(r.stdout)
        got.append({'file': f'assets/voice/{cid}_{vid}.mp3', 'title': title, 'text': text,
                    'size': os.path.getsize(dst)})
    if got:
        voice_index[cid] = got
    if (i + 1) % 40 == 0:
        print(f'voice progress {i+1}/{len(pool)} withVoice={len(voice_index)}', flush=True)

json.dump(voice_index, open(f'{ROOT}/data/voice_index.json', 'w'), ensure_ascii=False, indent=1)
print('voice ops:', len(voice_index), 'files:', sum(len(v) for v in voice_index.values()))
