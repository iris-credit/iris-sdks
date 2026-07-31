import type {
  AuthorizationRequirementSignature,
  ERC20ApprovalAction,
  IrisAuthorizationAction,
  PermitRequirementSignature,
  Requirement,
  Transaction,
} from "./actions.js";

import { describe, expect, test } from "vitest";
import { getChainAddresses } from "@iris-credit/core-sdk";
import { CHAIN_ID, COLLATERAL_TOKEN } from "../../test/fixtures/iris.js";
import { authorizationSignature } from "../../test/helpers/iris.js";
import { permit2Signature, permitSignature } from "../../test/helpers/permit.js";
import {
  isAuthorizationSignature,
  isPermitSignature,
  isRequirementApproval,
  isRequirementIrisAuthorization,
  isRequirementSignature,
  selectRequirementSignatures,
} from "./actions.js";
import {
  AmbiguousRequirementSignaturesError,
  UnexpectedRequirementSignatureError,
} from "./errors.js";

const {
  iris,
  bundler3: { generalAdapter1 },
} = getChainAddresses(CHAIN_ID);

const permit = permitSignature();
const permit2 = permit2Signature();
const authorization = authorizationSignature();

const approvalTransaction: Transaction<ERC20ApprovalAction> = {
  to: COLLATERAL_TOKEN,
  value: 0n,
  data: "0x",
  action: {
    type: "erc20Approval",
    args: { spender: generalAdapter1, amount: 1n },
  },
};

const irisAuthorizationTransaction: Transaction<IrisAuthorizationAction> = {
  to: iris,
  value: 0n,
  data: "0x",
  action: {
    type: "irisAuthorization",
    args: { authorized: generalAdapter1, isAuthorized: true },
  },
};

const permitRequirement = {
  action: permit.action,
  sign: async () => permit,
};

describe("isPermitSignature", () => {
  test("default: true for permit", () => {
    expect(isPermitSignature(permit)).toBe(true);
  });

  test("behavior: true for permit2", () => {
    expect(isPermitSignature(permit2)).toBe(true);
  });

  test("behavior: false for authorization", () => {
    expect(isPermitSignature(authorization)).toBe(false);
  });
});

describe("isAuthorizationSignature", () => {
  test("default: true for authorization", () => {
    expect(isAuthorizationSignature(authorization)).toBe(true);
  });

  test("behavior: false for permit", () => {
    expect(isAuthorizationSignature(permit)).toBe(false);
  });

  test("behavior: false for permit2", () => {
    expect(isAuthorizationSignature(permit2)).toBe(false);
  });
});

describe("isRequirementApproval", () => {
  test("default: true for an ERC-20 approval transaction", () => {
    expect(isRequirementApproval(approvalTransaction)).toBe(true);
  });

  test("behavior: false for an Iris authorization transaction", () => {
    expect(isRequirementApproval(irisAuthorizationTransaction)).toBe(false);
  });

  test("behavior: false for a signable requirement", () => {
    expect(isRequirementApproval(permitRequirement)).toBe(false);
  });

  test("behavior: false for non-transaction values", () => {
    expect(isRequirementApproval(undefined)).toBe(false);
    expect(isRequirementApproval(null)).toBe(false);
    expect(isRequirementApproval({ action: { type: "erc20Approval" } })).toBe(false);
  });
});

describe("isRequirementIrisAuthorization", () => {
  test("default: true for an Iris authorization transaction", () => {
    expect(isRequirementIrisAuthorization(irisAuthorizationTransaction)).toBe(true);
  });

  test("behavior: false for an ERC-20 approval transaction", () => {
    expect(isRequirementIrisAuthorization(approvalTransaction)).toBe(false);
  });

  test("behavior: false for a signable requirement", () => {
    expect(isRequirementIrisAuthorization(permitRequirement)).toBe(false);
  });

  test("behavior: false for non-transaction values", () => {
    expect(isRequirementIrisAuthorization(undefined)).toBe(false);
    expect(isRequirementIrisAuthorization(null)).toBe(false);
  });
});

describe("isRequirementSignature", () => {
  test("default: true for a signable requirement", () => {
    expect(isRequirementSignature(permitRequirement)).toBe(true);
  });

  test("behavior: false for an ERC-20 approval transaction", () => {
    expect(isRequirementSignature(approvalTransaction)).toBe(false);
  });

  test("behavior: false for an Iris authorization transaction", () => {
    expect(isRequirementSignature(irisAuthorizationTransaction)).toBe(false);
  });

  test("behavior: false for undefined", () => {
    expect(isRequirementSignature(undefined)).toBe(false);
  });

  // Regression: a union mixing both Requirement kinds (as take / escape / refinance
  // return) must stay callable — the non-generic overload catches what the generic
  // one cannot infer.
  test("behavior: narrows a mixed transaction / requirement union", () => {
    const authorizationRequirement = {
      action: authorization.action,
      sign: async () => authorization,
    };
    const requirements: (
      | Transaction<ERC20ApprovalAction>
      | Transaction<IrisAuthorizationAction>
      | Requirement<PermitRequirementSignature>
      | Requirement<AuthorizationRequirementSignature>
    )[] = [
      approvalTransaction,
      irisAuthorizationTransaction,
      permitRequirement,
      authorizationRequirement,
    ];

    const signable = requirements.filter((requirement) => isRequirementSignature(requirement));

    expect(signable).toEqual([permitRequirement, authorizationRequirement]);
  });
});

describe("selectRequirementSignatures", () => {
  test("default: extracts the single permit and authorization", () => {
    expect(
      selectRequirementSignatures([permit, authorization], {
        permit: true,
        authorization: true,
      }),
    ).toEqual({
      permit,
      authorization,
    });
  });

  test("behavior: empty object for undefined input", () => {
    expect(selectRequirementSignatures(undefined, { permit: true })).toEqual({});
  });

  test("behavior: empty slots when nothing matches", () => {
    expect(selectRequirementSignatures([], { permit: true, authorization: true })).toEqual({
      permit: undefined,
      authorization: undefined,
    });
  });

  test("behavior: a permit2 signature fills the permit slot", () => {
    expect(selectRequirementSignatures([permit2], { permit: true })).toEqual({
      permit: permit2,
    });
  });

  test("error: AmbiguousRequirementSignaturesError on duplicate permits", () => {
    expect(() => selectRequirementSignatures([permit, permit2], { permit: true })).toThrow(
      AmbiguousRequirementSignaturesError,
    );
  });

  test("error: AmbiguousRequirementSignaturesError on duplicate authorizations", () => {
    expect(() =>
      selectRequirementSignatures([authorization, authorization], { authorization: true }),
    ).toThrow(AmbiguousRequirementSignaturesError);
  });

  test("error: UnexpectedRequirementSignatureError when a permit is not consumed", () => {
    expect(() => selectRequirementSignatures([permit], { authorization: true })).toThrow(
      UnexpectedRequirementSignatureError,
    );
  });

  test("error: UnexpectedRequirementSignatureError when an authorization is not consumed", () => {
    expect(() => selectRequirementSignatures([authorization], { permit: true })).toThrow(
      UnexpectedRequirementSignatureError,
    );
  });

  test("error: UnexpectedRequirementSignatureError takes precedence over AmbiguousRequirementSignaturesError", () => {
    expect(() =>
      selectRequirementSignatures([permit, permit2, authorization], { permit: true }),
    ).toThrow(UnexpectedRequirementSignatureError);
  });
});
