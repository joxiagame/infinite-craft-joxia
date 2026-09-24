#!/usr/bin/env python3
# build.py — transforme /tmp/data.json (InfiniteCraftWiki, MIT) en bundle statique compact
# Sortie : data/elements.json (noms + emojis) et data/recipes.data (adjacence gzip)
import json, gzip, struct, os, sys, time
import numpy as np

SRC = r"C:\Users\basil\AppData\Local\Temp\data.json"
OUT_DIR = r"C:\Users\basil\Documents\infinite-craft-joxia\data"

BASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-='
rev = {c: i for i, c in enumerate(BASE)}

def from_b64(s):
    r = 0
    for ch in s:
        r = r * 64 + rev[ch]
    return r

t0 = time.time()
print("Loading data.json ...", flush=True)
with open(SRC, 'r', encoding='utf-8') as f:
    raw = json.load(f)
print(f"  loaded in {time.time()-t0:.1f}s", flush=True)

index = raw['index']
data = raw['data']

# ---- elements ----
t0 = time.time()
max_id = 0
for k in index:
    i = from_b64(k)
    if i > max_id:
        max_id = i
N = max_id + 1
names = [''] * N
emojis = [''] * N
for k, v in index.items():
    i = from_b64(k)
    emojis[i] = v[0]
    names[i] = v[1]
print(f"elements: N={N} (max_id={max_id})  keys={len(index)}  ({time.time()-t0:.1f}s)", flush=True)

# base elements
base = [i for i, nm in enumerate(names) if nm in ('Water', 'Fire', 'Wind', 'Earth')]
print("base ids:", [(i, names[i], emojis[i]) for i in base], flush=True)

# ---- recipes (parse manuel, sans 20M de sous-chaînes) ----
t0 = time.time()
import array
A = array.array('I'); B = array.array('I'); C = array.array('I')
n = len(data)
i = 0
total = 0
ap = A.append; bp = B.append; cp = C.append
revget = rev.__getitem__
while i < n:
    a = 0
    while data[i] != ',':
        a = a * 64 + revget(data[i]); i += 1
    i += 1
    b = 0
    while data[i] != ',':
        b = b * 64 + revget(data[i]); i += 1
    i += 1
    c = 0
    while i < n and data[i] != ';':
        c = c * 64 + revget(data[i]); i += 1
    i += 1
    total += 1
    if a != 0 and b != 0 and c != 0:
        if a < b:
            ap(a); bp(b); cp(c)
        else:
            ap(b); bp(a); cp(c)
print(f"recipes parsed: total={total}  valid={len(A)}  ({time.time()-t0:.1f}s)", flush=True)

# ---- sort + dedupe (numpy) ----
t0 = time.time()
a2 = np.frombuffer(A, dtype=np.uint32)
b2 = np.frombuffer(B, dtype=np.uint32)
c2 = np.frombuffer(C, dtype=np.uint32)
order = np.lexsort((b2, a2))
a2 = a2[order]; b2 = b2[order]; c2 = c2[order]
keep = np.empty(len(a2), dtype=bool)
keep[0] = True
keep[1:] = ~((a2[1:] == a2[:-1]) & (b2[1:] == b2[:-1]))
a2 = a2[keep]; b2 = b2[keep]; c2 = c2[keep]
M = len(a2)
print(f"dedupe: {M} unique recipes ({time.time()-t0:.1f}s)", flush=True)

# ---- offsets / neighbors / results (adjacence simple-face) ----
t0 = time.time()
counts = np.bincount(a2.astype(np.int64), minlength=N)
offsets = np.zeros(N + 1, dtype=np.uint32)
offsets[1:] = np.cumsum(counts)
print(f"adjacency built ({time.time()-t0:.1f}s)", flush=True)

# ---- write outputs ----
os.makedirs(OUT_DIR, exist_ok=True)

# elements.json
t0 = time.time()
with open(os.path.join(OUT_DIR, 'elements.json'), 'w', encoding='utf-8') as f:
    json.dump({'n': names, 'e': emojis}, f, ensure_ascii=False, separators=(',', ':'))
print(f"elements.json written {os.path.getsize(os.path.join(OUT_DIR,'elements.json'))/1e6:.1f} MB ({time.time()-t0:.1f}s)", flush=True)

# recipes.data (gzip binary)
t0 = time.time()
header = struct.pack('<II', N, M)
blob = header + offsets.tobytes() + b2.tobytes() + c2.tobytes()
raw_size = len(blob)
with gzip.open(os.path.join(OUT_DIR, 'recipes.data'), 'wb', compresslevel=9) as f:
    f.write(blob)
gz_size = os.path.getsize(os.path.join(OUT_DIR, 'recipes.data'))
print(f"recipes.data: raw {raw_size/1e6:.1f} MB -> gzip {gz_size/1e6:.1f} MB ({time.time()-t0:.1f}s)", flush=True)

# meta.json
meta = {
    'N': N, 'M': M,
    'base': base,
    'source': 'expitau/InfiniteCraftWiki (MIT, Nathan DSilva 2025)',
    'originalRecipeCount': 6671590,
    'originalElementCount': 793068,
}
with open(os.path.join(OUT_DIR, 'meta.json'), 'w', encoding='utf-8') as f:
    json.dump(meta, f, ensure_ascii=False, separators=(',', ':'))

# ---- sanity ----
s = raw['data']
assert total == 6671590, f"recipe count mismatch: {total}"
print("\nOK — base ids:", base, "| N:", N, "| M:", M, flush=True)
