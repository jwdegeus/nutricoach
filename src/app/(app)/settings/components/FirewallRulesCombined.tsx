"use client";

import { useState } from "react";
import { GuardRailsOverview } from "./GuardRailsOverview";
import { GuardRailsManager } from "./GuardRailsManager";
import { Button } from "@/components/catalyst/button";
import { Text } from "@/components/catalyst/text";
import { ViewColumnsIcon, Cog6ToothIcon } from "@heroicons/react/20/solid";

type FirewallRulesCombinedProps = {
  dietTypeId: string;
  dietTypeName: string;
};

type ViewMode = "overview" | "manage";

export function FirewallRulesCombined({
  dietTypeId,
  dietTypeName,
}: FirewallRulesCombinedProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("overview");
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = () => {
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <div className="space-y-6">
      {/* Header with mode toggle */}
      <div className="flex items-center justify-between rounded-lg bg-white p-4 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
        <div>
          <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
            Firewall Rules voor {dietTypeName}
          </h2>
          <Text className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {viewMode === "overview"
              ? "Overzicht van alle firewall rules, gesorteerd op prioriteit"
              : "Beheer categorieën en configureer allow/block regels met prioriteit"}
          </Text>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setViewMode("overview")}
            color={viewMode === "overview" ? "blue" : "zinc"}
          >
            <ViewColumnsIcon className="h-4 w-4" />
            Overzicht
          </Button>
          <Button
            onClick={() => setViewMode("manage")}
            color={viewMode === "manage" ? "blue" : "zinc"}
          >
            <Cog6ToothIcon className="h-4 w-4" />
            Beheren
          </Button>
        </div>
      </div>

      {/* Content based on view mode */}
      {viewMode === "overview" ? (
        <GuardRailsOverview
          key={`overview-${refreshKey}`}
          dietTypeId={dietTypeId}
          dietTypeName={dietTypeName}
          onEdit={() => {
            setViewMode("manage");
            handleRefresh();
          }}
        />
      ) : (
        <GuardRailsManager
          key={`manage-${refreshKey}`}
          dietTypeId={dietTypeId}
          dietTypeName={dietTypeName}
          onSaved={() => {
            setViewMode("overview");
            handleRefresh();
          }}
        />
      )}
    </div>
  );
}
