export interface ActionItem {
  text: string;
  done: boolean;
}

export interface PantryInput {
  name: string;
  label: string;
  quantity?: string | null;
  /** Other everyday names for the same item, e.g. ["creamer"] on half and half. */
  aliases?: string[];
}

export interface PantryItem {
  id: string;
  name: string;
  label: string;
  aliases: string[];
  quantity: string | null;
  status: "available" | "needed";
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReceiptScan {
  store: string | null;
  purchasedAt: string | null;
  items: PantryInput[];
}

export interface RecipeIngredient {
  item: string;
  amount: string;
  /** True when the pantry already has it (or it is a basic staple). */
  have: boolean;
}

export type Meal = "breakfast" | "lunch" | "dinner";

export interface RecipeOptions {
  meal: Meal;
  /** How many people to cook for, 1-5. */
  servings: number;
  /** How many non-pantry ingredients a suggestion may call for, 1-3. */
  allowedMissing: number;
  lactoseFree: boolean;
  glutenFree: boolean;
  carbHeavy: boolean;
  proteinHeavy: boolean;
  /**
   * Skip the saved/favourite recipes and generate fresh ones. Lives here
   * rather than in its own request field so the panel stays one state object.
   */
  newOnly: boolean;
}

/** What the options panel starts on before the cook touches anything. */
export function defaultRecipeOptions(now = new Date()): RecipeOptions {
  const h = now.getHours();
  return {
    meal: h < 11 ? "breakfast" : h < 16 ? "lunch" : "dinner",
    servings: 5,
    allowedMissing: 2,
    lactoseFree: false,
    glutenFree: false,
    carbHeavy: false,
    proteinHeavy: false,
    newOnly: false,
  };
}

export interface Recipe {
  title: string;
  description: string;
  minutes: number;
  servings: number;
  ingredients: RecipeIngredient[];
  steps: string[];
}

/** A recipe once it is in the database, i.e. kept rather than just suggested. */
export interface SavedRecipe extends Recipe {
  id: string;
  favorite: boolean;
  createdAt: string;
}

/** What is planned for one day: a recipe per day part, or null for none. */
export type DayPlan = Record<Meal, SavedRecipe | null>;

/** Someone else who is in the app right now. */
export interface PresenceUser {
  userId: string;
  name: string | null;
  image: string | null;
  /** Route they are on, used to describe them when `activity` is null. */
  path: string;
  /** Already filtered server-side: anything past its TTL arrives as null. */
  activity: string | null;
  /** App open in front of them, but nothing touched for a couple of minutes. */
  idle: boolean;
  lastSeen: string;
}

export interface ProcessedLogEntry {
  summary: string;
  category: string;
  tags: string[];
  actionItems: ActionItem[];
  mood: string | null;
  metadata: Record<string, unknown>;
  occurredAt: string | null;
  /** Food the entry says is now gone — gets pushed onto the shopping list. */
  consumed: PantryInput[];
  /** Food the entry says is on hand — gets stocked into the pantry. */
  stocked: PantryInput[];
}

export interface LogEntry {
  id: string;
  rawInput: string;
  summary: string;
  category: string;
  tags: string[];
  actionItems: ActionItem[];
  metadata: Record<string, unknown>;
  mood: string | null;
  inputMethod: string;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    name: string | null;
    image: string | null;
  } | null;
}

export type InputMethod = "voice" | "text";

export const CATEGORIES = [
  "task",
  "idea",
  "meeting",
  "personal",
  "note",
  "reminder",
  "bug",
  "question",
  "achievement",
  "grocery",
  "other",
] as const;

export type Category = (typeof CATEGORIES)[number];
