export const IRIS_DOMAIN = "iris.credit";

export const getSubdomainBaseUrl = (subDomain: string) => `https://${subDomain}.${IRIS_DOMAIN}`;

export const CDN_BASE_URL = getSubdomainBaseUrl("cdn");
export const DOCS_BASE_URL = getSubdomainBaseUrl("docs");
export const API_BASE_URL = getSubdomainBaseUrl("api");

export const API_GRAPHQL_URL = new URL("/graphql", API_BASE_URL).toString();
