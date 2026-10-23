# Terminal architecture (v2)

Goal: the terminal feels instant and never lies, even when the API or database is slow, far away or briefly unreachable.

## Rules

1. **The server is the source of truth.** `/trade/positions` returns a snapshot: positions, working limit/stop orders, account figures. Each call also runs one engine cycle on the server (limit/stop fills, liquidations, SL/TP).
2. **Every action has an id chosen by the browser.** `order_id` is the primary key of the order on the server, so sending a request again (timeout, lost reply, double tap) returns the stored order and never opens a second position. Closing an already closed position answers `ORDER_NOT_OPEN`, which the client treats as done.
3. **Actions go into a ledger first** (`src/components/terminal/sync.ts`), so the screen reacts at once, then are sent and retried with backoff (`withRetry`) until the server answers or definitively refuses.
4. **Screen = snapshot + ledger.** An intent leaves the ledger only when server data settles it (`reconcile`): an open when the server lists it (or a snapshot taken after the server confirmed it no longer has it); a close when a snapshot no longer lists the position. A slow, failed or out-of-order poll proves nothing.
5. **Account figures are derived from the positions on screen** (`deriveView` / `deriveMetrics`), so the table and the panel cannot disagree.
6. **Limit/stop orders rest on the server** (`pending_orders`, migration `004_pending_orders.sql` in the backend repo). The pending order's id becomes the position id when it fills, so a fill can never double. Without the migration the terminal falls back to the old browser-side watcher.
7. `POST /api/cron/tick` (header `x-cron-secret`) runs the engine for every account with open positions or working orders. Optional; call it every minute from a scheduler so liquidations, SL/TP and conditional fills do not depend on a browser being open.

## Files

| File | Role |
| --- | --- |
| `sync.ts` | Pure logic: ledger, `reconcile`, `deriveView`, `deriveMetrics`, `withRetry` |
| `data.tsx` | Provider: poll, ledger state, `openPosition`, `closePositions`, `placePending`, `cancelPending` |
| `pendingEngine.ts` | Fallback browser-side limit/stop watcher |
| `tests/sync.test.ts`, `tests/terminal-provider.test.tsx` | `npx tsx tests/…` (the second needs `jsdom` and `@testing-library/react`, installed with `--no-save`) |
