import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { createMockClient, expectReadCall, mockRead } from "@iris-credit/test/mock";
import { COLLATERAL_TOKEN, DEBT_TOKEN, POD, SOLVER, USER } from "../../../test/fixtures/iris.js";
import { irisAbi } from "../../abis/iris.js";
import { getChainAddresses } from "../../addresses.js";
import { ChainId } from "../../chain.js";
import { BP } from "../../constants.js";
import { UnsupportedChainIdError } from "../../errors.js";
import { fetchLoan } from "./fetch.js";
import { Loan } from "./Loan.js";

const { iris } = getChainAddresses(ChainId.EthMainnet);

/** The `getLoan` tuple as the contract returns it: rates and LLTV BP-compressed to `uint16`. */
const storedLoan = {
  borrower: USER,
  solver: SOLVER,
  collateralToken: COLLATERAL_TOKEN,
  debtToken: DEBT_TOKEN,
  venueBitmap: 0b101n,
  maturity: 2_000_000,
  overduePeriod: 3_600,
  fixedRate: 500, // 5%
  overdueRate: 1_000, // 10%
  bondLltv: 9_500, // 95%
  fee: 2_000, // 20%
} as const;

const mockLoanClient = (loan: unknown = storedLoan) => {
  const handle = createMockClient(mainnet);
  mockRead(handle, { address: iris, abi: irisAbi, functionName: "getLoan", result: loan });

  return handle;
};

describe("fetchLoan", () => {
  test("default", async () => {
    const { client } = mockLoanClient();

    expect(await fetchLoan(POD, client)).toStrictEqual(
      new Loan({
        pod: POD,
        borrower: USER,
        solver: SOLVER,
        collateralToken: COLLATERAL_TOKEN,
        debtToken: DEBT_TOKEN,
        venueBitmap: 0b101n,
        maturity: 2_000_000n,
        overduePeriod: 3_600n,
        fixedRate: 50_000_000_000_000_000n,
        overdueRate: 100_000_000_000_000_000n,
        bondLltv: 950_000_000_000_000_000n,
        fee: 200_000_000_000_000_000n,
      }),
    );
  });

  test("behavior: restores BP-compressed rates, LLTV and fee to WAD", async () => {
    const { client } = mockLoanClient();
    const loan = await fetchLoan(POD, client);

    expect(loan.fixedRate).toBe(BigInt(storedLoan.fixedRate) * BP);
    expect(loan.overdueRate).toBe(BigInt(storedLoan.overdueRate) * BP);
    expect(loan.bondLltv).toBe(BigInt(storedLoan.bondLltv) * BP);
    expect(loan.fee).toBe(BigInt(storedLoan.fee) * BP);
  });

  test("behavior: widens the packed timestamps to bigint", async () => {
    const { client } = mockLoanClient();
    const loan = await fetchLoan(POD, client);

    expect(loan.maturity).toBe(2_000_000n);
    expect(loan.overduePeriod).toBe(3_600n);
  });

  test("behavior: keys the loan by the requested pod", async () => {
    // The contract's `Loan` struct carries no pod — the fetcher stamps it from the argument.
    const { client } = mockLoanClient();

    expect((await fetchLoan(POD, client)).pod).toBe(POD);
  });

  test("behavior: reads getLoan on the chain's Iris deployment", async () => {
    const handle = mockLoanClient();

    await fetchLoan(POD, handle.client);

    expect(
      expectReadCall(handle, { address: iris, abi: irisAbi, functionName: "getLoan" }),
    ).toStrictEqual([{ functionName: "getLoan", args: [POD] }]);
  });

  test("behavior: resolves the chain id from the client when omitted", async () => {
    const handle = mockLoanClient();

    await fetchLoan(POD, handle.client);

    expect(handle.request.mock.calls.map(([call]) => call.method)).toContain("eth_chainId");
  });

  test("behavior: skips the chain id read when supplied", async () => {
    const handle = mockLoanClient();

    await fetchLoan(POD, handle.client, { chainId: ChainId.EthMainnet });

    expect(handle.request.mock.calls.map(([call]) => call.method)).not.toContain("eth_chainId");
  });

  test("error: UnsupportedChainIdError", async () => {
    const { client } = mockLoanClient();

    await expect(fetchLoan(POD, client, { chainId: 999 as ChainId })).rejects.toBeInstanceOf(
      UnsupportedChainIdError,
    );
  });

  test("behavior: hydrates a pod with no loan as a zeroed entity", async () => {
    const { client } = mockLoanClient({
      borrower: "0x0000000000000000000000000000000000000000",
      solver: "0x0000000000000000000000000000000000000000",
      collateralToken: "0x0000000000000000000000000000000000000000",
      debtToken: "0x0000000000000000000000000000000000000000",
      venueBitmap: 0n,
      maturity: 0,
      overduePeriod: 0,
      fixedRate: 0,
      overdueRate: 0,
      bondLltv: 0,
      fee: 0,
    });
    const loan = await fetchLoan(POD, client);

    expect(loan.maturity).toBe(0n);
    expect(loan.fixedRate).toBe(0n);
    expect(loan.isVenueAllowed(0n)).toBe(false);
  });
});
