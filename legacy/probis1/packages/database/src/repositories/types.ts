import type { ProbisDatabase } from "../client";
import type { PaginationInput } from "../queries/pagination";

export type RepositoryContext = {
  db: ProbisDatabase;
};

export type RepositoryListInput<TFilters = Record<string, never>> = PaginationInput & TFilters;
