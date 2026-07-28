import type { ILoan } from "../../src/modules/loan/Loan.js";
import type { IPosition } from "../../src/modules/position/Position.js";
import type { Quote } from "../../src/signatures/quote.js";

import { MathLib } from "../../src/math/index.js";
import { Loan } from "../../src/modules/loan/Loan.js";
import {
  BLM,
  COLLATERAL_TOKEN,
  DEBT_TOKEN,
  EMPTY_HEX,
  MATURITY,
  OVERDUE_PERIOD,
  POD,
  RECIPIENT,
  SOLVER,
  USER,
} from "../fixtures/iris.js";

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
