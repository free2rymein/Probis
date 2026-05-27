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

export default function MarketsPage() {
  return (
    <PageShell
      title="Markets"
      description="Prediction market coverage, liquidity, probability movement, and venue context."
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Market</TableHead>
            <TableHead>Venue</TableHead>
            <TableHead>Probability</TableHead>
            <TableHead>Volume</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell colSpan={5}>
              <EmptyState
                title="No markets indexed"
                description="Market rows will appear after ingestion is configured for approved prediction venues."
              />
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </PageShell>
  );
}
