"""Build src/foods-data.json from IFCT 2017 and USDA FNDDS.

Usage: python scripts/build_foods.py path/to/FoodData_Central_survey_food_csv_<date>
  data/ifct.json  comes from scripts/extract_ifct.py
  the FNDDS folder is the unzipped "Survey Foods (FNDDS)" CSV download from
  https://fdc.nal.usda.gov/download-datasets

Output rows: [id, name, kcal, protein, carbs, fat, fibre, [[portion, grams], ...]],
all per 100 g. Note IFCT carbohydrate excludes fibre; FNDDS carbohydrate includes it.
"""
import csv, json, re, sys
from collections import defaultdict
from pathlib import Path

root = Path(__file__).resolve().parent.parent
r1 = lambda v: round(float(v or 0), 1)
rows = []

for f in json.load(open(root / 'data' / 'ifct.json', encoding='utf-8')):
    g = lambda k: f.get(k, 0)
    rows.append([f"ifct:{f['code']}", f['name'], round(f['kj'] / 4.184), r1(g('protein')), r1(g('carbs')), r1(g('fat')), r1(g('fibre')), []])

fndds = Path(sys.argv[1])
read = lambda name: csv.DictReader(open(fndds / f'{name}.csv', encoding='utf-8', newline=''))
# This file keys nutrients by their legacy number (nutrient.csv nutrient_nbr), not id.
WANT = {'208': 'kcal', '203': 'protein', '205': 'carbs', '204': 'fat', '291': 'fibre'}
nutrients = defaultdict(dict)
for n in read('food_nutrient'):
    if n['nutrient_id'] in WANT:
        nutrients[n['fdc_id']][WANT[n['nutrient_id']]] = n['amount']
portions = defaultdict(list)
for p in sorted(read('food_portion'), key=lambda p: int(p['seq_num'] or 0)):
    grams, desc = float(p['gram_weight'] or 0), p['portion_description'].strip()
    if grams > 0 and desc and 'not specified' not in desc.lower() and len(portions[p['fdc_id']]) < 4:
        portions[p['fdc_id']].append([re.sub(r'^1 ', '', desc), grams])  # "1 cup" -> "cup"
codes = {s['fdc_id']: s['food_code'] for s in read('survey_fndds_food')}
skipped = 0
for f in read('food'):
    n = nutrients[f['fdc_id']]
    if 'kcal' not in n:
        skipped += 1
        continue
    rows.append([f"fndds:{codes[f['fdc_id']]}", f['description'], round(float(n['kcal'])), r1(n.get('protein')),
                 r1(n.get('carbs')), r1(n.get('fat')), r1(n.get('fibre')), portions[f['fdc_id']]])

out = root / 'src' / 'foods-data.json'
out.write_text(json.dumps(rows, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print(f'{len(rows)} foods ({skipped} FNDDS rows without energy skipped), {out.stat().st_size // 1024} KB')
