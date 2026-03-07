"use client";

import { WeeklyDigest } from "@/components/weekly-digest";
import { InsightsCard } from "@/components/insights-card";

export default function InsightsPage() {
  return (
    <div className="py-6 space-y-6">
      <WeeklyDigest />
      <InsightsCard />
    </div>
  );
}
