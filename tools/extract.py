"""Step 1: estrae dai dump Wiktionary (kaikki.org) solo i dati che servono."""
import json, sys, pickle
en_path, it_path, out = sys.argv[1:4]
recs = {}   # word -> list of dict(src,pos,ipas)
forms = []  # (form, lemma, pos, tags)
def add(w, src, pos, ipas):
    recs.setdefault(w, []).append((src, pos, ipas))
def ok(w):
    return w and ' ' not in w and '-' not in w and "'" not in w and w.isalpha() and w[0].islower()
for src, path in (('it', it_path), ('en', en_path)):
    with open(path) as f:
        for line in f:
            try: d = json.loads(line)
            except Exception: continue
            if d.get('lang_code') not in (None, 'it'): continue
            w = d.get('word', ''); pos = d.get('pos', '')
            if not ok(w): continue
            # ogni pronuncia con le sue etichette (es. "Northern", "regional", nota "Rome")
            ipas = [(s['ipa'], tuple((s.get('tags') or []) + (s.get('raw_tags') or []) + ([s['note']] if s.get('note') else [])))
                    for s in d.get('sounds', []) if s.get('ipa')]
            fo = None
            for s in d.get('senses', []):
                for x in s.get('form_of', []) or []:
                    fo = x.get('word')
            if ipas: add(w, src, pos, ipas)
            elif fo: add(w, src + '-form', pos, [])
            if src == 'en':
                for fm in d.get('forms', []) or []:
                    fw = fm.get('form', '')
                    if ok(fw) and fw != w:
                        forms.append((fw, w, pos, tuple(fm.get('tags', []))))
pickle.dump((recs, forms), open(out, 'wb'))
print(len(recs), len(forms))
