import { describe, expect, test } from "vitest";
import {
  IRIS_DOMAIN,
  getSubdomainBaseUrl,
  CDN_BASE_URL,
  DOCS_BASE_URL,
  API_BASE_URL,
  API_GRAPHQL_URL,
} from "../src/index.js";

describe("urls", () => {
  test("should have correct domain", () => {
    expect(IRIS_DOMAIN).toBe("iris.credit");
  });

  test("should build subdomain URLs", () => {
    expect(getSubdomainBaseUrl("cdn")).toBe("https://cdn.iris.credit");
    expect(getSubdomainBaseUrl("custom")).toBe("https://custom.iris.credit");
  });

  test("should have correct CDN URL", () => {
    expect(CDN_BASE_URL).toBe("https://cdn.morpho.org");
  });

  test("should have correct docs URL", () => {
    expect(DOCS_BASE_URL).toBe("https://docs.iris.credit");
  });

  test("should have correct API URL", () => {
    expect(API_BASE_URL).toBe("https://api.iris.credit");
  });

  test("should have correct GraphQL URL", () => {
    expect(API_GRAPHQL_URL).toBe("https://api.iris.credit/graphql");
  });
});
