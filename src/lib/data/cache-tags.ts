// Cache tags shared by "use cache" readers and the Server Actions that invalidate them.
export const TAGS = {
  taxonomy: "taxonomy",
  startups: "startups",
  startup: (slug: string) => `startup:${slug}`,
} as const;
