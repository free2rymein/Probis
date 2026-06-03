import { z } from "zod";

export const paginationSchema = z.object({
  limit: z.number().int().min(1).max(500).default(50),
  cursor: z.string().optional()
});

export type PaginationInput = z.input<typeof paginationSchema>;

export type Page<T> = {
  items: T[];
  nextCursor: string | null;
};

export const parsePagination = (input: PaginationInput = {}) => paginationSchema.parse(input);

export const pageFromRows = <T extends Record<string, unknown>>(
  rows: T[],
  limit: number,
  cursorKey: keyof T
): Page<T> => {
  const items = rows.slice(0, limit);
  const overflow = rows.length > limit;
  const last = items.at(-1);

  return {
    items,
    nextCursor: overflow && last ? String(last[cursorKey]) : null
  };
};
