type IngredientLike = {
  name?: string;
  original_line?: string;
  quantity?: string | number | null;
  amount?: string | number | null;
  unit?: string | null;
};

/**
 * Bouw line options per ingrediënt voor lookup in recipe_ingredient_matches.
 * Herbruikbaar server + client (geen server action).
 */
export function buildLineOptionsFromIngredients(
  ingredients: IngredientLike[],
): string[][] {
  return ingredients.map((ing) => {
    const name = ing.name || ing.original_line || '';
    const qty = ing.quantity ?? ing.amount;
    const numQty =
      typeof qty === 'number'
        ? qty
        : typeof qty === 'string'
          ? parseFloat(qty)
          : undefined;
    const unit = (ing.unit ?? 'g')?.toString().trim() || 'g';
    const options: string[] = [];
    if (ing.original_line?.trim()) options.push(ing.original_line.trim());
    if (name.trim() && numQty != null && unit) {
      const fullLine = `${name.trim()} ${numQty} ${unit}`.trim();
      if (!options.includes(fullLine)) options.push(fullLine);
    }
    if (name.trim() && !options.includes(name.trim()))
      options.push(name.trim());
    return options.length > 0 ? options : [name || ''];
  });
}
