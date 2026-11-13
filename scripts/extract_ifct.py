"""Extract IFCT 2017 Table 1 (proximates, per 100 g edible portion) from the PDF.

Usage: python scripts/extract_ifct.py path/to/IFCT2017.pdf > data/ifct.json
Needs pymupdf. Rows are matched by word coordinates, then each one is checked
against the book's own energy formula; rows that fail are dropped and reported.
"""
import json, re, sys
import fitz

# Table 1 has two layouts. Each: PDF page indexes, x-range of the code column,
# x-range of the food name, and the left edge (pt) where each value column ends.
PLANT = dict(pages=range(40, 57), code=(0, 70), name=(70, 275), minx=300, cols=[
    (365, 'water'), (425, 'protein'), (475, 'ash'), (530, 'fat'), (590, 'fibre'),
    (645, 'fib_ins'), (700, 'fib_sol'), (762, 'carbs'), (9999, 'kj')])
ANIMAL = dict(pages=range(57, 68), code=(70, 110), name=(112, 295), minx=335, cols=[
    (425, 'water'), (515, 'protein'), (595, 'ash'), (690, 'fat'), (9999, 'kj')])
NUM = re.compile(r'^(\d+(?:\.\d+)?)(?:\D.*)?$')  # "9.20±0.40" -> 9.20

doc = fitz.open(sys.argv[1])
foods, bad = [], []
for lay in (PLANT, ANIMAL):
    for pn in lay['pages']:
        words = doc[pn].get_text('words')
        codes = [(w[1], w[4]) for w in words
                 if lay['code'][0] < w[0] < lay['code'][1] and re.fullmatch(r'[A-T]\d{3}', w[4])]
        for y, code in codes:
            row = {'code': code}
            for w in words:
                if w[0] > lay['minx'] and abs(w[1] - y) < 3 and (m := NUM.match(w[4])):
                    row[next(n for edge, n in lay['cols'] if w[0] < edge)] = float(m.group(1))
            # A wrapped name straddles the row, so take words nearest this code.
            name = [w for w in words if lay['name'][0] < w[0] < lay['name'][1] and abs(w[1] - y) < 9
                    and min(codes, key=lambda c: abs(c[0] - w[1]))[1] == code]
            name.sort(key=lambda w: (round(w[1] / 4), w[0]))
            row['name'] = re.sub(r'\s*\(.*', '', ' '.join(w[4] for w in name)).strip(' ,')
            g = lambda k: row.get(k, 0)  # blank cell = below detectable limit
            # The book's energy: 17 kJ/g protein and carbohydrate, 37 fat, 8 soluble fibre.
            calc = 17 * g('protein') + 37 * g('fat') + 17 * g('carbs') + 8 * g('fib_sol')
            tol = max(15, 0.03 * g('kj'))
            # Animal rows list no carbohydrate, so shellfish (glycogen) may run above calc.
            ok = row['name'] and 'kj' in row and -tol <= row['kj'] - calc <= (150 if lay is ANIMAL else tol)
            (foods if ok else bad).append(row)

print(f'{len(foods)} ok, {len(bad)} rejected', file=sys.stderr)
for b in bad:
    print('REJECTED', b, file=sys.stderr)
json.dump(foods, sys.stdout, ensure_ascii=False, indent=0)
