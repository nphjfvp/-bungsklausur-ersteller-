"use client";

import { MissingPoolId, usePoolId } from "@/components/usePoolId";
import { PoolDetail } from "./PoolDetail";

export function PoolRoute() {
  const poolId = usePoolId();
  return poolId ? <PoolDetail poolId={poolId} /> : <MissingPoolId />;
}
