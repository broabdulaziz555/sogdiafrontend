// Types mirror api-contract.md v1.1.0

export type Role = 'trader' | 'admin' | 'xdepartment';
export type KycStatus = 'not_submitted' | 'pending' | 'verified' | 'rejected';
export type AccountType = 'one_step' | 'instant';
export type AccountStatus = 'active' | 'passed' | 'failed' | 'frozen' | 'breached' | 'closed' | string;
export type Side = 'long' | 'short';

export interface User {
  id: string;
  email: string;
  role: Role;
  kyc_status: KycStatus;
  wallet_address: string | null;
  full_name: string | null;
  country: string | null;
  created_at: string;
  accounts_count?: number;
  /** Not in contract v1.1.0 — consumed by the KYC viewer if the backend exposes it. */
  document_url?: string | null;
  kyc_document_url?: string | null;
  kyc_note?: string | null;
}

export interface Session {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export interface Account {
  id: string;
  user_id: string;
  type: AccountType;
  plan_key: string;
  size: number;
  balance: number;
  equity: number;
  daily_start_balance: number;
  status: AccountStatus;
  max_leverage: number;
  profit_target_pct: number | null;
  daily_dd_pct: number;
  max_dd_pct: number;
  payout_split_pct: number;
  payout_cycle_days: number;
  next_payout_at: string | null;
  created_at: string;
  is_gifted?: boolean;
  user_email?: string;
  min_trading_days?: number;
  consistency_pct?: number | null;
  /** Why the engine failed the account (daily or max drawdown), when it did. */
  breach_reason?: string | null;
}

export interface AccountMetrics {
  equity: number;
  unrealized_pnl: number;
  used_margin: number;
  free_margin: number;
  open_positions: number;
  daily_dd_limit: number;
  max_dd_limit: number;
  daily_dd_remaining: number;
  max_dd_remaining: number;
  daily_dd_used_pct: number;
  max_dd_used_pct: number;
  profit_target: number;
  profit_pct: number;
  target_reached: boolean;
}

export interface RiskState {
  breached: boolean;
  reason: null | 'DAILY_DRAWDOWN' | 'MAX_DRAWDOWN';
  status: AccountStatus;
  closed_orders?: number;
}

export interface Position {
  id: string;
  account_id: string;
  symbol: string;
  side: Side;
  leverage: number;
  margin: number;
  position_size: number;
  quantity: number;
  entry_price: number;
  liquidation_price: number;
  mark_price: number;
  unrealized_pnl: number;
  unrealized_pnl_pct: number;
  status: 'open';
  created_at: string;
  take_profit?: number | null;
  stop_loss?: number | null;
  /** 'fallback': no live price was available, so the open price stands in for the mark. */
  price_source?: 'live' | 'fallback';
  /** Client-side only: shown the instant the trader pressed Long/Short, until the server's own row replaces it. */
  pending?: boolean;
}

export interface LiquidatedEvent {
  id: string;
  symbol: string;
  pnl: number;
  close_price: number;
  reason?: 'liquidation' | 'stop_loss' | 'take_profit';
}

/** A limit / stop order resting on the server. */
export interface ServerPending {
  id: string;
  account_id: string;
  symbol: string;
  side: Side;
  kind: 'limit' | 'stop';
  trigger_price: number;
  leverage: number;
  margin: number;
  take_profit: number | null;
  stop_loss: number | null;
  status: 'working' | 'failed';
  error: string | null;
  created_at: string;
}

export interface PositionsResponse {
  positions: Position[];
  /** Working (and recently failed) server-side limit / stop orders. Absent on an older backend. */
  pending?: ServerPending[];
  liquidated: LiquidatedEvent[];
  account: Account;
  metrics: AccountMetrics;
  risk: RiskState;
  /** What the server read for this call: orders the database listed for the account vs positions it returned. */
  debug?: { account_id: string; db_open_orders: number; returned: number; closed_by_cycle: number; account_status: string; risk_engine?: 'on' | 'off'; server_ms?: number };
}

export interface HistoryOrder {
  id: string;
  symbol: string;
  side: Side;
  leverage: number;
  margin: number;
  position_size: number;
  entry_price: number;
  close_price: number;
  pnl: number;
  status: string;
  close_reason: string | null;
  created_at: string;
  closed_at: string | null;
}

export interface HistoryResponse {
  orders: HistoryOrder[];
  total: number;
  limit: number;
  offset: number;
  stats: { trades: number; wins: number; losses: number; win_rate: number; net_pnl: number };
}

export interface Plan {
  key: string;
  type: AccountType;
  label: string;
  size: number;
  price: number;
  effective_price: number;
  profit_target_pct: number | null;
  daily_dd_pct: number;
  max_dd_pct: number;
  max_leverage: number;
  payout_split_pct: number;
  payout_cycle_days: number;
}

export interface PublicPromo {
  code: string;
  kind: 'percent' | 'fixed';
  value: number;
  plans: 'all' | string[];
  expires_at: string | null;
  note: string | null;
}

export interface PricingResponse {
  payout_split_pct: number;
  payout_cycle_days: number;
  discounts: {
    site_wide_pct: number;
    referral_discount_pct: number;
    referral_commission_pct: number;
    stacking: string;
  };
  promos: PublicPromo[];
  plans: Plan[];
}

export interface Quote {
  plan_key: string;
  list_price: number;
  discount: number;
  final_price: number;
  source: 'promo' | 'referral' | 'site_wide' | 'none';
  promo_code: string | null;
  label: string | null;
}

export interface PromoValidation {
  valid: boolean;
  promo_code: string | null;
  reason: null | 'UNKNOWN_CODE' | 'INACTIVE' | 'EXPIRED' | 'PLAN_NOT_ELIGIBLE' | 'LIMIT_REACHED';
  message?: string;
  quote: Quote;
}

export interface CheckoutResponse {
  transaction_id: string;
  order_id: string;
  invoice_url: string;
  amount: number;
  pricing: Omit<Quote, 'plan_key'>;
  plan: { key: string; label: string; size: number; price: number };
}

export interface MarketSymbol { symbol: string; base: string; quote: string }
export interface MarketPrice { symbol: string; price: number; bid: number; ask: number }
export interface MarketPricesResponse { spread_bps: number; prices: MarketPrice[]; fetched_at: string }

export interface EquityPoint { equity: number; balance: number; source: 'daily_close' | 'trade_close' | 'manual'; taken_at: string }
export interface EquityCurveResponse { account_id: string; starting_size: number; points: EquityPoint[] }

export interface PayoutTx {
  id: string;
  account_id: string;
  amount: number;
  net_amount: number;
  type: string;
  status: 'pending' | 'approved' | 'paid' | 'rejected' | 'failed' | string;
  wallet_address: string | null;
  tx_hash: string | null;
  created_at: string;
  note?: string | null;
  user_email?: string;
  user_id?: string;
}

export interface Eligibility {
  eligible: boolean;
  reasons: string[];
  profit: number;
  max_payout: number;
  split_pct: number;
  next_payout_at: string | null;
  days_remaining: number;
  trading_days?: number;
  min_trading_days?: number;
}

export interface Certificate {
  id: string;
  account_id: string;
  type: 'payout' | 'eval_pass' | string;
  amount: number;
  code: string;
  display_name: string;
  is_manual: boolean;
  issued_at: string;
  image_url: string;
}

export interface Referrals {
  referral_code: string;
  commission_pct: number;
  friend_discount_pct: number;
  signups: number;
  earned_total: number;
  earned_paid: number;
  earned_pending: number;
  history: { amount: number; status: string; created_at: string }[];
}

export interface AdminStats {
  users: number;
  accounts: Record<string, number>;
  revenue_usd: number;
  payouts_paid_usd: number;
  payouts_pending: number;
  kyc_pending: number;
  open_positions: number;
}

export interface AuditLog {
  id: string;
  actor_id: string;
  actor_email: string;
  actor_role: Role;
  action: string;
  target_type: string;
  target_id: string;
  payload: Record<string, unknown> | null;
  ip: string | null;
  created_at: string;
}

export interface SettingsDoc {
  raw: string;
  parsed: Record<string, unknown>;
  version: number;
  updated_at: string;
  updated_by: string;
  default_raw: string;
  default_parsed: Record<string, unknown>;
}

export interface SettingsIssue { line: number | null; message: string }

export interface AdminPromo {
  code: string;
  kind: 'percent' | 'fixed';
  value: number;
  plans: 'all' | string[];
  expires_at: string | null;
  max_uses: number;
  active: boolean;
  note: string | null;
  uses: number;
  remaining: number | null;
  status: 'active' | 'inactive' | 'expired' | 'exhausted';
}
