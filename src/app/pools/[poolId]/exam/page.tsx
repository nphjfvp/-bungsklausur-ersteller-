import { ExamBuilder } from "./ExamBuilder";

export const metadata = { title: "Klausur bauen" };

export default async function ExamPage({
  params,
}: {
  params: Promise<{ poolId: string }>;
}) {
  const { poolId } = await params;
  return <ExamBuilder poolId={poolId} />;
}
