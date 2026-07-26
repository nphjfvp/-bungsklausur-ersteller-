import { PoolDetail } from "./PoolDetail";

export const metadata = { title: "Fragenpool" };

export default async function PoolPage({
  params,
}: {
  params: Promise<{ poolId: string }>;
}) {
  const { poolId } = await params;
  return <PoolDetail poolId={poolId} />;
}
