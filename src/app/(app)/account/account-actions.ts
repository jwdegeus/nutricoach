"use server";

import { createClient } from "@/src/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function updateProfile(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: "Je moet ingelogd zijn om je profiel bij te werken",
    };
  }

  const fullName = formData.get("full_name") as string;
  const displayName = formData.get("display_name") as string;

  const { error } = await supabase.auth.updateUser({
    data: {
      full_name: fullName || null,
      display_name: displayName || null,
    },
  });

  if (error) {
    return {
      error: error.message,
    };
  }

  revalidatePath("/account");
  return {
    success: true,
    message: "Profiel succesvol bijgewerkt",
  };
}

export async function updateLanguagePreference(language: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: "Je moet ingelogd zijn om je taalvoorkeur bij te werken",
    };
  }

  // Validate language
  if (language !== 'nl' && language !== 'en') {
    return {
      error: "Ongeldige taal. Kies Nederlands of Engels.",
    };
  }

  // Update or insert language preference
  const { error } = await supabase
    .from('user_preferences')
    .upsert(
      {
        user_id: user.id,
        language: language,
      },
      {
        onConflict: 'user_id',
      }
    );

  if (error) {
    return {
      error: error.message,
    };
  }

  revalidatePath("/account");
  return {
    success: true,
    message: "Taalvoorkeur succesvol bijgewerkt",
  };
}
