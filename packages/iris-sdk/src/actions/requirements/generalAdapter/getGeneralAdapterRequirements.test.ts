import type { Address, Client } from "viem";
import type { MockClientHandle } from "@iris-credit/test/mock";

import { erc20Abi } from "viem";
import { mainnet } from "viem/chains";
import { beforeEach, describe, expect, test } from "vitest";
import { erc2612Abi, getChainAddresses, MathLib, permit2Abi } from "@iris-credit/core-sdk";
import { createMockClient, expectReadCall, mockRead } from "@iris-credit/test/mock";
import { CHAIN_ID, USER_A } from "../../../../test/fixtures/iris.js";
import {
  ChainIdMismatchError,
  isRequirementApproval,
  isRequirementSignature,
} from "../../../types/index.js";
import { getGeneralAdapterRequirements } from "./getGeneralAdapterRequirements.js";
import { getGeneralAdapterRequirementsPermit } from "./getGeneralAdapterRequirementsPermit.js";

describe("getGeneralAdapterRequirements", () => {
  const {
    permit2,
    tokens: { DAI, USDC, WETH },
    bundler3: { generalAdapter1 },
  } = getChainAddresses(CHAIN_ID);

  const mockFrom: Address = USER_A;
  const mockAmount = 1000000n;

  let mockClient: Client;
  let mockHandle: MockClientHandle;

  /**
   * Registers the chain reads a single `getGeneralAdapterRequirements` call makes. Each flow
   * reads at most one ERC-20 `allowance` (against GeneralAdapter1 or Permit2 depending on the
   * flow), so one registration per token suffices.
   */
  const mockTokenReads = (
    token: Address,
    reads: {
      erc20Allowance?: bigint;
      erc2612Nonce?: bigint;
      permit2Allowance?: readonly [bigint, number, number];
    },
  ) => {
    if (reads.erc20Allowance != null) {
      mockRead(mockHandle, {
        address: token,
        abi: erc20Abi,
        functionName: "allowance",
        result: reads.erc20Allowance,
      });
    }
    if (reads.erc2612Nonce != null) {
      mockRead(mockHandle, {
        address: token,
        abi: erc2612Abi,
        functionName: "nonces",
        result: reads.erc2612Nonce,
      });
    }
    if (reads.permit2Allowance != null) {
      mockRead(mockHandle, {
        address: permit2,
        abi: permit2Abi,
        functionName: "allowance",
        result: reads.permit2Allowance,
      });
    }
  };

  /** Registers the metadata reads `fetchToken` performs inside the simple-permit path. */
  const mockTokenMetadata = (token: Address) => {
    mockRead(mockHandle, {
      address: token,
      abi: erc20Abi,
      functionName: "decimals",
      result: 6,
    });
    mockRead(mockHandle, {
      address: token,
      abi: erc20Abi,
      functionName: "symbol",
      result: "USDC",
    });
    mockRead(mockHandle, {
      address: token,
      abi: erc20Abi,
      functionName: "name",
      result: "USD Coin",
    });
  };

  beforeEach(() => {
    mockHandle = createMockClient(mainnet);
    mockClient = mockHandle.client;
  });

  describe("ChainId validation", () => {
    test("should throw ChainIdMismatchError when chainId does not match", async () => {
      const clientWithWrongChain = {
        chain: {
          id: 137, // Polygon instead of mainnet
        },
      } as unknown as Client;

      await expect(
        getGeneralAdapterRequirements(clientWithWrongChain, {
          supportSignature: false,
          address: USDC,
          chainId: CHAIN_ID,
          args: { amount: mockAmount, from: mockFrom },
        }),
      ).rejects.toThrow(new ChainIdMismatchError(137, CHAIN_ID));
    });
  });

  describe("Flow 1: supportSignature = false (classic approval)", () => {
    test("should return approval when allowance is less than amount", async () => {
      mockTokenReads(USDC, { erc20Allowance: 500000n });

      const requirements = await getGeneralAdapterRequirements(mockClient, {
        supportSignature: false,
        address: USDC,
        chainId: CHAIN_ID,
        args: { amount: mockAmount, from: mockFrom },
      });

      expect(requirements).toHaveLength(1);
      const approval = requirements[0];
      if (!isRequirementApproval(approval)) {
        throw new Error("Requirement is not an approval transaction");
      }
      expect(approval.action.type).toBe("erc20Approval");
      expect(approval.action.args.spender).toBe(generalAdapter1);
      expect(approval.action.args.amount).toBe(mockAmount);

      // The classic flow must measure the allowance the bundle actually spends: GeneralAdapter1's.
      expect(
        expectReadCall(mockHandle, {
          address: USDC,
          abi: erc20Abi,
          functionName: "allowance",
        }).map((call) => call.args),
      ).toEqual([[mockFrom, generalAdapter1]]);
    });

    test("should return empty array when allowance is sufficient", async () => {
      mockTokenReads(USDC, { erc20Allowance: 2000000n });

      const requirements = await getGeneralAdapterRequirements(mockClient, {
        supportSignature: false,
        address: USDC,
        chainId: CHAIN_ID,
        args: { amount: mockAmount, from: mockFrom },
      });

      expect(requirements).toHaveLength(0);
    });
  });

  describe("supportSignature = true", () => {
    describe("Flow 2: Simple permit (EIP-2612)", () => {
      test("should return simple permit requirement when erc2612Nonce is defined", async () => {
        mockTokenReads(USDC, { erc2612Nonce: 0n });
        mockTokenMetadata(USDC);

        const requirements = await getGeneralAdapterRequirements(mockClient, {
          supportSignature: true,
          address: USDC,
          chainId: CHAIN_ID,
          args: { amount: mockAmount, from: mockFrom },
          useSimplePermit: true,
        });

        expect(requirements).toHaveLength(1);
        const permit = requirements[0];
        if (!isRequirementSignature(permit)) {
          throw new Error("Requirement is not a permit transaction");
        }
        expect(permit.action.type).toBe("permit");
        expect(permit.action.args.spender).toBe(generalAdapter1);
        expect(permit.action.args.amount).toBe(mockAmount);
      });

      test("should return simple permit when direct allowance is sufficient", async () => {
        mockTokenReads(USDC, { erc20Allowance: 2000000n, erc2612Nonce: 0n });
        mockTokenMetadata(USDC);

        const requirements = await getGeneralAdapterRequirements(mockClient, {
          supportSignature: true,
          address: USDC,
          chainId: CHAIN_ID,
          args: { amount: mockAmount, from: mockFrom },
          useSimplePermit: true,
        });

        expect(requirements).toHaveLength(1);
        const permit = requirements[0];
        if (!isRequirementSignature(permit)) {
          throw new Error("Requirement is not a permit transaction");
        }
        expect(permit.action.type).toBe("permit");
        expect(permit.action.args.amount).toBe(mockAmount);
      });
    });

    describe("Flow 3: Permit2", () => {
      test("should return permit2 requirement with prior approval for permit2", async () => {
        mockTokenReads(WETH, { erc20Allowance: 0n, permit2Allowance: [0n, 0, 0] });

        const requirements = await getGeneralAdapterRequirements(mockClient, {
          supportSignature: true,
          address: WETH,
          chainId: CHAIN_ID,
          args: { amount: mockAmount, from: mockFrom },
        });

        // Should return permit2 approval + permit2 requirement
        expect(requirements.length).toBe(2);

        const approval = requirements[0];
        if (!isRequirementApproval(approval)) {
          throw new Error("Requirement is not an approval transaction");
        }
        expect(approval.action.type).toBe("erc20Approval");
        expect(approval.action.args.spender).toBe(permit2);
        expect(approval.action.args.amount).toBe(MathLib.MAX_UINT_160); // Always approve infinite.

        // Check for permit2 requirement
        const permit2Requirement = requirements[1];
        if (!isRequirementSignature(permit2Requirement)) {
          throw new Error("Requirement is not a requirement signature");
        }
        expect(permit2Requirement.action.type).toBe("permit2");
        expect(permit2Requirement.action.args.spender).toBe(generalAdapter1);
        expect(permit2Requirement.action.args.amount).toBe(mockAmount);

        // The Permit2 flow measures the ERC-20 allowance granted to Permit2 — not to
        // GeneralAdapter1 — and reads the Permit2 tuple for the (owner, token, spender) it signs.
        expect(
          expectReadCall(mockHandle, {
            address: WETH,
            abi: erc20Abi,
            functionName: "allowance",
          }).map((call) => call.args),
        ).toEqual([[mockFrom, permit2]]);
        expect(
          expectReadCall(mockHandle, {
            address: permit2,
            abi: permit2Abi,
            functionName: "allowance",
          }).map((call) => call.args),
        ).toEqual([[mockFrom, WETH, generalAdapter1]]);
      });

      test("should return permit2 only when prior approval for permit2 is sufficient", async () => {
        mockTokenReads(WETH, { erc20Allowance: 2000000n, permit2Allowance: [0n, 0, 0] });

        const requirements = await getGeneralAdapterRequirements(mockClient, {
          supportSignature: true,
          address: WETH,
          chainId: CHAIN_ID,
          args: { amount: mockAmount, from: mockFrom },
        });

        expect(requirements).toHaveLength(1);
        const permit2Requirement = requirements[0];
        if (!isRequirementSignature(permit2Requirement)) {
          throw new Error("Requirement is not a requirement signature");
        }
        expect(permit2Requirement.action.type).toBe("permit2");
        expect(permit2Requirement.action.args.spender).toBe(generalAdapter1);
        expect(permit2Requirement.action.args.amount).toBe(mockAmount);
      });

      test("should return permit2 requirement when residual permit2 allowance is sufficient", async () => {
        mockTokenReads(WETH, {
          erc20Allowance: 2000000n, // Sufficient permit2 allowance
          permit2Allowance: [2000000n, Number(MathLib.MAX_UINT_48), 0], // Sufficient amount
        });

        const requirements = await getGeneralAdapterRequirements(mockClient, {
          supportSignature: true,
          address: WETH,
          chainId: CHAIN_ID,
          args: { amount: mockAmount, from: mockFrom },
        });

        expect(requirements).toHaveLength(1);
        const permit2Requirement = requirements[0];
        if (!isRequirementSignature(permit2Requirement)) {
          throw new Error("Requirement is not a requirement signature");
        }
        expect(permit2Requirement.action.type).toBe("permit2");
        expect(permit2Requirement.action.args.spender).toBe(generalAdapter1);
        expect(permit2Requirement.action.args.amount).toBe(mockAmount);
      });

      test("should return permit2 requirement when residual permit2 allowance is expired", async () => {
        mockTokenReads(WETH, {
          erc20Allowance: 2000000n, // Sufficient permit2 allowance
          permit2Allowance: [2000000n, 0, 0], // Sufficient amount, expired
        });

        const requirements = await getGeneralAdapterRequirements(mockClient, {
          supportSignature: true,
          address: WETH,
          chainId: CHAIN_ID,
          args: { amount: mockAmount, from: mockFrom },
        });

        expect(requirements).toHaveLength(1);
        const permit2Requirement = requirements[0];
        if (!isRequirementSignature(permit2Requirement)) {
          throw new Error("Requirement is not a requirement signature");
        }
        expect(permit2Requirement.action.type).toBe("permit2");
        expect(permit2Requirement.action.args.amount).toBe(mockAmount);
      });

      test("should fall back to permit2 when simple permit is not requested", async () => {
        mockTokenReads(USDC, {
          erc20Allowance: 2000000n,
          erc2612Nonce: 0n,
          permit2Allowance: [0n, 0, 0],
        });

        const requirements = await getGeneralAdapterRequirements(mockClient, {
          supportSignature: true,
          address: USDC,
          chainId: CHAIN_ID,
          args: { amount: mockAmount, from: mockFrom },
        });

        expect(requirements).toHaveLength(1);
        expect(requirements[0]?.action.type).toBe("permit2");
      });

      test("should fall back to permit2 when the ERC-2612 nonce probe fails", async () => {
        // No `nonces` read registered: the probe throws and is swallowed into `undefined`.
        mockTokenReads(USDC, { erc20Allowance: 2000000n, permit2Allowance: [0n, 0, 0] });

        const requirements = await getGeneralAdapterRequirements(mockClient, {
          supportSignature: true,
          address: USDC,
          chainId: CHAIN_ID,
          args: { amount: mockAmount, from: mockFrom },
          useSimplePermit: true,
        });

        expect(requirements).toHaveLength(1);
        expect(requirements[0]?.action.type).toBe("permit2");
      });

      test("should return permit2 requirement when DAI exposes nonce and simple permit is requested", async () => {
        mockTokenReads(DAI, {
          erc20Allowance: 0n,
          erc2612Nonce: 0n,
          permit2Allowance: [0n, 0, 0],
        });

        const requirements = await getGeneralAdapterRequirements(mockClient, {
          supportSignature: true,
          address: DAI,
          chainId: CHAIN_ID,
          args: { amount: mockAmount, from: mockFrom },
          useSimplePermit: true,
        });

        expect(requirements).toHaveLength(2);

        const approvalPermit2 = requirements[0];
        if (!isRequirementApproval(approvalPermit2)) {
          throw new Error("Requirement is not an approval transaction");
        }
        expect(approvalPermit2.action.type).toBe("erc20Approval");
        expect(approvalPermit2.action.args.spender).toBe(permit2);
        expect(approvalPermit2.action.args.amount).toBe(MathLib.MAX_UINT_160);

        const permit2Requirement = requirements[1];
        if (!isRequirementSignature(permit2Requirement)) {
          throw new Error("Requirement is not a permit transaction");
        }
        expect(permit2Requirement.action.type).toBe("permit2");
        expect(permit2Requirement.action.args.spender).toBe(generalAdapter1);
        expect(permit2Requirement.action.args.amount).toBe(mockAmount);
      });

      test("should compare DAI case-insensitively before excluding simple permit", async () => {
        const lowerCaseDai = DAI.toLowerCase() as Address;
        mockTokenReads(lowerCaseDai, {
          erc20Allowance: 0n,
          erc2612Nonce: 0n,
          permit2Allowance: [0n, 0, 0],
        });

        const requirements = await getGeneralAdapterRequirements(mockClient, {
          supportSignature: true,
          address: lowerCaseDai,
          chainId: CHAIN_ID,
          args: { amount: mockAmount, from: mockFrom },
          useSimplePermit: true,
        });

        expect(requirements).toHaveLength(2);

        const approvalPermit2 = requirements[0];
        if (!isRequirementApproval(approvalPermit2)) {
          throw new Error("Requirement is not an approval transaction");
        }
        expect(approvalPermit2.action.type).toBe("erc20Approval");
        expect(approvalPermit2.action.args.spender).toBe(permit2);

        const permit2Requirement = requirements[1];
        if (!isRequirementSignature(permit2Requirement)) {
          throw new Error("Requirement is not a permit transaction");
        }
        expect(permit2Requirement.action.type).toBe("permit2");
        expect(permit2Requirement.action.args.spender).toBe(generalAdapter1);
      });
    });
  });

  describe("direct requirement helpers", () => {
    test("getGeneralAdapterRequirementsPermit returns an exact permit requirement", async () => {
      mockTokenMetadata(USDC);

      const requirements = await getGeneralAdapterRequirementsPermit(mockClient, {
        token: USDC,
        chainId: CHAIN_ID,
        args: { amount: mockAmount },
        nonce: 0n,
      });

      expect(requirements).toHaveLength(1);
      expect(requirements[0]?.action.type).toBe("permit");
      expect(requirements[0]?.action.args.amount).toBe(mockAmount);
      expect(requirements[0]?.action.args.spender).toBe(generalAdapter1);
    });
  });
});
