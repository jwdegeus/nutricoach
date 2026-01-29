import { IngredientGroupDetailPageClient } from './IngredientGroupDetailPageClient';

type PageProps = {
  params: Promise<{ groupId: string }>;
};

export default async function IngredientGroupPage({ params }: PageProps) {
  const { groupId } = await params;
  return <IngredientGroupDetailPageClient groupId={groupId} />;
}
