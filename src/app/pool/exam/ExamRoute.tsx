"use client";

import { MissingPoolId, usePoolId } from "@/components/usePoolId";
import { ExamBuilder } from "./ExamBuilder";

export function ExamRoute() {
  const poolId = usePoolId();
  return poolId ? <ExamBuilder poolId={poolId} /> : <MissingPoolId />;
}
