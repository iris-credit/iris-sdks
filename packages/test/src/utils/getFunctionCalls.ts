import type {
  Abi,
  AbiStateMutability,
  Address,
  Client,
  ContractFunctionArgs,
  ContractFunctionName,
  Hash,
  Hex,
} from "viem";

import { decodeFunctionData, getAddress } from "viem";

type OtsTraceNode = {
  type: string;
  depth: number;
  from: string;
  to?: string;
  value?: string;
  input?: string;
  output?: string;
  calls?: OtsTraceNode[];
  children?: OtsTraceNode[];
};

type OtsTraceTransactionSchema = {
  Method: "ots_traceTransaction";
  Parameters: [hash: Hash];
  ReturnType: OtsTraceNode[];
};

export type GetFunctionCallsArgs<TAbi extends Abi, TName extends ContractFunctionName<TAbi>> = {
  txHash: Hash;
  abi: TAbi;
  contract: Address;
  functionName: TName;
};

export type FunctionCall<TAbi extends Abi, TName extends ContractFunctionName<TAbi>> = {
  args: ContractFunctionArgs<TAbi, AbiStateMutability, TName>;
  functionName: TName;
};

export async function getFunctionCalls<TAbi extends Abi, TName extends ContractFunctionName<TAbi>>(
  client: Client,
  { txHash, abi, contract, functionName }: GetFunctionCallsArgs<TAbi, TName>,
) {
  const trace = await client.request<OtsTraceTransactionSchema>({
    method: "ots_traceTransaction",
    params: [txHash],
  });

  const target = getAddress(contract);

  const calls: FunctionCall<TAbi, TName>[] = [];

  const walk = (node: OtsTraceNode | OtsTraceNode[]) => {
    if (Array.isArray(node)) return node.forEach(walk);

    if (node?.to && node?.input) {
      if (getAddress(node.to) === target) {
        try {
          const call = decodeFunctionData({
            abi,
            data: node.input as Hex,
          });
          if (call.functionName === functionName)
            calls.push(
              call as {
                args: ContractFunctionArgs<TAbi, AbiStateMutability, TName>;
                functionName: TName;
              },
            );
        } catch {}
      }
    }
    if (Array.isArray(node?.calls)) node.calls.forEach(walk);
    if (node?.children) node.children.forEach(walk);
  };
  walk(trace);

  return calls;
}
