/**
 * Ingredient Categorization Helper
 * Maps ingredients to categories for diet validation
 */

/**
 * Comprehensive ingredient category mapping
 */
export const INGREDIENT_CATEGORY_MAP: Record<string, string[]> = {
  // Grains (English + Dutch for NEVO/UI names)
  grains: [
    'wheat',
    'rice',
    'rijst',
    'oats',
    'haver',
    'barley',
    'gerst',
    'rye',
    'rogge',
    'quinoa',
    'corn',
    'maïs',
    'buckwheat',
    'millet',
    'spelt',
    'kamut',
    'amaranth',
    'teff',
    'sorghum',
    'bulgur',
    'couscous',
    'farro',
    'freekeh',
    'wheat_berries',
    'pasta',
    'brood',
    'tarwe',
  ],

  // Dairy (English + Dutch)
  dairy: [
    'milk',
    'melk',
    'cheese',
    'kaas',
    'yogurt',
    'yoghurt',
    'butter',
    'boter',
    'cream',
    'room',
    'sour_cream',
    'kefir',
    'ghee',
    'buttermilk',
    'kwark',
    'cottage_cheese',
    'ricotta',
    'mozzarella',
    'cream_cheese',
    'mascarpone',
    'zuivel',
  ],

  // Legumes (English + Dutch)
  legumes: [
    'beans',
    'bonen',
    'lentils',
    'linzen',
    'chickpeas',
    'kikkererwten',
    'peas',
    'erwten',
    'soy',
    'soja',
    'tofu',
    'tempeh',
    'peanuts',
    'pinda',
    'black_beans',
    'kidney_beans',
    'pinto_beans',
    'navy_beans',
    'lima_beans',
    'fava_beans',
    'edamame',
    'mung_beans',
    'adzuki_beans',
    'peulvruchten',
  ],

  // Nightshades (English + Dutch)
  nightshades: [
    'tomato',
    'tomaat',
    'potato',
    'aardappel',
    'eggplant',
    'aubergine',
    'bell_pepper',
    'chili_pepper',
    'paprika',
    'cayenne',
    'goji_berry',
    'tomatillo',
    'ground_cherry',
    'pepino',
    'nachtschades',
  ],

  // Processed sugar (English + Dutch)
  processed_sugar: [
    'sugar',
    'suiker',
    'sucrose',
    'fructose',
    'high_fructose_corn_syrup',
    'cane_sugar',
    'brown_sugar',
    'powdered_sugar',
    'maple_syrup',
    'agave',
    'corn_syrup',
    'honey', // Note: Honey is allowed in SCD but forbidden in others
  ],

  // Meat categories
  meat: [
    'beef',
    'pork',
    'lamb',
    'veal',
    'bacon',
    'sausage',
    'ham',
    'prosciutto',
  ],
  red_meat: ['beef', 'lamb', 'veal', 'bison', 'venison', 'elk', 'buffalo'],
  white_meat: ['chicken', 'turkey', 'duck', 'goose', 'pheasant', 'quail'],
  poultry: [
    'chicken',
    'turkey',
    'duck',
    'goose',
    'pheasant',
    'quail',
    'cornish_hen',
  ],

  // Fermented foods
  fermented_foods: [
    'sauerkraut',
    'kimchi',
    'kombucha',
    'miso',
    'tempeh',
    'kefir',
    'yogurt',
    'sourdough',
    'pickles',
    'fermented_vegetables',
    'natto',
  ],

  // Aged cheese
  aged_cheese: [
    'parmesan',
    'blue_cheese',
    'cheddar',
    'gouda',
    'swiss',
    'brie',
    'camembert',
    'roquefort',
    'stilton',
    'manchego',
    'pecorino',
    'asiago',
    'gruyere',
  ],

  // Shellfish
  shellfish: [
    'shrimp',
    'lobster',
    'crab',
    'mussel',
    'oyster',
    'clam',
    'scallop',
    'crayfish',
    'prawn',
    'langoustine',
    'abalone',
    'conch',
  ],

  // Starches
  starches: [
    'potato',
    'corn',
    'rice',
    'wheat',
    'barley',
    'oats',
    'quinoa',
    'sweet_potato',
    'yam',
    'taro',
    'cassava',
    'plantain',
    'breadfruit',
  ],

  // Organ meats
  organ_meats: [
    'liver',
    'heart',
    'kidney',
    'brain',
    'tongue',
    'sweetbreads',
    'tripe',
    'gizzard',
    'pate',
    'foie_gras',
  ],

  // Seaweed
  seaweed: [
    'seaweed',
    'kelp',
    'nori',
    'dulse',
    'wakame',
    'kombu',
    'arame',
    'hijiki',
    'irish_moss',
    'sea_lettuce',
  ],

  // Wahls Paleo vegetable categories
  leafy_vegetables: [
    'spinach',
    'kale',
    'lettuce',
    'chard',
    'collard_greens',
    'arugula',
    'bok_choy',
    'cabbage',
    'watercress',
    'mustard_greens',
    'turnip_greens',
    'beet_greens',
    'dandelion_greens',
  ],

  sulfur_vegetables: [
    'broccoli',
    'cauliflower',
    'cabbage',
    'brussels_sprouts',
    'onion',
    'garlic',
    'leek',
    'shallot',
    'scallion',
    'chive',
    'asparagus',
    'kohlrabi',
  ],

  colored_vegetables: [
    'carrot',
    'beet',
    'bell_pepper',
    'sweet_potato',
    'pumpkin',
    'squash',
    'tomato',
    'red_cabbage',
    'purple_cabbage',
    'radish',
    'turnip',
    'rutabaga',
  ],

  // Nuts
  nuts: [
    'almond',
    'walnut',
    'cashew',
    'pistachio',
    'pecan',
    'hazelnut',
    'brazil_nut',
    'macadamia',
    'pine_nut',
    'peanut', // Note: Peanut is technically a legume
  ],

  // Seeds
  seeds: [
    'sesame',
    'sunflower',
    'pumpkin',
    'chia',
    'flax',
    'hemp',
    'poppy',
    'quinoa', // Note: Quinoa is technically a seed
  ],

  // Eggs
  eggs: ['egg', 'egg_yolk', 'egg_white', 'duck_egg', 'quail_egg'],

  // Alcohol
  alcohol: [
    'wine',
    'beer',
    'spirits',
    'liquor',
    'whiskey',
    'vodka',
    'rum',
    'gin',
    'tequila',
    'sake',
    'champagne',
    'cider',
  ],
};

/**
 * Normalize ingredient name for matching
 */
export function normalizeIngredientName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, ' ') // Replace special chars with space
    .replace(/\s+/g, '_') // Replace spaces with underscore
    .replace(/_+/g, '_') // Replace multiple underscores with single
    .replace(/^_|_$/g, ''); // Remove leading/trailing underscores
}

/**
 * Check if ingredient matches a category
 */
export function ingredientMatchesCategory(
  ingredientName: string,
  category: string,
): boolean {
  const normalized = normalizeIngredientName(ingredientName);
  const categoryItems = INGREDIENT_CATEGORY_MAP[category] || [];

  // Direct match
  if (categoryItems.includes(normalized)) {
    return true;
  }

  // Partial match (ingredient contains category item or vice versa)
  return categoryItems.some(
    (item) =>
      normalized.includes(item) ||
      item.includes(normalized) ||
      normalized === item,
  );
}

/**
 * Check if ingredient matches any in a list
 */
export function ingredientMatchesList(
  ingredientName: string,
  list: string[],
): boolean {
  const normalized = normalizeIngredientName(ingredientName);

  return list.some((item) => {
    const normalizedItem = normalizeIngredientName(item);
    return (
      normalized === normalizedItem ||
      normalized.includes(normalizedItem) ||
      normalizedItem.includes(normalized)
    );
  });
}

/**
 * Get all categories that an ingredient belongs to
 */
export function getIngredientCategories(ingredientName: string): string[] {
  const categories: string[] = [];
  const normalized = normalizeIngredientName(ingredientName);

  for (const [category, items] of Object.entries(INGREDIENT_CATEGORY_MAP)) {
    if (
      items.includes(normalized) ||
      items.some(
        (item) => normalized.includes(item) || item.includes(normalized),
      )
    ) {
      categories.push(category);
    }
  }

  return categories;
}

/**
 * Check if ingredient is in a specific category list
 */
export function isIngredientInCategory(
  ingredientName: string,
  categoryList: string[],
): boolean {
  return categoryList.some((category) =>
    ingredientMatchesCategory(ingredientName, category),
  );
}

/**
 * Categorize an ingredient for Wahls Paleo vegetable requirements
 */
export function categorizeWahlsVegetable(ingredientName: string): {
  type: 'leafy' | 'sulfur' | 'colored' | 'other';
  name: string;
} {
  const normalized = normalizeIngredientName(ingredientName);

  if (ingredientMatchesCategory(normalized, 'leafy_vegetables')) {
    return { type: 'leafy', name: ingredientName };
  }

  if (ingredientMatchesCategory(normalized, 'sulfur_vegetables')) {
    return { type: 'sulfur', name: ingredientName };
  }

  if (ingredientMatchesCategory(normalized, 'colored_vegetables')) {
    return { type: 'colored', name: ingredientName };
  }

  return { type: 'other', name: ingredientName };
}

/**
 * Check if ingredient is a high-histamine food
 */
export function isHighHistamine(ingredientName: string): boolean {
  const highHistamineCategories = [
    'fermented_foods',
    'aged_cheese',
    'shellfish',
  ];

  const highHistamineIngredients = [
    'spinach',
    'tomato',
    'sauerkraut',
    'kimchi',
    'kombucha',
    'canned_tuna',
    'canned_salmon',
    'shrimp',
    'lobster',
    'crab',
  ];

  return (
    isIngredientInCategory(ingredientName, highHistamineCategories) ||
    ingredientMatchesList(ingredientName, highHistamineIngredients)
  );
}

/** Zoete aardappel (Ipomoea batatas) is géén nachtschade – Convolvulaceae. */
const SWEET_POTATO_PATTERNS = [
  'zoete aardappel',
  'aardappel zoete',
  'zoete_aardappel',
  'aardappel_zoete',
  'sweet potato',
  'sweet_potato',
  'batata doce',
  'batata_doce',
  'bataat',
];

function isSweetPotato(ingredientName: string): boolean {
  const lower = ingredientName.toLowerCase().replace(/\s+/g, ' ');
  const normalized = normalizeIngredientName(ingredientName);
  return SWEET_POTATO_PATTERNS.some(
    (p) => lower.includes(p) || normalized.includes(p.replace(/\s+/g, '_')),
  );
}

/**
 * Check if ingredient is a nightshade
 */
export function isNightshade(ingredientName: string): boolean {
  if (isSweetPotato(ingredientName)) return false;
  return ingredientMatchesCategory(ingredientName, 'nightshades');
}

/**
 * Check if ingredient is a grain
 */
export function isGrain(ingredientName: string): boolean {
  return ingredientMatchesCategory(ingredientName, 'grains');
}

/**
 * Check if ingredient is dairy
 */
export function isDairy(ingredientName: string): boolean {
  return ingredientMatchesCategory(ingredientName, 'dairy');
}

/**
 * Check if ingredient is a legume
 */
export function isLegume(ingredientName: string): boolean {
  return ingredientMatchesCategory(ingredientName, 'legumes');
}
