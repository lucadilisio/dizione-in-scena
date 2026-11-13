"""Step 4: descrizioni degli omografi -> data/omografi.txt

Per ogni parola del lessico con omografi (pèsca;pésca) abbina a ciascuna pronuncia una breve descrizione
in italiano. L'abbinamento pronuncia -> significato viene da Wiktionary inglese (una voce per etimologia,
ognuna con la sua IPA); la descrizione in italiano viene dalla voce corrispondente di Wiktionary italiano
(stessa categoria grammaticale, oppure stessa forma flessa dello stesso lemma).

Uso: python3 omografi.py en.jsonl it.jsonl ../data/lessico.txt ../data/omografi.txt
"""
import sys, json, re
from ipa import analyze, mark

en_path, it_path, lex_path, out_path = sys.argv[1:5]
STRIP = str.maketrans('àèéìíòóùúṡż', 'aeeiioouusz')
NOSZ = str.maketrans('ṡż', 'sz')

# parole con omografi (o varianti di tipo H) nel lessico: chiave -> forme
targets = {}
for line in open(lex_path, encoding='utf-8'):
    line = line.rstrip('\n')
    key, _, body = line.rpartition('\t')
    body = body.rstrip('!')
    main, *homs = body.split(';')
    homs = [h.split('@')[0] for h in homs]
    prim, *vars_ = main.split('~')
    forms = [prim] + homs + [v.split('@')[0] for v in vars_ if v.split('@')[1:2] == ['H']]
    if homs:
        targets[key or prim.translate(STRIP)] = forms

POS_IT = {'noun': 'sostantivo', 'verb': 'verbo', 'adj': 'aggettivo', 'adv': 'avverbio', 'num': 'numerale',
          'pron': 'pronome', 'prep': 'preposizione', 'conj': 'congiunzione', 'intj': 'interiezione', 'name': 'nome proprio'}
POS_EQ = {'num': {'num', 'adj', 'noun'}, 'adj': {'adj', 'num'}, 'name': {'name', 'noun'}}

def senses(d):
    out = []
    for s in d.get('senses', []):
        g = (s.get('glosses') or s.get('raw_glosses') or [''])[0].strip()
        fo = [x.get('word') for x in (s.get('form_of') or []) + (s.get('alt_of') or []) if x.get('word')]
        out.append((g, fo, s.get('tags', [])))
    return out

it_recs = {}
with open(it_path) as f:
    for line in f:
        try: d = json.loads(line)
        except Exception: continue
        w = d.get('word')
        if w in targets:
            it_recs.setdefault(w, []).append((d.get('pos', ''), senses(d)))

en_recs = {}
with open(en_path) as f:
    for line in f:
        try: d = json.loads(line)
        except Exception: continue
        w = d.get('word')
        if w in targets:
            ipas = [s['ipa'] for s in d.get('sounds', []) if s.get('ipa')]
            if ipas: en_recs.setdefault(w, []).append((d.get('pos', ''), ipas[0], senses(d)))

def short(g, n=70):
    g = re.sub(r'\s+', ' ', g).strip().rstrip(':;,.')
    return g if len(g) <= n else g[:n - 1].rsplit(' ', 1)[0] + '…'

def it_gloss(w, pos, en_senses):
    recs = it_recs.get(w, [])
    # 1) forma flessa: stessa forma dello stesso lemma
    for g, fo, tags in en_senses:
        for lemma in fo:
            for p, ss in recs:
                for ig, ifo, _ in ss:
                    if lemma in ifo and ig: return short(ig)
            if 'alt-of' in tags or 'alternative' in tags: return f'variante di {lemma}'
            return f'forma di {lemma}'
    # 2) lemma: prima definizione italiana con la stessa categoria grammaticale
    ok = POS_EQ.get(pos, {pos})
    for p, ss in recs:
        if p in ok:
            for ig, ifo, _ in ss:
                if ig and not ifo: return short(ig)
    return POS_IT.get(pos, '')

n = 0
with open(out_path, 'w', encoding='utf-8') as o:
    for key, forms in sorted(targets.items()):
        word = key  # chiave = grafia senza segni
        desc = {}
        for pos, ipa, ss in en_recs.get(word, []):
            a = analyze(word, ipa)
            if not a or a['stress'] is None: continue
            m = mark(word, a).translate(NOSZ)
            g = it_gloss(word, pos, ss)
            if not g: continue
            lst = desc.setdefault(m, [])
            if g not in lst: lst.append(g)
        # una descrizione assegnata a due pronunce diverse non distingue niente: si scarta
        count = {}
        for lst in desc.values():
            for g in lst: count[g] = count.get(g, 0) + 1
        for m in desc:
            keep = [g for g in desc[m] if count[g] == 1]
            if len(keep) > 1: keep = [g for g in keep if g not in POS_IT.values()] or keep
            desc[m] = keep
        parts = []
        for f in forms:
            d = desc.get(f.translate(NOSZ))
            if d: parts.append(f + '=' + ' · '.join(d[:2]).replace('|', '/'))
        if len(parts) >= 1:
            o.write(key + '\t' + '|'.join(parts) + '\n'); n += 1
print('omografi descritti:', n, 'su', len(targets))
