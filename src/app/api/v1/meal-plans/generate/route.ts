/**
 * Meal Plan Generation API Route
 * 
 * POST endpoint for generating meal plans via the meal planner agent.
 * Intended for smoke testing and internal use.
 * 
 * @route POST /api/v1/meal-plans/generate
 */

import { generateMealPlanAction } from "@/src/app/(app)/menus/actions/generateMealPlan.action";
import { NextResponse } from "next/server";

// Force dynamic rendering - AI output should not be cached
export const dynamic = "force-dynamic";

/**
 * POST handler for meal plan generation
 * 
 * Accepts a JSON body with meal plan request data and returns
 * the generated meal plan or an error.
 */
export async function POST(req: Request) {
  try {
    // Parse request body
    const body = await req.json();

    // Call server action
    const result = await generateMealPlanAction(body);

    // Handle success
    if (result.ok) {
      return NextResponse.json(
        {
          ok: true,
          data: result.data,
        },
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Handle validation error
    if (result.error.code === "VALIDATION_ERROR") {
      return NextResponse.json(
        {
          ok: false,
          error: result.error,
        },
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Handle agent error
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
      },
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    // Handle unexpected errors (e.g., JSON parse failure)
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "VALIDATION_ERROR" as const,
          message: "Invalid request format. Expected JSON body.",
        },
      },
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}
