/** All statuses a loan can be in.
 *
 * The iris-indexer maintains a SQL mirror of this vocabulary and of
 * `deriveStatus`; names and values are a contract and must not drift.
 */
export const LOAN_STATUSES = [
  "active",
  "overdue",
  "defaulted",
  "bond_liquidated",
  "closed",
] as const;

export type LoanStatus = (typeof LOAN_STATUSES)[number];

/** What ended a loan's life, `null` while it is still alive. */
export type ClosureCause = "repaid" | "liquidated" | "bond_liquidated" | "bad_debt";

/** Lifecycle event kinds recorded per loan.
 *
 * These match the indexer's `loanEvent.kind` column values — exact casing matters.
 */
export const LIFECYCLE_EVENT_KINDS = [
  "Take",
  "Repay",
  "Liquidate",
  "LiquidateBond",
  "Escape",
  "Rebase",
  "Refinance",
] as const;

export type LifecycleEventKind = (typeof LIFECYCLE_EVENT_KINDS)[number];

/**
 * Derives a loan's status and closure cause: numbers decide aliveness, the
 * diary decides the cause.
 *
 * While `debt > 0`, status is purely time-based — overdueRate accrues from
 * maturity (Iris.sol:865) and liquidation opens strictly AFTER
 * `maturity + overduePeriod` (Iris.sol:499), so `now == maturity` is still
 * active and `now == maturity + overduePeriod` is still overdue.
 *
 * When `debt = 0`, the loan's recorded lifecycle events name the cause; the
 * closers (Repay / Liquidate / LiquidateBond / Rebase-bad-debt) are mutually
 * exclusive per loan, and Escape may follow any of them. `bond_liquidated`
 * means the bond was seized but collateral is still stranded in the venue
 * awaiting escape.
 *
 * @param row The loan's current numbers, in seconds-based timestamps.
 * @param kinds The set of lifecycle event kinds recorded for the loan.
 * @param now The timestamp to evaluate at, in seconds.
 */
export const deriveStatus = (
  row: { debt: bigint; maturity: bigint; overduePeriod: bigint },
  kinds: ReadonlySet<string>,
  now: bigint,
): { status: LoanStatus; closureCause: ClosureCause | null } => {
  if (row.debt > 0n) {
    if (now <= row.maturity) return { status: "active", closureCause: null };
    if (now <= row.maturity + row.overduePeriod) return { status: "overdue", closureCause: null };
    return { status: "defaulted", closureCause: null };
  }
  if (kinds.has("LiquidateBond")) {
    return kinds.has("Escape")
      ? { status: "closed", closureCause: "bond_liquidated" }
      : { status: "bond_liquidated", closureCause: "bond_liquidated" };
  }
  if (kinds.has("Repay")) return { status: "closed", closureCause: "repaid" };
  if (kinds.has("Liquidate")) return { status: "closed", closureCause: "liquidated" };
  if (kinds.has("Rebase")) return { status: "closed", closureCause: "bad_debt" };
  return { status: "closed", closureCause: null };
};
