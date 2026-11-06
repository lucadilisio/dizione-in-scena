"""Conversione IPA -> analisi (accento, timbro e/o, sonorità s/z) allineata all'ortografia."""
import re, unicodedata
VOW = set('aeɛioɔu')
ORTHV = {'a':'a','e':'e','i':'i','o':'o','u':'u','à':'a','è':'e','é':'e','ì':'i','í':'i','ò':'o','ó':'o','ù':'u','ú':'u','î':'i'}
CLS = {'a':'a','e':'e','ɛ':'e','i':'i','o':'o','ɔ':'o','u':'u'}

def tokenize(ipa):
    s = ipa.strip()
    s = s.strip('/[]* ')
    s = s.replace('͡', '').replace('‿', '').replace('ˌ', '').replace('.', '').replace('ː', '').replace(':', '').replace(' ', '')
    s = s.replace('ɡ', 'g').replace('ʦ', 'ts').replace('ʣ', 'dz').replace('ʧ', 'tʃ').replace('ʤ', 'dʒ')
    s = s.replace('(', '').replace(')', '')
    out = []  # (ph, stressed_flag_marker)
    i = 0; stress_next = False
    while i < len(s):
        c = s[i]
        if c in "ˈ'": stress_next = True; i += 1; continue
        if s[i:i+2] in ('ts', 'dz', 'tʃ', 'dʒ'):
            out.append([s[i:i+2], False]); i += 2; continue
        if c in VOW:
            glide = i + 1 < len(s) and s[i+1] == '̯'
            if glide:
                out.append(['j' if c == 'i' else 'w' if c == 'u' else c, False]); i += 2; continue
            out.append([c, stress_next]); stress_next = False; i += 1; continue
        if unicodedata.combining(c): i += 1; continue
        out.append([c, False]); i += 1
    # collassa geminate
    res = []
    for ph, st in out:
        if res:
            p = res[-1][0]
            if p == ph and ph not in VOW: continue
            if (p, ph) in (('t', 'ts'), ('d', 'dz'), ('t', 'tʃ'), ('d', 'dʒ')):
                res[-1] = [ph, st]; continue
        res.append([ph, st])
    vowels = [k for k, (ph, _) in enumerate(res) if ph in VOW]
    if not any(st for _, st in res) and len(vowels) == 1:
        res[vowels[0]][1] = True
    return res

def orth_vowels(w):
    return [i for i, c in enumerate(w) if c in ORTHV]

def s_groups(w):
    """indici di inizio dei gruppi di 's' pronunciati come s/z (esclude sc+e/i = ʃ)."""
    g = []; i = 0; n = len(w)
    while i < n:
        if w[i] == 's':
            j = i
            while j < n and w[j] == 's': j += 1
            if j < n and w[j] == 'c' and j + 1 < n and w[j+1] in 'eièéì' and j - i == 1:
                i = j; continue
            g.append(i); i = j; continue
        i += 1
    return g

def z_groups(w):
    g = []; i = 0
    while i < len(w):
        if w[i] == 'z':
            g.append(i)
            while i < len(w) and w[i] == 'z': i += 1
            continue
        i += 1
    return g

def analyze(word, ipa):
    """ritorna dict(stress=idx|None, q='open'|'closed'|None, nafter=int, s={idx:'s'|'z'}, z={idx:'ts'|'dz'}) o None"""
    if any(c in word for c in 'xyjkw'): return None
    toks = tokenize(ipa)
    iv = [(ph, st) for ph, st in toks if ph in VOW]
    ov = orth_vowels(word)
    # allineamento dalla fine
    p = len(iv) - 1; q = len(ov) - 1; match = {}
    while p >= 0 and q >= 0:
        letter = ORTHV[word[ov[q]]]
        if CLS[iv[p][0]] == letter:
            match[p] = ov[q]; p -= 1; q -= 1
        elif letter in 'iu':
            q -= 1
        else:
            return None
    if p >= 0: return None
    res = {'stress': None, 'q': None, 'nafter': None, 's': {}, 'z': {}}
    for k, (ph, st) in enumerate(iv):
        if st:
            res['stress'] = match[k]
            res['q'] = 'open' if ph in 'ɛɔ' else 'closed' if ph in 'eo' else None
            res['nafter'] = len(iv) - 1 - k
    sg = s_groups(word); ipas_s = [ph for ph, _ in toks if ph in ('s', 'z')]
    if len(sg) == len(ipas_s):
        res['s'] = dict(zip(sg, ipas_s))
    elif sg:
        res['s'] = None
    zg = z_groups(word); ipas_z = [ph for ph, _ in toks if ph in ('ts', 'dz')]
    if len(zg) == len(ipas_z):
        res['z'] = dict(zip(zg, ipas_z))
    elif zg:
        res['z'] = None
    return res

GRAVE = {'a':'à','i':'ì','u':'ù','e':'è','o':'ò'}
ACUTE = {'e':'é','o':'ó'}
BASE = {'à':'a','è':'e','é':'e','ì':'i','í':'i','ò':'o','ó':'o','ù':'u','ú':'u','î':'i'}

def mark(word, a, atonic=False):
    """costruisce la forma segnata completa (tutti i segni; il filtro per categoria lo fa il motore JS)."""
    w = list(word)
    st = a.get('stress')
    if st is not None and not atonic:
        base = BASE.get(w[st], w[st])
        if base in 'eo' and a['q']:
            w[st] = GRAVE[base] if a['q'] == 'open' else ACUTE[base]
        elif base in 'aiu':
            if a['nafter'] >= 2 or (a['nafter'] == 0 and st == len(w) - 1 and len(orth_vowels(word)) > 1):
                w[st] = GRAVE[base]
    for i, v in (a.get('s') or {}).items():
        if v == 'z': w[i] = 'ṡ'
    for i, v in (a.get('z') or {}).items():
        if v == 'dz':
            w[i] = 'ż'
            j = i + 1
            while j < len(w) and w[j] == 'z': w[j] = 'ż'; j += 1
    return ''.join(w)

if __name__ == '__main__':
    tests = [('bello','/ˈbɛl.lo/'),('rosa','/ˈrɔ.za/'),('cielo','/ˈtʃɛ.lo/'),('mai','/ˈmai̯/'),('zucchero','/ˈd͡zuk.ke.ro/'),
             ('pranzo','/ˈprandzo/'),('mezzo','/ˈmɛd:zo/'),('perché','/per.ˈke/'),('piede','/ˈpjɛ.de/'),('ieri','/ˈjɛ.ri/'),
             ('scienza','/ˈʃɛn.tsa/'),('rubrica','/ruˈbri.ka/'),('alacre','/ˈa.la.kre/'),('sbaglio','/ˈzbaʎ.ʎo/'),('chiesa','/ˈkjɛ.za/'),
             ('guaio','/ˈɡwa.jo/'),('uomo','/ˈwɔ.mo/'),('organizzazione','/or.ɡa.nid.dzat.ˈtsjo.ne/')]
    for w, i in tests:
        a = analyze(w, i); print(w, i, '->', mark(w, a) if a else None, a and a['nafter'])
