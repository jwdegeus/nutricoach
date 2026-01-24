"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/catalyst/button";
import { PlusIcon, CameraIcon, PhotoIcon, DocumentIcon } from "@heroicons/react/20/solid";
import { MealsList } from "./MealsList";
import { MealUploadModal } from "./MealUploadModal";
import type { CustomMealRecord } from "@/src/lib/custom-meals/customMeals.service";

type MealsPageClientProps = {
  initialMeals: {
    customMeals: CustomMealRecord[];
    mealHistory: any[];
  };
};

export function MealsPageClient({ initialMeals }: MealsPageClientProps) {
  const router = useRouter();
  const [meals, setMeals] = useState(initialMeals);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadType, setUploadType] = useState<"photo" | "screenshot" | "file" | null>(null);

  const handleMealAdded = (newMeal: CustomMealRecord) => {
    setMeals((prev) => ({
      ...prev,
      customMeals: [newMeal, ...prev.customMeals],
    }));
    setIsUploadModalOpen(false);
  };

  // Handle consumption logged - update local state optimistically
  const handleConsumptionLogged = useCallback(() => {
    // Optimistically update consumption counts in local state
    // The router.refresh() in MealsList will update server data
    // This prevents the need for a full page reload
  }, []);

  const allMeals = [
    ...meals.customMeals.map((m) => ({ ...m, source: "custom" as const })),
    ...meals.mealHistory.map((m) => ({ ...m, source: "gemini" as const })),
  ];

  return (
    <>
      <div className="mb-6">
        <div className="flex gap-3">
          <Button
            onClick={() => {
              setUploadType("photo");
              setIsUploadModalOpen(true);
            }}
          >
            <CameraIcon className="h-5 w-5 mr-2" />
            Foto Maken
          </Button>
          <Button
            onClick={() => {
              setUploadType("screenshot");
              setIsUploadModalOpen(true);
            }}
          >
            <PhotoIcon className="h-5 w-5 mr-2" />
            Screenshot
          </Button>
          <Button
            onClick={() => {
              setUploadType("file");
              setIsUploadModalOpen(true);
            }}
          >
            <DocumentIcon className="h-5 w-5 mr-2" />
            Bestand Uploaden
          </Button>
        </div>
      </div>

      <MealsList 
        meals={allMeals}
        onConsumptionLogged={handleConsumptionLogged}
      />

      {isUploadModalOpen && uploadType && (
        <MealUploadModal
          isOpen={isUploadModalOpen}
          onClose={() => {
            setIsUploadModalOpen(false);
            setUploadType(null);
          }}
          uploadType={uploadType}
          onMealAdded={handleMealAdded}
        />
      )}
    </>
  );
}
