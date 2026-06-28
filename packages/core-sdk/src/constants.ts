import { Time } from "@iris-credit/iris-ts";

export const BP = 100_000_000_000_000n; // 1e14
export const ORACLE_PRICE_SCALE = 1_000_000_000_000_000_000_000_000_000_000_000_000n; // 1e36
export const SECONDS_PER_YEAR = Time.s.from.y(1n); // 365 days

export const MIN_DURATION = Time.s.from.d(1n);
export const MAX_DURATION = Time.s.from.y(2n);
export const MAX_FIXED_RATE = 1_000_000_000_000_000_000n; // 1e18 (100%)
export const MAX_OVERDUE_RATE = 1_000_000_000_000_000_000n; // 1e18
export const MAX_OVERDUE_PERIOD = Time.s.from.d(30n);

export const MAX_LIF = 150_000_000_000_000_000n; // 0.15e18
export const TIME_TO_MAX_LIF = Time.s.from.min(15n);
export const MAX_BOND_LIF = 50_000_000_000_000_000n; // 0.05e18
export const LIQUIDATION_CURSOR = 500_000_000_000_000_000n; // 0.5e18
export const MAX_FEE = 400_000_000_000_000_000n; // 0.4e18 (40%)

export const QUOTE_TTL = Time.s.from.min(2n);
