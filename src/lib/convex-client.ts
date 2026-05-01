import { ConvexHttpClient } from "convex/browser";

let cachedClient: ConvexHttpClient | null = null;

const getConvexClient = (): ConvexHttpClient => {
  if (cachedClient) {
    return cachedClient;
  }

  const deploymentUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

  if (!deploymentUrl) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is not configured");
  }

  cachedClient = new ConvexHttpClient(deploymentUrl);
  return cachedClient;
};

export const convex = new Proxy({} as ConvexHttpClient, {
  get(_target, prop) {
    const client = getConvexClient();
    const value = client[prop as keyof ConvexHttpClient];
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export { getConvexClient };
