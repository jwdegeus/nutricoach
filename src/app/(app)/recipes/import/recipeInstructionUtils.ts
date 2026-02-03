/**
 * Shared helpers for normalising recipe instructions (paragraph-style steps).
 * Used by both JSON-LD parsing and Gemini URL import so we get one step per paragraph.
 */

/** Step title pattern: line starts with imperative verb phrase ending in ": " */
const STEP_TITLE_START =
  /^(?:Prepare|Grill|Make|Assemble|Add|Combine|Mix|Bake|Cook|Heat|Stir|Remove|Place|Serve|Bring|Drain|Cut|Slice)[^\n:]{0,70}:\s/i;

/**
 * When we have many short steps (e.g. one sentence each), merge them so each
 * "paragraph" (title + following sentences) becomes one step.
 */
export function mergeInstructionsIntoParagraphs(
  steps: { text: string }[],
): { text: string }[] {
  if (steps.length <= 5) return steps;
  const result: { text: string }[] = [];
  let current = steps[0]?.text ?? '';
  for (let i = 1; i < steps.length; i++) {
    const text = steps[i]?.text?.trim() ?? '';
    if (!text) continue;
    const startsWithTitle = STEP_TITLE_START.test(text);
    if (startsWithTitle && current) {
      result.push({ text: current.trim() });
      current = text;
    } else {
      current = current ? `${current} ${text}` : text;
    }
  }
  if (current) result.push({ text: current.trim() });
  return result.length >= 2 ? result : steps;
}
