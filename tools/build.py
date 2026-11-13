"""Step 2: costruisce data/lessico.txt (una riga per parola: forma segnata, ~varianti, ;omografi)."""
import pickle, sys, collections
from ipa import analyze, mark, orth_vowels, ORTHV
raw, out = sys.argv[1:3]
recs, forms = pickle.load(open(raw, 'rb'))

def rec_analyses(w, ipas, src):
    res = []
    for item in ipas:
        ipa, tags = item if isinstance(item, tuple) else (item, ())
        a = analyze(w, ipa)
        if a and a['stress'] is not None:
            a['tags'] = tags; a['src'] = src
            res.append(a)
    return res

# etichette di Wiktionary -> codice breve (il testo per esteso è in js/rules.js, VARIANTI)
def tag_code(tags):
    t = ' '.join(tags).lower()
    if not t: return ''
    if 'proscribed' in t or 'nonstandard' in t or 'sconsigl' in t: return 'P'
    if any(k in t for k in ('northern', 'milan', 'lombardy', 'settentrional', 'switzerland')): return 'N'
    if 'rome' in t or 'roman' in t: return 'Rm'
    if 'tuscan' in t: return 'To'
    if 'central-and-southern' in t or 'southern' in t: return 'CS'
    if 'traditional' in t or 'careful' in t or 'elevated' in t or 'formal' in t: return 'T'
    if 'regional' in t or 'dialectal' in t: return 'Rg'
    return ''

STRESSED = 'àèéìòóù'
def diff_types(P, v):
    """che cosa cambia tra forma principale e variante: A accento, V timbro e/o, S s, Z z"""
    if len(P) != len(v): return 'A'
    stress = lambda w: next((i for i, c in enumerate(w) if c in STRESSED), -1)
    sp, sv = stress(P), stress(v)
    t = ''
    if sp != sv: t += 'A'
    elif sp >= 0 and P[sp] != v[sp]: t += 'V'
    pairs = {(a, b) for a, b in zip(P, v) if a != b}
    if any({a, b} == {'s', 'ṡ'} for a, b in pairs): t += 'S'
    if any({a, b} == {'z', 'ż'} for a, b in pairs): t += 'Z'
    return t or 'V'

def variant_str(P, v, info):
    code = diff_types(P, v)
    if info:
        if 'it' in info['src']: code += '+'          # registrata anche dall'edizione italiana
        tc = next((tag_code(tg) for tg in info['tags'] if tag_code(tg)), '')
        if info.get('moderna'): tc = tc or 'M'
        if tc: code += ':' + tc
    return v + '@' + code

import re
SORDA_TRAD = re.compile(r'^(cas[aeio]|cas[ae]tt|cos[aeio]$|cos[iì]$|nas[oi]$|mes[ei]$|pes[oi]$)')
lex = {}   # word -> (primary, variants[list], homographs[list], analysis)
for w, rs in recs.items():
    by_src = {'it': [], 'en': []}
    for src, pos, ipas in rs:
        if src in by_src and ipas:
            an = rec_analyses(w, ipas, src)
            if an: by_src[src].append(an)
    if not by_src['it'] and not by_src['en']: continue
    first = lambda src: by_src[src][0][0] if by_src[src] else None
    va = first('it') or first('en')
    sa = None; za = None
    for src in ('it', 'en'):
        for an in by_src[src]:
            for a in an:
                if sa is None and a['s'] is not None: sa = a
    for src in ('it', 'en'):
        for an in by_src[src]:
            for a in an:
                if za is None and a['z'] is not None: za = a
    prim = dict(va); prim['s'] = (sa or va)['s'] or {}; prim['z'] = (za or va)['z'] or {}
    P = mark(w, prim)
    # omografi: record diversi della stessa fonte con forma primaria diversa
    hom = []
    for src in ('it', 'en'):
        sets = [set(mark(w, dict(a, s=prim['s'], z=prim['z'])) for a in an) for an in by_src[src]]
        prs = []
        for i, si in enumerate(sets):
            m = mark(w, dict(by_src[src][i][0], s=prim['s'], z=prim['z']))
            if m in prs: continue
            if all(si.isdisjoint(sj) or si == sj for sj in sets) and any(si.isdisjoint(sj) for sj in sets):
                prs.append(m)
        if len(prs) > 1:
            hom = [m for m in prs if m != P]; break
    var = []; info = {}
    for src in ('it', 'en'):
        for an in by_src[src]:
            for a in an:
                m = mark(w, dict(a, s=a['s'] if a['s'] is not None else prim['s'], z=a['z'] if a['z'] is not None else prim['z']))
                if m == P or m in hom: continue
                if m not in var: var.append(m)
                inf = info.setdefault(m, {'src': set(), 'tags': []})
                inf['src'].add(src)
                if a['tags']: inf['tags'].append(a['tags'])
    # dizione tradizionale: s intervocalica sorda in casa/cosa/così, -oso/-osa e poche altre (vedi Teoria, regola S6)
    if 'ṡ' in P and (SORDA_TRAD.search(w) or re.search(r'óṡ([oaie]$|issim|aménte)', P)):
        alt = next((v for v in var if v == P.replace('ṡ', 's')), None)
        if alt:
            info[P] = {'src': set(info.get(alt, {}).get('src', set())) | {'it', 'en'}, 'tags': [], 'moderna': True}
            var = [P] + [v for v in var if v != alt]; P = alt
    var = [variant_str(P, v, info.get(v)) for v in var]
    lex[w] = (P, var, hom, prim)

print('voci con pronuncia:', len(lex))

# ---------- forme flesse ----------
def lcp(a, b):
    n = 0
    while n < min(len(a), len(b)) and a[n] == b[n]: n += 1
    return n
def nvow_after(w, i):
    return sum(1 for j in orth_vowels(w) if j > i)
def copy_sz(form, lemma_marked, L):
    f = list(form)
    for i in range(min(L, len(lemma_marked))):
        if lemma_marked[i] in 'ṡż': f[i] = lemma_marked[i]
    return f

ENDINGS = """avàmo avàte àvano àvo àvi àva evàmo evàte évano évo évi éva ivàmo ivàte ìvano ìvo ìvi ìva
rò rài rà rémo réte rànno rèi résti rèbbe rémmo réste rèbbero
ài àsti àmmo àste àrono éi ésti émmo éste érono ètti ètte èttero ìi ìsti ìmmo ìste ìrono
àssi àsse àssimo àssero éssi ésse éssimo éssero ìssi ìsse ìssimo ìssero
iàmo àte éte ìte àto àta àti ùto ùta ùti ùte ìto ìta ìti ànte ènte ànti ènti àndo èndo àre ìre""".split()
ENDINGS.sort(key=len, reverse=True)
BASEC = {'à':'a','è':'e','é':'e','ì':'i','ò':'o','ó':'o','ù':'u'}
def strip(e): return ''.join(BASEC.get(c, c) for c in e)
def finish_ending(e):
    # a/i/u accentate restano segnate solo se sdrucciole
    k = next(i for i, c in enumerate(e) if c in BASEC)
    after = sum(1 for c in e[k+1:] if c in 'aeiou')
    if e[k] in 'àìù' and after < 2: e = e[:k] + BASEC[e[k]] + e[k+1:]
    return e

def rhizotonic(tags):
    t = set(tags)
    if 'present' in t and ('indicative' in t or 'subjunctive' in t):
        return 'singular' in t or ('third-person' in t and 'plural' in t)
    if 'imperative' in t:
        return 'singular' in t or ('third-person' in t and 'plural' in t)
    return False

form_by_lemma = collections.defaultdict(list)
for fw, lemma, pos, tags in forms:
    form_by_lemma[lemma].append((fw, pos, tags))
derived = {}   # key -> list of marked
ACC = 'àèéìíòóùú'
def plain_key(f):
    # toglie gli accenti non finali (quelli di Wiktionary), tiene l'accento finale ortografico
    out = []
    for i, c in enumerate(f):
        if c in ACC and i != len(f) - 1: c = BASEC.get(c, {'í':'i','ú':'u'}.get(c, c))
        out.append(c)
    return ''.join(out)
def from_accented(f, key, lemma_marked, lemma):
    w = list(key)
    k = next((i for i, c in enumerate(f) if c in ACC), None)
    if k is None: return None
    c = f[k]
    if c in 'àìùíú':
        after = sum(1 for x in f[k+1:] if x in 'aeiou')
        if after >= 2 or k == len(f) - 1: w[k] = {'í':'ì','ú':'ù'}.get(c, c)
    else:
        w[k] = c
    L = min(lcp(key, lemma), len(lemma_marked))
    for i in range(L):
        if lemma_marked[i] in 'ṡż' and i != k: w[i] = lemma_marked[i]
    return ''.join(w)

# imperativi con pronome attaccato (arrèstati, fèrmati, àlzati): scritti come altre forme
# (arrestati participio) ma pronunciati diversamente. key -> forme segnate dell'imperativo
CLITICO = re.compile(r'(mi|ti|si|ci|vi|lo|la|li|le|ne|gli|glie\w+|melo|mela|telo|tela|celo|cela|selo|sela|velo|vela)$')
IMPCL = collections.defaultdict(set)
NOSZ = str.maketrans('ṡż', 'sz')
for lemma, fl in form_by_lemma.items():
    if lemma not in lex: continue
    LP, _, _, la = lex[lemma]
    for fw, pos, tags in fl:
        key = plain_key(fw)
        if 'imperative' in tags and CLITICO.search(key) and any(c in ACC for c in fw[:-1]):
            mi = from_accented(fw, key, LP, lemma)
            if mi: IMPCL[key].add(mi.translate(NOSZ))
        if key in lex or key == lemma: continue
        if any(c in ACC for c in fw[:-1]) or (fw[-1] in ACC and any(c in ACC for c in fw)):
            m = from_accented(fw, key, LP, lemma)
        else:
            s = la['stress']; L = lcp(fw, lemma); m = None
            if s is not None and s < L and nvow_after(fw, s) == nvow_after(lemma, s):
                f = list(fw); f[:L] = list(LP[:L]); m = ''.join(f)
        if m:
            lst = derived.setdefault(key, [])
            if m not in lst: lst.append(m)
print('forme derivate:', len(derived))

STRIPALL = str.maketrans('àèéìíòóùúṡż', 'aeeiioouusz')
with open(out, 'w') as o:
    for w in sorted(set(lex) | set(derived)):
        imp = IMPCL.get(w, set())
        isImp = lambda f: f.translate(NOSZ) in imp
        if w in lex:
            P, var, hom, _ = lex[w]
            cands = [P] + list(hom)
            if any(map(isImp, cands)) and not all(map(isImp, cands)):
                # la lettura principale è quella che non è un imperativo con pronome (arrestati participio)
                P = next(c for c in cands if not isImp(c))
                hom = [c for c in cands if c != P]
            line = P + ''.join('~' + v for v in var) + ''.join(';' + h + ('@I' if isImp(h) else '') for h in hom)
        else:
            cands = derived[w]
            if any(map(isImp, cands)) and not all(map(isImp, cands)):
                altri = [c for c in cands if not isImp(c)]
                P = altri[0]
                vari = [v for v in altri[1:] if any(c in 'àèéìòóù' for c in v)]
                line = P + ''.join('~' + variant_str(P, v, None) for v in vari) + ''.join(';' + h + '@I' for h in cands if isImp(h)) + '!'
            else:
                dl = [cands[0]] + [v for v in cands[1:] if any(c in 'àèéìòóù' for c in v)]
                derived[w] = dl
                line = derived[w][0] + ''.join('~' + variant_str(derived[w][0], v, None) for v in derived[w][1:]) + '!'   # ! = forma flessa derivata
        prim = line.split('~')[0].split(';')[0].rstrip('!')
        assert '@' not in prim
        if prim.translate(STRIPALL) != w:
            line = w + '\t' + line      # grafia con accento ortografico (città, però, tè)
        o.write(line + '\n')
