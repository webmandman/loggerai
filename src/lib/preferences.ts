/** The one `Setting` row this app uses. */
export const PREFERENCES_KEY = "recipePreferences";

/**
 * Cap on the cook's notes. They are pasted into the suggestion prompt ahead of
 * the pantry and the rules, so an unbounded blob would push those out of the
 * model's attention — and the useful version of this field is a handful of
 * lines, not an essay.
 */
export const PREFERENCES_MAX = 2000;
