'use client';

import { useState } from 'react';
import { GuardRailsVNextOverview } from './GuardRailsVNextOverview';
import { GuardRailsManager } from './GuardRailsManager';

type FirewallRulesCombinedProps = {
  dietTypeId: string;
  dietTypeName: string;
};

type ViewMode = 'overview' | 'manage';

export function FirewallRulesCombined({
  dietTypeId,
  dietTypeName,
}: FirewallRulesCombinedProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = () => {
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <div className="space-y-6">
      {/* Content based on view mode */}
      {viewMode === 'overview' ? (
        <GuardRailsVNextOverview
          key={`overview-${refreshKey}`}
          dietTypeId={dietTypeId}
          dietTypeName={dietTypeName}
        />
      ) : (
        <GuardRailsManager
          key={`manage-${refreshKey}`}
          dietTypeId={dietTypeId}
          dietTypeName={dietTypeName}
          onSaved={() => {
            setViewMode('overview');
            handleRefresh();
          }}
        />
      )}
    </div>
  );
}
