import { describe, expect, test, vi } from "vitest";
import {
  bigIntComparator,
  createGetValue,
  createHasValue,
  deepFreeze,
  entries,
  filterDefined,
  fromEntries,
  getLast,
  getLastDefined,
  getValue,
  hasValue,
  isDefined,
  isNotNull,
  isNotUndefined,
  keys,
  mergeEntries,
  retryPromiseLinearBackoff,
  transformValue,
  values,
  ZERO_ADDRESS,
} from "../src/index.js";

describe("ZERO_ADDRESS", () => {
  test("is the canonical zero address", () => {
    expect(ZERO_ADDRESS).toBe("0x0000000000000000000000000000000000000000");
  });

  test("has length 42 (0x + 40 hex chars)", () => {
    expect(ZERO_ADDRESS.length).toBe(42);
  });
});

describe("utils", () => {
  test("should list keys of object", async () => {
    expect(keys({ a: 1, b: 2, 3: "c", 1.1: 1 })).toEqual(["3", "a", "b", "1.1"]);
  });

  test("should list keys of array", async () => {
    expect(keys([1, 2, 3])).toEqual(["0", "1", "2"]);
  });

  test("keys of array has correct type (template literal, not number)", () => {
    const result = keys([1, 2, 3]);
    expect(result).toEqual(["0", "1", "2"]);
    expect(typeof result[0]).toBe("string");
  });

  test("keys() returns sorted-by-insertion (numeric first, then string)", () => {
    expect(keys({ b: 2, a: 1, "3": "c" })).toEqual(["3", "b", "a"]);
  });

  test("keys() handles empty object", () => {
    expect(keys({})).toEqual([]);
  });

  test("keys() handles null/undefined input", () => {
    expect(keys()).toEqual([]);
    expect(keys(null as unknown as object)).toEqual([]);
  });
});

describe("deepFreeze", () => {
  test("returns null without crashing", () => {
    expect(deepFreeze(null)).toBe(null);
  });

  test("returns undefined without crashing", () => {
    expect(deepFreeze(undefined)).toBe(undefined);
  });

  test("freezes a normal object", () => {
    const obj = { a: 1, b: { c: 2 } };
    const frozen = deepFreeze(obj);
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.b)).toBe(true);
  });

  test("freezes arrays", () => {
    const obj = { items: [1, 2, 3] };
    deepFreeze(obj);
    expect(Object.isFrozen(obj.items)).toBe(true);
  });

  test("returns the same reference", () => {
    const obj = { a: 1 };
    expect(deepFreeze(obj)).toBe(obj);
  });

  test("frozen objects throw TypeError on mutation in strict mode", () => {
    const obj = { a: 1 };
    deepFreeze(obj);
    // ESM modules are strict-mode by default, so writing to a frozen
    // object throws `TypeError`. Pinning the class catches a regression
    // that downgrades to silent no-op (loose-mode behaviour).
    expect(() => {
      obj.a = 2;
    }).toThrow(TypeError);
  });

  test("handles primitive scalars without throwing", () => {
    // The implementation calls Object.getOwnPropertyNames which works on primitives via boxing.
    expect(() => deepFreeze(0 as unknown as object)).not.toThrow();
    expect(() => deepFreeze("string" as unknown as object)).not.toThrow();
  });
});

describe("bigIntComparator", () => {
  test("sorts in ascending order by default", () => {
    const items = [{ v: 3n }, { v: 1n }, { v: 2n }];
    items.sort(bigIntComparator((x) => x.v));
    expect(items.map((x) => x.v)).toEqual([1n, 2n, 3n]);
  });

  test("sorts in descending order", () => {
    const items = [{ v: 3n }, { v: 1n }, { v: 2n }];
    items.sort(bigIntComparator((x) => x.v, "desc"));
    expect(items.map((x) => x.v)).toEqual([3n, 2n, 1n]);
  });

  test("puts null values last in ascending sort", () => {
    const items = [{ v: null as bigint | null }, { v: 1n }, { v: null as bigint | null }];
    items.sort(bigIntComparator((x) => x.v));
    expect(items[0]!.v).toBe(1n);
    expect(items[1]!.v).toBeNull();
    expect(items[2]!.v).toBeNull();
  });

  test("puts undefined values last in descending sort", () => {
    const items = [
      { v: undefined as bigint | undefined },
      { v: 5n },
      { v: undefined as bigint | undefined },
    ];
    items.sort(bigIntComparator((x) => x.v, "desc"));
    expect(items[0]!.v).toBe(5n);
    expect(items[1]!.v).toBeUndefined();
    expect(items[2]!.v).toBeUndefined();
  });

  test("two null values are equal (returns 0)", () => {
    const comparator = bigIntComparator((x: bigint | null) => x);
    expect(comparator(null, null)).toBe(0);
  });

  test("handles equal bigint values (returns -1)", () => {
    const comparator = bigIntComparator((x: bigint) => x);
    // xA > xB is false when equal, so ascending returns -1
    expect(comparator(5n, 5n)).toBe(-1);
  });

  test("works with plain bigint getter", () => {
    const arr = [100n, 50n, 75n];
    arr.sort(bigIntComparator((x) => x));
    expect(arr).toEqual([50n, 75n, 100n]);
  });

  test("treats two undefined entries, and mixed nullish entries, as equal (returns 0)", () => {
    const cmpUndef = bigIntComparator<{ v: bigint | undefined }>((x) => x.v);
    expect(cmpUndef({ v: undefined }, { v: undefined })).toBe(0);

    // Mixed nullish: source uses `xA == null && xB == null`.
    const cmpMixed = bigIntComparator<{ v: bigint | null | undefined }>((x) => x.v);
    expect(cmpMixed({ v: null }, { v: undefined })).toBe(0);
  });

  test("works with very large bigints", () => {
    const items = [{ v: 2n ** 256n - 1n }, { v: 0n }, { v: 1n }];
    items.sort(bigIntComparator((x) => x.v));
    expect(items.map((x) => x.v)).toEqual([0n, 1n, 2n ** 256n - 1n]);
  });
});

describe("mergeEntries", () => {
  test("builds an object from entries with no duplicates", () => {
    const result = mergeEntries(
      [
        ["a", 1],
        ["b", 2],
      ] as [string, number][],
      (prev, curr) => prev + curr,
    );
    expect(result).toEqual({ a: 1, b: 2 });
  });

  test("merges duplicate keys using the merger function", () => {
    const result = mergeEntries(
      [
        ["a", 1],
        ["b", 2],
        ["a", 3],
      ] as [string, number][],
      (prev, curr) => prev + curr,
    );
    expect(result).toEqual({ a: 4, b: 2 });
  });

  test("uses last value when merger always returns curr", () => {
    const result = mergeEntries(
      [
        ["x", "first"],
        ["x", "second"],
        ["x", "third"],
      ] as [string, string][],
      (_prev, curr) => curr,
    );
    expect(result).toEqual({ x: "third" });
  });

  test("uses first value when merger always returns prev", () => {
    const result = mergeEntries(
      [
        ["x", "first"],
        ["x", "second"],
      ] as [string, string][],
      (prev) => prev,
    );
    expect(result).toEqual({ x: "first" });
  });

  test("handles empty iterable", () => {
    const result = mergeEntries([] as [string, number][], (prev, curr) => prev + curr);
    expect(result).toEqual({});
  });

  test("merges entries from a Map", () => {
    const map = new Map([
      ["a", 10],
      ["b", 20],
    ]);
    const result = mergeEntries(map, (prev, curr) => prev + curr);
    expect(result).toEqual({ a: 10, b: 20 });
  });

  test("does not call merger for first occurrence of a key", () => {
    const merger = vi.fn((a: number, b: number) => a + b);
    mergeEntries<string, number>(
      [
        ["a", 1],
        ["b", 2],
      ],
      merger,
    );
    expect(merger).not.toHaveBeenCalled();
  });

  test("supports objects (last-write semantics via merger)", () => {
    const merged = mergeEntries<string, { x: number }>(
      [
        ["a", { x: 1 }],
        ["a", { x: 2 }],
      ],
      (_, v) => v,
    );
    expect(merged).toEqual({ a: { x: 2 } });
  });
});

describe("retryPromiseLinearBackoff", () => {
  test("returns result on first successful call", async () => {
    const func = vi.fn().mockResolvedValue(42);
    const result = await retryPromiseLinearBackoff(func, { timeout: 0, retries: 3 });
    expect(result).toBe(42);
    expect(func).toHaveBeenCalledTimes(1);
  });

  test("retries and succeeds on subsequent attempt", async () => {
    let calls = 0;
    const func = vi.fn().mockImplementation(() => {
      calls++;
      if (calls < 3) throw new Error("fail");
      return Promise.resolve("ok");
    });
    const result = await retryPromiseLinearBackoff(func, { timeout: 0, retries: 5 });
    expect(result).toBe("ok");
    expect(func).toHaveBeenCalledTimes(3);
  });

  test("throws 'too many retries' after exhausting all retries", async () => {
    const func = vi.fn().mockRejectedValue(new Error("always fails"));
    await expect(retryPromiseLinearBackoff(func, { timeout: 0, retries: 3 })).rejects.toThrow(
      "too many retries",
    );
    expect(func).toHaveBeenCalledTimes(3);
  });

  test("calls onError callback on each failure", async () => {
    const errors: unknown[] = [];
    const indices: number[] = [];
    const func = vi.fn().mockRejectedValue(new Error("err"));
    await expect(
      retryPromiseLinearBackoff(func, {
        timeout: 0,
        retries: 2,
        onError: (error, index) => {
          errors.push(error);
          indices.push(index);
        },
      }),
    ).rejects.toThrow("too many retries");
    expect(indices).toEqual([0, 1]);
    expect(errors).toHaveLength(2);
  });

  test("stops retrying if onError returns truthy", async () => {
    const func = vi.fn().mockRejectedValue(new Error("err"));
    await expect(
      retryPromiseLinearBackoff(func, {
        timeout: 0,
        retries: 5,
        onError: () => true,
      }),
    ).rejects.toThrow("stopped retrying");
    expect(func).toHaveBeenCalledTimes(1);
  });

  test("continues retrying when onError returns falsy", async () => {
    let attempts = 0;
    const func = vi.fn(async () => {
      attempts++;
      if (attempts < 2) throw new Error("transient");
      return "ok";
    });
    const onError = vi.fn(async () => false);
    const result = await retryPromiseLinearBackoff(func, {
      timeout: 0,
      retries: 5,
      onError,
    });
    expect(result).toBe("ok");
    expect(onError).toHaveBeenCalledTimes(1);
  });

  test("uses default timeout=100 and retries=8 when omitted", async () => {
    const func = vi.fn(async () => "ok");
    const result = await retryPromiseLinearBackoff(func, {});
    expect(result).toBe("ok");
  });
});

describe("isNotNull", () => {
  test("returns true for non-null values", () => {
    expect(isNotNull(0)).toBe(true);
    expect(isNotNull("")).toBe(true);
    expect(isNotNull(false)).toBe(true);
    expect(isNotNull(undefined)).toBe(true);
  });

  test("returns false for null", () => {
    expect(isNotNull(null)).toBe(false);
  });

  test("narrows the type", () => {
    const v: string | null = "hello" as string | null;
    if (isNotNull(v)) {
      // type-narrowed to string at compile time
      expect(v.length).toBe(5);
    }
  });
});

describe("isNotUndefined", () => {
  test("returns true for non-undefined values", () => {
    expect(isNotUndefined(0)).toBe(true);
    expect(isNotUndefined("")).toBe(true);
    expect(isNotUndefined(null)).toBe(true);
  });

  test("returns false for undefined", () => {
    expect(isNotUndefined(undefined)).toBe(false);
  });
});

describe("isDefined", () => {
  test("returns true for defined values", () => {
    expect(isDefined(0)).toBe(true);
    expect(isDefined("")).toBe(true);
    expect(isDefined(false)).toBe(true);
  });

  test("returns false for null and undefined", () => {
    expect(isDefined(null)).toBe(false);
    expect(isDefined(undefined)).toBe(false);
    expect(isDefined()).toBe(false);
  });
});

describe("getLast", () => {
  test("returns last element of non-empty array", () => {
    expect(getLast([1, 2, 3])).toBe(3);
    expect(getLast(["a", "b"])).toBe("b");
  });

  test("returns undefined for empty array", () => {
    expect(getLast([])).toBeUndefined();
  });

  test("returns sole element of single-element array", () => {
    expect(getLast([42])).toBe(42);
  });

  test("preserves null/undefined values at the end", () => {
    expect(getLast([1, null] as Array<number | null>)).toBe(null);
    expect(getLast([1, undefined] as Array<number | undefined>)).toBe(undefined);
  });
});

describe("filterDefined", () => {
  test("filters out null and undefined values", () => {
    expect(filterDefined([1, null, 2, undefined, 3])).toEqual([1, 2, 3]);
  });

  test("returns empty array when all values are nullish", () => {
    expect(filterDefined([null, undefined, null])).toEqual([]);
  });

  test("returns all elements when none are nullish", () => {
    expect(filterDefined([1, 2, 3])).toEqual([1, 2, 3]);
  });

  test("handles empty array", () => {
    expect(filterDefined([])).toEqual([]);
  });

  test("preserves falsy values that are defined (0, '', false)", () => {
    expect(filterDefined([0, "", false, null, undefined] as Array<unknown>)).toEqual([
      0,
      "",
      false,
    ]);
  });

  test("returns a new array (does not mutate input)", () => {
    const input = [1, null, 2] as Array<number | null>;
    const result = filterDefined(input);
    expect(result).not.toBe(input);
    expect(input).toEqual([1, null, 2]);
  });
});

describe("getLastDefined", () => {
  test("returns last defined value, skipping trailing nullish", () => {
    expect(getLastDefined([1, 2, null, undefined])).toBe(2);
  });

  test("returns undefined for all-nullish array", () => {
    expect(getLastDefined([null, undefined])).toBeUndefined();
  });

  test("returns last element when all are defined", () => {
    expect(getLastDefined([1, 2, 3])).toBe(3);
  });

  test("returns the only element when array has one defined value", () => {
    expect(getLastDefined([42])).toBe(42);
  });
});

describe("getValue", () => {
  test("gets a top-level property", () => {
    const obj = { a: 1, b: "hello" };
    expect(getValue(obj, "a")).toBe(1);
    expect(getValue(obj, "b")).toBe("hello");
  });

  test("gets a nested property via dotted path", () => {
    const obj = { a: { b: { c: 42 } } };
    expect(getValue(obj, "a.b.c")).toBe(42);
  });

  test("returns null when field is null", () => {
    const obj = { a: null as { b: number } | null };
    expect(getValue(obj, "a")).toBeNull();
  });

  test("returns null when path traverses null", () => {
    expect(getValue({ a: null as null | { b: number } }, "a.b" as never)).toBe(null);
  });

  test("returns undefined when key missing", () => {
    const obj = { a: { b: 1 } };
    expect(getValue(obj, "a.missing" as never)).toBe(undefined);
  });
});

describe("createGetValue", () => {
  test("returns a reusable getter", () => {
    const obj = { a: 1, nested: { b: 2 } };
    const getA = createGetValue<typeof obj>("a");
    expect(getA(obj)).toBe(1);
    expect(getA({ ...obj, a: 7 })).toBe(7);
  });

  test("resolves a dotted path", () => {
    const obj = { a: 1, nested: { b: 2 } };
    const getNestedB = createGetValue<typeof obj>("nested.b");
    expect(getNestedB(obj)).toBe(2);
  });
});

describe("hasValue", () => {
  test("returns true when the field is defined", () => {
    const obj = { a: 1 };
    expect(hasValue(obj, "a")).toBe(true);
  });

  test("returns true for a present non-nullish value on a dotted path", () => {
    const obj = { nested: { b: 2 } };
    expect(hasValue(obj, "nested.b")).toBe(true);
  });

  test("returns false when the field is null", () => {
    const obj = { a: null as number | null };
    expect(hasValue(obj, "a")).toBe(false);
  });

  test("returns false when the field is undefined", () => {
    const obj = { a: undefined as number | undefined };
    expect(hasValue(obj, "a")).toBe(false);
  });
});

describe("createHasValue", () => {
  test("returns a reusable predicate", () => {
    const obj = { a: 1 as number | undefined };
    const hasA = createHasValue<typeof obj>("a");
    expect(hasA(obj)).toBe(true);
    expect(hasA({ ...obj, a: undefined })).toBe(false);
  });
});

describe("transformValue", () => {
  test("applies transform when value is defined", () => {
    expect(transformValue(5, (v) => v * 2)).toBe(10);
  });

  test("returns null when value is null", () => {
    expect(transformValue(null, (v: number) => v * 2)).toBeNull();
  });

  test("returns undefined when value is undefined", () => {
    expect(transformValue(undefined, (v: number) => v * 2)).toBeUndefined();
  });
});

describe("values", () => {
  test("returns values of an object", () => {
    expect(values({ a: 1, b: 2 })).toEqual([1, 2]);
  });

  test("returns elements of an array", () => {
    expect(values([10, 20, 30])).toEqual([10, 20, 30]);
  });

  test("returns empty array for undefined input", () => {
    expect(values(undefined)).toEqual([]);
  });

  test("returns empty array for null input", () => {
    expect(values(null as unknown as object)).toEqual([]);
  });
});

describe("entries", () => {
  test("returns key-value pairs of an object", () => {
    const result = entries({ a: 1, b: 2 });
    expect(result).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
  });

  test("returns empty array for undefined input", () => {
    expect(entries(undefined)).toEqual([]);
  });

  test("returns empty array for null input", () => {
    expect(entries(null as unknown as object)).toEqual([]);
  });
});

describe("fromEntries", () => {
  test("builds an object from key-value pairs", () => {
    const result = fromEntries([
      ["a", 1],
      ["b", 2],
    ] as const);
    expect(result).toEqual({ a: 1, b: 2 });
  });

  test("works with a Map's entries", () => {
    const map = new Map([
      ["x", 10],
      ["y", 20],
    ]);
    const result = fromEntries(map);
    expect(result).toEqual({ x: 10, y: 20 });
  });
});
