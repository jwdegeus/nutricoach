import { AccountSectionTabs } from '@/src/components/app/AccountSectionTabs';

export default function RunsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <AccountSectionTabs />
      {children}
    </>
  );
}
