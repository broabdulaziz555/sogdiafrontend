/** Shared disclosure copy. Components import from here instead of hardcoding it. */

export const EXECUTION_PATH = '/legal/execution';

export const EXECUTION_SHORT =
  "Orders are executed against SOGDIA's execution engine using third-party reference prices, with a 0.05% spread applied on entry and exit. See the";


export const TERMS_TITLE = "SOGDIA \u2014 Trading Execution, Evaluation and Capital Allocation";

export const TERMS_SECTIONS: { title: string; paras: string[] }[] = [
  {
    "title": "Account Rules",
    "paras": [
      "The trading rules, evaluation objectives, risk limits, fee schedule and other applicable account conditions are established and recorded at the time an account is purchased. Each account remains subject to its applicable rule set, except where changes are permitted under the governing terms or required by law."
    ]
  },
  {
    "title": "Market Data and Order Execution",
    "paras": [
      "SOGDIA provides a proprietary trading evaluation and capital-allocation program. Orders submitted through SOGDIA accounts are executed against SOGDIA's execution engine using reference prices obtained from third-party venues, as set out in the Execution Disclosure (/legal/execution). Trader orders are not routed to an external execution venue.",
      "SOGDIA's trading interface may display market data obtained from third-party providers. Displayed reference prices are not a guarantee of the price at which an order will execute. Orders may be rejected or cancelled, or executed at a price different from the displayed reference price. Actual execution details are determined by SOGDIA's execution records.",
      "Where an account is designated for live-market execution under its account agreement, the resulting transactions are additionally subject to the execution venue's or counterparty's available liquidity, market conditions, trading hours, order acceptance criteria and applicable execution policies, and may be partially filled or rejected. SOGDIA will identify any such account in its account terms."
    ]
  },
  {
    "title": "Trading Costs",
    "paras": [
      "Traders are responsible for the trading costs disclosed for their account, which may include spreads, commissions, financing charges, swaps and other applicable fees.",
      "Any additional SOGDIA execution markup or spread adjustment will be disclosed in the applicable account terms. Such adjustments will not be described as third-party market costs unless they are genuinely charged by the relevant provider."
    ]
  },
  {
    "title": "Evaluation and Qualification",
    "paras": [
      "Evaluation accounts are assessed against the objectives and risk parameters assigned to the relevant account. Traders who meet those objectives will be offered a capital allocation upon satisfying the applicable qualification, verification and contractual requirements.",
      "SOGDIA may review trading activity for compliance with published rules, risk limits and applicable legal requirements."
    ]
  },
  {
    "title": "Funded Trading and Capital Allocation",
    "paras": [
      "Eligible traders will be offered a funded trading arrangement through SOGDIA or a designated capital or execution partner. The identity of the contracting entity, capital provider, execution provider, applicable trading limits, loss allocation and compensation arrangements will be specified in the relevant agreement.",
      "A funded account is subject to its written allocation terms. The account's stated notional size does not, by itself, represent cash deposited with or owned by the trader."
    ]
  },
  {
    "title": "Risk Controls and Records",
    "paras": [
      "Trading activity is subject to applicable position limits, drawdown requirements, exposure restrictions and other disclosed risk controls. Orders, execution reports and relevant account activity may be recorded and reconciled for risk management, compliance, dispute resolution and account administration."
    ]
  },
  {
    "title": "Disclosure of Execution Model",
    "paras": [
      "SOGDIA will identify whether the applicable account uses live-market execution, simulated execution or a combination of these arrangements. No account will be represented as executing real-market trades unless the relevant execution arrangements support that representation.",
      "The execution model currently applicable to all accounts is set out in the Execution Disclosure (/legal/execution)."
    ]
  }
];

export const TERMS_CLOSING = "These terms are subject to the applicable account agreement, partner agreements and governing law.";

export const TRADING_FOOTER =
  'Trading and execution. SOGDIA operates a proprietary trading and risk-management framework. Evaluation accounts are governed by the rules in effect at the time of purchase. Traders who meet the stated objectives will be offered a funded arrangement, subject to verification and the applicable funding terms. SOGDIA maintains capital and execution partner relationships. The execution model, spreads and fees applicable to each account are set out in the Execution Disclosure and the applicable account terms. Market data may be delayed, interrupted or inaccurate.';
