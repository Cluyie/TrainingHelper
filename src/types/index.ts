export type Equipment = "gym" | "home_cable";
export type Phase = 1 | 2 | 3;
export type DayOfWeek = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
export type ExerciseCategory = "hinge" | "squat" | "push" | "pull" | "carry" | "core" | "shoulder_health";
export type SplitType = "full_body" | "upper_lower" | "ppl" | "ppl_x2" | "gym_home";
export type RunType = "easy" | "interval" | "long" | "unstructured";

export interface User {
  id: string;
  name: string;
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
  training_days: DayOfWeek[];
  home_days: DayOfWeek[];
  stretching_days_per_week: number;
  stretching_duration_min: number;
  split_type: SplitType | null;
  onboarding_complete: boolean;
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

export interface RunningSession {
  id: string;
  program_week: number;
  date: string | null;
  type: RunType;
  target_duration_min: number;
  target_description: string;
  actual_duration_min: number | null;
  actual_distance_km: number | null;
  completed: boolean;
  optional: boolean;
  notes: string | null;
}

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
export type FoodSource = "usda" | "frida" | "recipe" | "manual";

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

export interface ProgressionSuggestion {
  exercise_id: string;
  suggested_weight_kg: number;
  last_weight_kg: number | null;
  last_reps: number | null;
  message: string;
  is_increase: boolean;
}
