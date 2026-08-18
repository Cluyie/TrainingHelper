export type Equipment = "gym" | "home_cable";
export type Phase = 1 | 2 | 3;
export type DayOfWeek = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
// "calf" covers ankle/calf work — gait, balance and Achilles resilience all decline
// early, and nothing else in the library trains them directly.
export type ExerciseCategory = "hinge" | "squat" | "push" | "pull" | "carry" | "core" | "shoulder_health" | "power" | "calf";
export type SplitType = "full_body" | "upper_lower" | "ppl" | "ppl_x2" | "gym_home";
export type RunType = "easy" | "interval" | "long" | "unstructured";

export interface User {
  id: string;
  name: string;
  created_at: string;
}

export type Sex = "male" | "female";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "very";
export type Goal = "cut" | "maintain" | "lean_gain";

export interface BodyWeight {
  id: string;
  user_id: string;
  date: string;
  weight_kg: number;
  created_at: string;
}

export interface DailySteps {
  id: string;
  user_id: string;
  date: string;
  steps: number;
  created_at: string;
}

export interface UserSettings {
  id: string;
  user_id: string;
  training_days_per_week: number;
  session_duration_min: number;
  equipment: Equipment[];
  current_phase: Phase;
  program_start_date: string | null;
  // Immutable anchor for the 6-week block cycle. Everything — deload week, block
  // index, Phase 3 running rotation — is derived from it by modulo. Never advanced;
  // see lib/deload.ts.
  strength_block_start: string | null;
  // Shoulder-gated strength tier, manual. Separate from running_phase on purpose:
  // your shoulders have no bearing on whether your legs and lungs can take intervals.
  // (current_phase above.)
  running_phase: Phase;
  // Block anchor the running-phase bump was last evaluated against, so the ⅔
  // completion gate fires exactly once per block rather than on every read.
  running_phase_block: string | null;
  // Days the gym is unreachable. Home sessions and runs may still be placed here.
  no_gym_days: DayOfWeek[];
  // ── Vestigial: the planner now owns all placement. Retained so old rows and
  // unrelated code paths keep working, but no longer read by generation.
  training_days: DayOfWeek[];
  home_days: DayOfWeek[];
  stretching_days_per_week: number;
  stretching_duration_min: number;
  split_type: SplitType | null;
  onboarding_complete: boolean;
  // Profile for adaptive nutrition targets (all optional)
  sex: Sex | null;
  birth_year: number | null;
  height_cm: number | null;
  activity_level: ActivityLevel | null;
  goal: Goal | null;
}

export interface Exercise {
  id: string;
  name: string;
  category: ExerciseCategory;
  equipment: string[];
  phase_unlock: Phase;
  shoulder_safe: boolean;
  lower_back_safe: boolean;
  home_compatible: boolean;
  animation_url: string | null;
  description: string;
  muscle_groups: string[];
}

export interface PlannedWorkout {
  id: string;
  label: string;
  day_of_week: DayOfWeek;
  order_in_week: number;
  is_home_workout: boolean;
  planned_exercises?: PlannedExercise[];
}

export interface PlannedExercise {
  id: string;
  planned_workout_id: string;
  exercise_id: string;
  order_index: number;
  target_sets: number;
  target_reps_min: number;
  target_reps_max: number;
  progression_increment_kg: number;
  exercise?: Exercise;
}

export interface WorkoutSession {
  id: string;
  planned_workout_id: string;
  date: string;
  started_at: string;
  completed_at: string | null;
  notes: string | null;
  planned_workout?: PlannedWorkout;
}

export interface WorkoutSet {
  id: string;
  session_id: string;
  exercise_id: string;
  set_number: number;
  weight_kg: number;
  reps: number;
  rpe: number | null;
  completed_at: string;
  exercise?: Exercise;
}

// Derived state of the 6-week block cycle. blockIndex counts completed blocks since
// the immutable strength_block_start and drives the Phase 3 A/B/C running rotation.
export interface BlockState {
  blockStart: string; // ISO date — the anchor, unchanged
  weekInBlock: number; // 1..6
  blockIndex: number; // 0, 1, 2, ... never stored
  isDeload: boolean; // week 6
}

export interface RunningSession {
  id: string;
  // Week within the current 6-week block (1..6). Was 1..16 under the retired
  // 16-week calendar program.
  program_week: number;
  day_of_week: DayOfWeek | null; // assigned by the week planner
  date: string | null;
  type: RunType;
  target_duration_min: number;
  target_description: string;
  actual_duration_min: number | null;
  actual_distance_km: number | null;
  completed: boolean;
  optional: boolean;
  notes: string | null;
  // ── Logged detail, all optional. Raw measurements only: HRR is derived from
  // hr_end/hr_60s/hr_120s at read time, and pace from duration + distance, so
  // neither definition is frozen into the stored data.
  rpe: number | null; // 1-10 perceived exertion
  avg_hr: number | null;
  max_hr: number | null;
  hr_end: number | null; // on finishing
  hr_60s: number | null; // 60s after stopping
  hr_120s: number | null; // 120s after stopping
  temperature_c: number | null;
  surface: RunSurface | null;
}

export type RunSurface =
  | "road"
  | "forest"
  | "beach"
  | "grass"
  | "gravel"
  | "track"
  | "treadmill";

export interface StretchingExercise {
  id: string;
  name: string;
  category: string;
  duration_sec: number;
  animation_url: string | null;
  description: string;
}

export interface StretchingRoutine {
  id: string;
  name: string;
  focus: string;
  routine_number: number;
  stretching_routine_exercises?: StretchingRoutineExercise[];
}

export interface StretchingRoutineExercise {
  id: string;
  routine_id: string;
  exercise_id: string;
  order_index: number;
  stretching_exercise?: StretchingExercise;
}

export interface StretchingSession {
  id: string;
  routine_id: string;
  date: string;
  completed: boolean;
  stretching_routine?: StretchingRoutine;
}

// ---- Nutrition ----

export type NutrientSnapshot = Record<string, number | null>;
export type TargetDirection = "floor" | "limit";

/** Provenance of a logged food / search result. */
export type FoodSource = "usda" | "frida" | "recipe" | "manual" | "custom";

export interface FoodLogEntry {
  id: string;
  date: string;
  fdc_id: string | null;
  food_name: string;
  brand: string | null;
  quantity_g: number;
  nutrients: NutrientSnapshot;
  data_type: string | null;
  source: FoodSource;
  recipe_id: string | null;
  custom_food_id: string | null;
  created_at: string;
}

export interface NutrientTarget {
  nutrient_key: string;
  target_amount: number;
  direction: TargetDirection;
  enabled: boolean;
}

export interface Supplement {
  id: string;
  nutrient_key: string;
  name: string | null;
  dose_amount: number;
  created_at: string;
}

/** A simplified food search result returned by /api/nutrition/search.
 * Spans multiple sources (USDA + Frida); `id` is the source-native id string. */
export interface FoodSearchResult {
  source: FoodSource;
  id: string;
  fdcId: number; // numeric id where available (USDA); 0 for Frida
  description: string;
  brandOwner: string | null;
  dataType: string | null;
  servingSize: number | null;
  servingSizeUnit: string | null;
}

/** A distinct recently/frequently logged food for one-tap re-logging. */
export interface RecentFood {
  source: FoodSource;
  fdc_id: string | null;
  recipe_id: string | null;
  custom_food_id: string | null;
  food_name: string;
  brand: string | null;
  quantity_g: number;
  nutrients: NutrientSnapshot;
  data_type: string | null;
  count: number;
}

/** Per-100g nutrients + serving info returned by /api/nutrition/food. */
export interface FoodDetail {
  fdcId: number;
  description: string;
  brand: string | null;
  dataType: string | null;
  per100g: NutrientSnapshot;
  servingSize: number | null; // grams (converted)
  servingSizeUnit: string | null;
}

// ---- Recipes ----

export interface RecipeIngredient {
  id: string;
  recipe_id: string;
  fdc_id: string | null;
  food_name: string;
  brand: string | null;
  quantity_g: number;
  nutrients: NutrientSnapshot;
  data_type: string | null;
  order_index: number;
}

export interface Recipe {
  id: string;
  name: string;
  total_weight_g: number;
  per100g: NutrientSnapshot;
  notes: string | null;
  created_at: string;
  updated_at: string;
  recipe_ingredients?: RecipeIngredient[];
}

/** Lightweight recipe row for the picker/list (no ingredients). */
export interface RecipeSummary {
  id: string;
  name: string;
  total_weight_g: number;
  per100g: NutrientSnapshot;
  notes: string | null;
  ingredient_count: number;
}

// ---- Custom foods (user-entered packaged products) ----

/** A user-owned food entered straight from its nutrition label. `per100g` is
 * keyed by nutrient registry keys and used as the snapshot when logging. */
export interface CustomFood {
  id: string;
  name: string;
  brand: string | null;
  per100g: NutrientSnapshot;
  serving_size_g: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProgressionSuggestion {
  exercise_id: string;
  suggested_weight_kg: number;
  last_weight_kg: number | null;
  last_reps: number | null;
  message: string;
  is_increase: boolean;
}
