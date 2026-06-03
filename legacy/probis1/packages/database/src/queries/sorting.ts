import { asc, desc, type AnyColumn, type SQL } from "drizzle-orm";

export type SortDirection = "asc" | "desc";

export const orderByDirection = (column: AnyColumn, direction: SortDirection): SQL =>
  direction === "asc" ? asc(column) : desc(column);
