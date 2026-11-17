"""Confronto con altre edizioni di Wiktionary (sezioni sulle parole ITALIANE, pronuncia italiana).

Per ogni fonte: quante parole italiane hanno una trascrizione IPA, quante sono nuove rispetto al lessico,
e quanto il timbro della vocale accentata (è/é, ò/ó), la posizione dell'accento e la s/z sonora
coincidono con la forma principale del lessico.

Uso: python3 confronta.py ../data/lessico.txt fr-it.jsonl de-it.jsonl …  → stampa il riepilogo
     e scrive ../data/confronto.json (pronunce delle altre fonti, usate da build.py e dalla Teoria)
"""
import sys, json, re, collections
from ipa import analyze, mark

lex_path, *fonti = sys.argv[1:]
STRIP = str.maketrans('àèéìíòóùúṡż', 'aeeiioouusz')
lessico = {}
for line in open(lex_path, encoding='utf-8'):
    line = line.rstrip('\n')
    key, _, body = line.rpartition('\t')
    prim = body.rstrip('!').split(';')[0].split('~')[0].split('@')[0]
    lessico[key or prim.translate(STRIP)] = prim

def ok(w):
    return w and w.isalpha() and w[0].islower() and ' ' not in w

def ipa_di(d):
    out = []
    for s in d.get('sounds', []) or []:
        i = s.get('ipa')
        if i and not re.search(r'[a-z]{4,} [a-z]{4,}', i):      # scarta note in prosa finite nel campo IPA
            out.append(i)
    return out

def tratti(w, m):
    """(posizione accento, timbro e/o, sonorità s/z) di una forma segnata"""
    st = next((i for i, c in enumerate(m) if c in 'àèéìòóù'), -1)
    q = 'open' if st >= 0 and m[st] in 'èò' else 'closed' if st >= 0 and m[st] in 'éó' else None
    return st, q, tuple(i for i, c in enumerate(m) if c == 'ṡ'), tuple(i for i, c in enumerate(m) if c == 'ż')

risultati = {}
pronunce = collections.defaultdict(dict)       # parola -> fonte -> forma segnata
for path in fonti:
    nome = path.split('/')[-1].split('-')[0]
    c = collections.Counter()
    with open(path, encoding='utf-8') as f:
        for line in f:
            try: d = json.loads(line)
            except Exception: continue
            if d.get('lang_code') not in (None, 'it'): continue
            w = d.get('word', '')
            if not ok(w): continue
            for ipa in ipa_di(d)[:1]:
                a = analyze(w, ipa)
                if not a or a['stress'] is None: continue
                m = mark(w, dict(a, s=a['s'] or {}, z=a['z'] or {}))
                pronunce[w][nome] = m
                c['con_ipa'] += 1
                if w not in lessico: c['nuove'] += 1; continue
                p = lessico[w]
                if len(p) != len(m): continue
                tp, tm = tratti(w, p), tratti(w, m)
                # accento: confrontabile solo se entrambe le forme lo segnano (le piane con a/i/u non hanno segni)
                if tp[0] >= 0 and tm[0] >= 0:
                    c['acc_tot'] += 1; c['acc_ok'] += tp[0] == tm[0]
                if tp[1] and tm[1] and tp[0] == tm[0]:
                    c['eo_tot'] += 1; c['eo_ok'] += tp[1] == tm[1]
                if 's' in w and a['s'] is not None:
                    c['s_tot'] += 1; c['s_ok'] += tp[2] == tm[2]
    risultati[nome] = c

print(f"{'fonte':6} {'con IPA':>8} {'nuove':>7} {'accento':>14} {'è/é ò/ó':>14} {'s sonora':>14}")
pc = lambda c, k: f"{c[k + '_ok'] / c[k + '_tot'] * 100:5.1f}% ({c[k + '_tot']})" if c[k + '_tot'] else '      —'
for nome, c in risultati.items():
    print(f"{nome:6} {c['con_ipa']:8} {c['nuove']:7} {pc(c, 'acc'):>14} {pc(c, 'eo'):>14} {pc(c, 's'):>14}")
json.dump(pronunce, open('../data/confronto.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('parole con almeno un secondo parere:', len(pronunce))
