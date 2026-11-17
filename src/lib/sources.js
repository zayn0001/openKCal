// Where a food's numbers come from, in words.
const SOURCES = {
  IFCT: 'Indian Food Composition Tables 2017 (NIN)',
  USDA: 'USDA FNDDS 2021–2023',
  OFF: 'Open Food Facts (crowd-sourced)',
}
export const sourceLabel = (food) =>
  food.kind === 'dish'
    ? food.authorName
      ? `Recipe by ${food.authorName}`
      : 'Your dish'
    : food.authorName
      ? `Shared by ${food.authorName}`
      : SOURCES[food.source] || 'Your food'

/** The short tag shown next to a food in lists. */
export const sourceTag = (food) =>
  food.kind === 'dish'
    ? food.authorName
      ? 'Recipe'
      : 'My dish'
    : food.authorName
      ? 'Shared'
      : food.source === 'OFF'
        ? 'Packaged'
        : food.source || 'Mine'

