import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RecipeImportClient } from "./RecipeImportClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('recipeImport');
  return {
    title: t('pageTitle'),
    description: t('pageDescription'),
  };
}

type PageProps = {
  searchParams: Promise<{ jobId?: string }>;
};

export default async function RecipeImportPage({ searchParams }: PageProps) {
  const t = await getTranslations('recipeImport');
  const { jobId } = await searchParams;
  
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">{t('uploadTitle')}</h1>
      </div>
      <RecipeImportClient initialJobId={jobId} />
    </div>
  );
}
