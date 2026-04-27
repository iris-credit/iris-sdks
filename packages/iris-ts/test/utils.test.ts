import { describe, expect, test, vi } from "vitest";
import {
  bigIntComparator,
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
} from "../src/index.js";

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
});

describe("hasValue", () => {
  test("returns true when the field is defined", () => {
    const obj = { a: 1 };
    expect(hasValue(obj, "a")).toBe(true);
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
