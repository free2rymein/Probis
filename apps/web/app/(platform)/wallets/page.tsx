import {
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@probis/ui";
import { PageShell } from "@/components/layout/page-shell";

export default function WalletsPage() {
  return (
    <PageShell
      title="Wallets"
      description="Wallet clustering, entity labels, behavior scoring, and cross-market exposure."
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Address</TableHead>
            <TableHead>Chain</TableHead>
            <TableHead>Risk score</TableHead>
            <TableHead>Last seen</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell colSpan={4}>
              <EmptyState
                title="No wallet entities tracked"
                description="Wallet intelligence will activate after chain-specific ingestion and labeling are configured."
              />
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </PageShell>
  );
}
