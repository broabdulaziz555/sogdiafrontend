# Terminal data flow

Plain request / response. No client-side ledger, no reconciliation, no retries.

**One query.** `GET /trade/positions` (SWR, every 2.5 s while something is open or waiting, 10 s when flat) is the only
source of what is open. The positions table, the account panel, the chart markers and the mobile views all read it
(`src/components/terminal/data.tsx`). Between two polls the numbers are re-priced with the browser's live price
(`liveprice.ts`); that layer only changes numbers, it never adds, removes or hides a position.

**Open.** The button shows a spinner and cannot be pressed again while `POST /trade/open` is running (deadline 30 s,
never retried). On `200` the positions query is invalidated and the table is re-read from the database. The row appears
only when the database lists it.

**Close.** Same: the row's Close button shows a spinner, `POST /trade/close` (30 s), on `200` the positions query is
invalidated. The row stays visible until the database stops listing it. `ORDER_NOT_OPEN` counts as success.

**Failure / timeout.** Nothing on screen is removed or invented. A timeout shows "Order execution is taking longer than
expected. Check your positions." and re-reads the positions query, so the table shows whatever the database holds. A
refusal (margin, validation, …) shows the server's message and leaves the form as it was.

**Why a repeated tap cannot open twice.** The browser sends a generated `order_id`; the server stores the order under
that id, so the same request twice is one order. Two taps in a row are also blocked by the spinner.

**Limit / stop orders** rest on the server (migration `004_pending_orders.sql`); the store mirrors the server's list.
Without the migration they stay browser-side (`pendingEngine.ts`).

**Backend `POST /trade/open`:** auth → [account + balance, open orders, Binance price] in parallel → guards → one
insert → `200`. The risk engine runs after the reply, on every positions poll, and on `/api/cron/tick`.

**Diagnostics** (menu → Diagnostics): app build id plus a trail of polls and trade requests with timings.
