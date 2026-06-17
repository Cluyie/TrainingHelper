"use client";

import { use } from "react";
import RecipeBuilder from "@/components/nutrition/RecipeBuilder";

// Handles both /nutrition/recipes/new and /nutrition/recipes/<uuid>.
export default function RecipeEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <RecipeBuilder recipeId={id} />;
}
