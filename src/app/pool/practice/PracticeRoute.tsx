"use client";

import { MissingPoolId, usePoolId } from "@/components/usePoolId";
import { PracticeMode } from "./PracticeMode";

export function PracticeRoute() {
  const poolId = usePoolId();
  return poolId ? <PracticeMode poolId={poolId} /> : <MissingPoolId />;
}
