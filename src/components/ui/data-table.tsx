"use client";

import { useState, useCallback, type ReactNode } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ColumnDef<T> {
  accessorKey: keyof T & string;
  header: string;
  cell?: (row: T) => ReactNode;
  sortable?: boolean;
}

type SortDir = "asc" | "desc";

interface SortState {
  key: string;
  dir: SortDir;
}

export interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  isLoading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  isLoading = false,
  emptyMessage = "No data found",
  onRowClick,
  rowClassName,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState | null>(null);

  const toggleSort = useCallback(
    (key: string) => {
      setSort((prev) => {
        if (prev?.key !== key) return { key, dir: "asc" };
        if (prev.dir === "asc") return { key, dir: "desc" };
        return null; // third click clears
      });
    },
    [],
  );

  // Sort data
  const sorted = sort
    ? [...data].sort((a, b) => {
        const av = a[sort.key];
        const bv = b[sort.key];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
        return sort.dir === "asc" ? cmp : -cmp;
      })
    : data;

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow">
      <table className="min-w-full divide-y divide-gray-200">
        {/* Header */}
        <thead className="bg-gray-50">
          <tr>
            {columns.map((col) => {
              const sortable = col.sortable !== false;
              const isActive = sort?.key === col.accessorKey;
              return (
                <th
                  key={col.accessorKey}
                  className={`px-4 py-3 text-left text-xs font-medium uppercase text-gray-500${
                    sortable ? " cursor-pointer select-none hover:text-gray-700" : ""
                  }`}
                  onClick={sortable ? () => toggleSort(col.accessorKey) : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {sortable && isActive && (
                      <span className="text-gray-900">
                        {sort!.dir === "asc" ? "▲" : "▼"}
                      </span>
                    )}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>

        {/* Body */}
        <tbody className="divide-y divide-gray-200">
          {isLoading
            ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {columns.map((col) => (
                    <td key={col.accessorKey} className="whitespace-nowrap px-4 py-3">
                      <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
                    </td>
                  ))}
                </tr>
              ))
            : sorted.length === 0
              ? (
                  <tr>
                    <td
                      colSpan={columns.length}
                      className="px-4 py-12 text-center text-sm text-gray-500"
                    >
                      {emptyMessage}
                    </td>
                  </tr>
                )
              : sorted.map((row, idx) => (
                  <tr
                    key={idx}
                    className={`hover:bg-gray-50${onRowClick ? " cursor-pointer" : ""}${rowClassName ? ` ${rowClassName(row) ?? ""}` : ""}`}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.accessorKey}
                        className="whitespace-nowrap px-4 py-3 text-sm text-gray-600"
                      >
                        {col.cell ? col.cell(row) : String(row[col.accessorKey] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
        </tbody>
      </table>
    </div>
  );
}
