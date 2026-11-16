// Where a food's numbers come from, in words.
const SOURCES = {
  IFCT: 'Indian Food Composition Tables 2017 (NIN)',
  USDA: 'USDA FNDDS 2021–2023',
  OFF: 'Open Food Facts (crowd-sourced)',
}
export const sourceLabel = (food) => (food.kind === 'dish' ? 'Your dish' : SOURCES[food.source] || 'Your food')
/** The short tag shown next to a food in lists. */
export const sourceTag = (food) => (food.kind === 'dish' ? 'My dish' : food.source === 'OFF' ? 'Packaged' : food.source || 'Mine')
