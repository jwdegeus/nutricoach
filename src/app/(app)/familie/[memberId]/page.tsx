import type { Metadata } from 'next';
import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import { getFamilyMemberAction } from '../actions/family.actions';
import { FamilyMemberDetailClient } from './FamilyMemberDetailClient';

export const metadata: Metadata = {
  title: 'Familielid | NutriCoach',
  description: 'Persoonlijke instellingen voor familielid',
};

type Props = { params: Promise<{ memberId: string }> };

export default async function FamilyMemberPage({ params }: Props) {
  const { memberId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const result = await getFamilyMemberAction(memberId);
  if (!result.ok) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <FamilyMemberDetailClient member={result.member} />
    </div>
  );
}
