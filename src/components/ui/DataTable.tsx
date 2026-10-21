'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Search, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { SkeletonRows } from './Skeleton';
import { EmptyState, ErrorState } from './States';

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number | null | undefined;
  searchText?: (row: T) => string;
  align?: 'left' | 'right' | 'center';
  className?: string;
  headerClassName?: string;
  hideBelow?: 'sm' | 'md' | 'lg';
}

export interface ServerMode {
  total: number;
  page: number; // 0-based
  pageSize: number;
  onPageChange: (p: number) => void;
  onPageSizeChange?: (n: number) => void;
  query: string;
  onQueryChange: (q: string) => void;
  /** When the API has no search param, filter the loaded page client-side instead of refetching. */
  clientSearch?: boolean;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  onRowClick?: (row: T) => void;
  activeRowKey?: string | null;
  pageSize?: number;
  pageSizes?: number[];
  searchPlaceholder?: string;
  searchable?: boolean;
  toolbar?: React.ReactNode;
  empty?: { title: string; description?: string; action?: React.ReactNode; icon?: React.ReactNode };
  dense?: boolean;
  /** Exchange-style tight rows (terminal). */
  compact?: boolean;
  /** Drop the outer border and radius, for embedding in a panel. */
  bare?: boolean;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  server?: ServerMode;
  className?: string;
  stickyHeader?: boolean;
  footerNote?: React.ReactNode;
}

const hide = { sm: 'max-sm:hidden', md: 'max-md:hidden', lg: 'max-lg:hidden' } as const;

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  onRetry,
  onRowClick,
  activeRowKey,
  pageSize: initialPageSize = 10,
  pageSizes = [10, 25, 50, 100],
  searchPlaceholder = 'Search…',
  searchable = true,
  toolbar,
  empty,
  dense,
  compact,
  bare,
  initialSort,
  server,
  className,
  stickyHeader = true,
  footerNote,
}: Props<T>) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(initialSort ?? null);
  const [localQuery, setLocalQuery] = useState('');
  const [localPage, setLocalPage] = useState(0);
  const [localSize, setLocalSize] = useState(initialPageSize);

  // Debounced query for server mode
  const [serverInput, setServerInput] = useState(server?.query ?? '');
  const firstRun = useRef(true);
  useEffect(() => {
    if (!server) return;
    if (firstRun.current) { firstRun.current = false; return; }
    if (server.clientSearch) return;
    const t = setTimeout(() => server.onQueryChange(serverInput), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverInput]);

  const query = server ? serverInput : localQuery;
  const setQuery = (q: string) => {
    if (server) setServerInput(q);
    else { setLocalQuery(q); setLocalPage(0); }
  };

  const filtered = useMemo(() => {
    let list = rows ?? [];
    const activeQuery = server ? (server.clientSearch ? serverInput : '') : localQuery;
    if (activeQuery.trim()) {
      const q = activeQuery.trim().toLowerCase();
      list = list.filter((r) =>
        columns.some((c) => (c.searchText ? c.searchText(r) : String(c.sortValue?.(r) ?? '')).toLowerCase().includes(q)),
      );
    }
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col?.sortValue) {
        const f = col.sortValue;
        list = [...list].sort((a, b) => {
          const av = f(a);
          const bv = f(b);
          if (av == null && bv == null) return 0;
          if (av == null) return 1;
          if (bv == null) return -1;
          const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv), undefined, { numeric: true });
          return sort.dir === 'asc' ? cmp : -cmp;
        });
      }
    }
    return list;
  }, [rows, columns, localQuery, serverInput, sort, server]);

  const size = server ? server.pageSize : localSize;
  const total = server ? server.total : filtered.length;
  const page = server ? server.page : Math.min(localPage, Math.max(0, Math.ceil(total / size) - 1));
  const pageCount = Math.max(1, Math.ceil(total / size));
  const visible = server ? filtered : filtered.slice(page * size, page * size + size);
  const from = total === 0 ? 0 : page * size + 1;
  const to = Math.min(total, page * size + visible.length);

  const goto = (p: number) => {
    const n = Math.max(0, Math.min(pageCount - 1, p));
    server ? server.onPageChange(n) : setLocalPage(n);
  };
  const setSize = (n: number) => {
    if (server) { server.onPageSizeChange?.(n); server.onPageChange(0); }
    else { setLocalSize(n); setLocalPage(0); }
  };

  const toggleSort = (key: string) =>
    setSort((s) => (!s || s.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : null));

  const py = compact ? 'py-1.5' : dense ? 'py-2' : 'py-3';
  const px = compact ? 'px-3' : 'px-4';
  const hasToolbar = searchable || toolbar;
  const showSkeleton = loading && !rows;

  return (
    <div className={cn('flex min-h-0 flex-col overflow-hidden bg-panel', !bare && 'rounded-xl border border-line', className)}>
      {hasToolbar && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
          {searchable && (
            <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label="Search table"
                className="h-8 w-full rounded-md border border-line bg-panel2 pl-8 pr-7 text-sm placeholder:text-subtle transition-colors hover:border-subtle/60 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
              />
              {query && (
                <button onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-1.5 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded text-subtle hover:text-fg">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          )}
          {toolbar && <div className="ml-auto flex flex-wrap items-center gap-2">{toolbar}</div>}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        {error && !rows ? (
          <ErrorState error={error} onRetry={onRetry} />
        ) : showSkeleton ? (
          <SkeletonRows rows={Math.min(size, 8)} cols={Math.min(columns.length, 6)} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={empty?.icon}
            title={query ? 'No matching results' : empty?.title ?? 'Nothing here yet'}
            description={query ? `No rows match “${query}”. Try a different search.` : empty?.description}
            action={query ? undefined : empty?.action}
          />
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead className={cn(stickyHeader && 'sticky top-0 z-10')}>
              <tr className="border-b border-line bg-panel2/95 backdrop-blur">
                {columns.map((c) => {
                  const sortable = !!c.sortValue;
                  const active = sort?.key === c.key;
                  return (
                    <th
                      key={c.key}
                      scope="col"
                      aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                      className={cn(
                        'whitespace-nowrap py-2 text-2xs font-medium uppercase tracking-[0.08em] text-subtle',
                        px,
                        c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left',
                        c.hideBelow && hide[c.hideBelow],
                        c.headerClassName,
                      )}
                    >
                      {sortable ? (
                        <button
                          onClick={() => toggleSort(c.key)}
                          className={cn('group inline-flex items-center gap-1 uppercase tracking-[0.08em] transition-colors hover:text-fg', active && 'text-fg', c.align === 'right' && 'flex-row-reverse')}
                        >
                          {c.header}
                          {active ? (
                            sort!.dir === 'asc' ? <ArrowUp className="h-3 w-3 text-accent" /> : <ArrowDown className="h-3 w-3 text-accent" />
                          ) : (
                            <ChevronsUpDown className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-60" />
                          )}
                        </button>
                      ) : (
                        c.header
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const k = rowKey(r);
                return (
                  <tr
                    key={k}
                    onClick={onRowClick ? () => onRowClick(r) : undefined}
                    onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(r); } } : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                    className={cn(
                      'border-b border-line/60 transition-colors last:border-0',
                      onRowClick && 'cursor-pointer hover:bg-fg/[0.04] focus-visible:bg-fg/[0.04]',
                      activeRowKey === k && 'bg-accent/[0.06] shadow-[inset_2px_0_0_rgb(var(--accent))]',
                    )}
                  >
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={cn(
                          'align-middle',
                          px,
                          py,
                          c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left',
                          c.hideBelow && hide[c.hideBelow],
                          c.className,
                        )}
                      >
                        {c.cell(r)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-panel2/50 px-3 py-2 text-xs text-muted">
        <div className="flex items-center gap-3">
          <span className="num">{total === 0 ? '0 rows' : `${from}–${to} of ${total.toLocaleString()}`}</span>
          {footerNote}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5">
            <span className="max-sm:hidden">Rows</span>
            <select
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
              aria-label="Rows per page"
              className="h-6 rounded border border-line bg-panel px-1 text-xs focus:border-accent focus:outline-none"
            >
              {pageSizes.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <div className="flex items-center gap-1">
            <button onClick={() => goto(0)} disabled={page === 0} aria-label="First page" className="grid h-6 w-6 place-items-center rounded hover:bg-fg/10 disabled:opacity-30 disabled:hover:bg-transparent">
              <ChevronLeft className="h-3.5 w-3.5" /><ChevronLeft className="-ml-2.5 h-3.5 w-3.5" />
            </button>
            <button onClick={() => goto(page - 1)} disabled={page === 0} aria-label="Previous page" className="grid h-6 w-6 place-items-center rounded hover:bg-fg/10 disabled:opacity-30 disabled:hover:bg-transparent">
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="num min-w-[64px] text-center">Page {page + 1} / {pageCount}</span>
            <button onClick={() => goto(page + 1)} disabled={page >= pageCount - 1} aria-label="Next page" className="grid h-6 w-6 place-items-center rounded hover:bg-fg/10 disabled:opacity-30 disabled:hover:bg-transparent">
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => goto(pageCount - 1)} disabled={page >= pageCount - 1} aria-label="Last page" className="grid h-6 w-6 place-items-center rounded hover:bg-fg/10 disabled:opacity-30 disabled:hover:bg-transparent">
              <ChevronRight className="h-3.5 w-3.5" /><ChevronRight className="-ml-2.5 h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
