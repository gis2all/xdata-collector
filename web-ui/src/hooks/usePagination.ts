import { useMemo } from "react";

export function usePagination(total: number, pageSize: number) {
  return useMemo(
    () => ({
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    }),
    [pageSize, total],
  );
}
