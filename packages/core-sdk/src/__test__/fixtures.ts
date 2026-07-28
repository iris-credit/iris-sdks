import type { Address, Hex } from "viem";
import type { ILoan } from "../modules/loan/Loan.js";
import type { IPosition } from "../modules/position/Position.js";
import type { Quote } from "../signatures/quote.js";

import { MathLib } from "../math/index.js";
import { Loan } from "../modules/loan/Loan.js";

/** @internal */
export const USER = "0x0000000000000000000000000000000000000001" as Address;
/** @internal */
export const SOLVER = "0x0000000000000000000000000000000000000002" as Address;
/** @internal */
export const COLLATERAL_TOKEN = "0x0000000000000000000000000000000000000003" as Address;
/** @internal */
export const DEBT_TOKEN = "0x0000000000000000000000000000000000000004" as Address;
/** @internal */
export const POD = "0x0000000000000000000000000000000000000005" as Address;
/** @internal */
export const BLM = "0x0000000000000000000000000000000000000006" as Address;
/** @internal */
export const RECIPIENT = "0x0000000000000000000000000000000000000007" as Address;
/** @internal */
export const SPENDER = "0x0000000000000000000000000000000000000008" as Address;
/** @internal */
export const EMPTY_HEX = "0x" as Hex;

/** @internal */
export const MATURITY = 2_000_000n;
/** @internal */
export const OVERDUE_PERIOD = 3_600n;

/** @internal */
export function loanInput(overrides: Partial<ILoan> = {}): ILoan {
  return {
    pod: POD,
    borrower: USER,
    solver: SOLVER,
    collateralToken: COLLATERAL_TOKEN,
    debtToken: DEBT_TOKEN,
    venueBitmap: 0b101n,
    maturity: MATURITY,
    overduePeriod: OVERDUE_PERIOD,
    fixedRate: 100_000_000_000_000_000n,
    overdueRate: 200_000_000_000_000_000n,
    bondLltv: 950_000_000_000_000_000n,
    fee: 200_000_000_000_000_000n,
    ...overrides,
  };
}

/** @internal */
export function loan(overrides: Partial<ILoan> = {}) {
  return new Loan(loanInput(overrides));
}

/** @internal */
export function positionInput(overrides: Partial<IPosition> = {}): IPosition {
  return {
    pod: POD,
    collateral: 2n * MathLib.WAD,
    debt: MathLib.WAD,
    bond: 100_000_000_000_000_000n,
    bondRequirement: 1n,
    collateralIndex: MathLib.RAY,
    debtIndex: MathLib.RAY,
    fixedLeg: 0n,
    floatingLeg: 0n,
    surplus: 0n,
    lastUpdate: MATURITY,
    venueId: 0n,
    data: EMPTY_HEX,
    ...overrides,
  };
}

/** @internal */
export function quoteInput(overrides: Partial<Quote> = {}): Quote {
  return {
    borrower: USER,
    solver: SOLVER,
    receiver: RECIPIENT,
    blm: BLM,
    collateralToken: COLLATERAL_TOKEN,
    debtToken: DEBT_TOKEN,
    collateral: 2n * MathLib.WAD,
    debt: MathLib.WAD,
    fixedRate: 100_000_000_000_000_000n,
    duration: 2_592_000n,
    overdueRate: 200_000_000_000_000_000n,
    overduePeriod: OVERDUE_PERIOD,
    bond: 100_000_000_000_000_000n,
    bondLltv: 950_000_000_000_000_000n,
    venueBitmap: 0b101n,
    venueId: 0n,
    deadline: MATURITY,
    nonce: 1n,
    data: EMPTY_HEX,
    ...overrides,
  };
}
