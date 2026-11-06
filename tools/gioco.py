"""Step 3: data/frequenti.txt = righe del lessico per le 20.000 parole italiane più frequenti, in ordine di frequenza."""
import sys, unicodedata
from wordfreq import top_n_list
lex_path, out = sys.argv[1:3]
STRIP = str.maketrans('àèéìíòóùúṡż', 'aeeiioouusz')
idx = {}
for line in open(lex_path, encoding='utf-8'):
    line = line.rstrip('\n')
    word, _, rest = line.rpartition('\t')
    prim = rest.split('~')[0].split(';')[0].rstrip('!')
    idx.setdefault(word or prim.translate(STRIP), []).append(line)
n = 0
with open(out, 'w', encoding='utf-8') as o:
    for w in top_n_list('it', 40000):
        k = w
        if k in idx and len(w) > 1:
            # se la parola ha accento finale ortografico, scegli la riga corrispondente
            cands = idx[k]
            pick = cands[0]
            o.write(pick + '\n'); n += 1
            if n >= 20000: break
print(n)
