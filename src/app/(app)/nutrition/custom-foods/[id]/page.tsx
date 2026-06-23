"use client";

import { use } from "react";
import CustomFoodForm from "@/components/nutrition/CustomFoodForm";

// Handles both /nutrition/custom-foods/new and /nutrition/custom-foods/<uuid>.
export default function CustomFoodEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <CustomFoodForm foodId={id} />;
}
