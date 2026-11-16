// One row of the generated catalogue (src/foods-data.json, built by scripts/build_foods.py)
// as a food: [id, name, kcal, protein, carbs, fat, fibre, portions, sugar, satFat, sodium].
// Shared by the app and the server, so both search the same foods.
export const rowToFood = ([id, name, kcal, protein, carbs, fat, fibre, portions, sugar, satFat, sodium]) => ({
  id,
  name,
  source: id.startsWith('ifct') ? 'IFCT' : 'USDA',
  per100: {
    kcal, protein, carbs, fat, fibre,
    ...(sugar != null && { sugar }),
    ...(satFat != null && { satFat }),
    ...(sodium != null && { sodium }),
  },
  portions: portions.map(([name, grams]) => ({ name, grams })),
})
