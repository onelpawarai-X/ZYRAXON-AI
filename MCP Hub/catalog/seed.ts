// MCP Hub - curated catalog of popular apps.
// Everything here is additive: nothing outside "MCP Hub/" is modified.

export type AuthKind = "none" | "oauth" | "token" | "local"

export interface AppEntry {
  id: string
  name: string
  description: string
  category: string
  kind: AuthKind
  /** remote MCP endpoint, when the app is reached over the network */
  url?: string
  /** where the user goes to create a token, when kind === "token" */
  tokenUrl?: string
  /** scopes worth requesting by default */
  scope?: string
  /** brand colour used by the UI */
  color: string
  /** true when the server registers clients dynamically, so nothing is asked of the user */
  zeroSetup?: boolean
}

/**
 * Apps that complete an OAuth flow without the user supplying a client id.
 * Verified against each server's /.well-known/oauth-authorization-server.
 */
export const zeroSetupApps: AppEntry[] = [
  {
    id: "notion",
    name: "Notion",
    description: "Pages, databases and wikis",
    category: "Knowledge",
    kind: "oauth",
    url: "https://mcp.notion.com/mcp",
    color: "#000000",
    zeroSetup: true,
  },
  {
    id: "linear",
    name: "Linear",
    description: "Issues, projects and cycles",
    category: "Project",
    kind: "oauth",
    url: "https://mcp.linear.app/sse",
    color: "#5E6AD2",
    zeroSetup: true,
  },
  {
    id: "atlassian",
    name: "Atlassian",
    description: "Jira issues and Confluence pages",
    category: "Project",
    kind: "oauth",
    url: "https://mcp.atlassian.com/v1/sse",
    color: "#0052CC",
    zeroSetup: true,
  },
  {
    id: "sentry",
    name: "Sentry",
    description: "Errors, traces and releases",
    category: "Monitoring",
    kind: "oauth",
    url: "https://mcp.sentry.dev/mcp",
    color: "#362D59",
    zeroSetup: true,
  },
  {
    id: "stripe",
    name: "Stripe",
    description: "Payments, customers and invoices",
    category: "Payments",
    kind: "oauth",
    url: "https://mcp.stripe.com",
    color: "#635BFF",
    zeroSetup: true,
  },
  {
    id: "cloudflare",
    name: "Cloudflare",
    description: "Workers, DNS and R2 storage",
    category: "Infrastructure",
    kind: "oauth",
    url: "https://mcp.cloudflare.com/mcp",
    color: "#F38020",
    zeroSetup: true,
  },
  {
    id: "figma",
    name: "Figma",
    description: "Design files and components",
    category: "Design",
    kind: "oauth",
    url: "https://mcp.figma.com/mcp",
    color: "#F24E1E",
    zeroSetup: true,
  },
]

/**
 * Apps that need a token or a one-time OAuth client.
 * GitHub is here because its authorization server has no dynamic registration.
 */
export const tokenApps: AppEntry[] = [
  {
    id: "github",
    name: "GitHub",
    description: "Repos, issues, pull requests and Actions",
    category: "Code",
    kind: "token",
    url: "https://api.githubcopilot.com/mcp/",
    tokenUrl: "https://github.com/settings/tokens",
    scope: "repo read:org read:user user:email",
    color: "#181717",
  },
  {
    id: "supabase",
    name: "Supabase",
    description: "Postgres, auth and storage",
    category: "Database",
    kind: "token",
    tokenUrl: "https://supabase.com/dashboard/account/tokens",
    color: "#3ECF8E",
  },
  {
    id: "neon",
    name: "Neon",
    description: "Serverless Postgres",
    category: "Database",
    kind: "token",
    tokenUrl: "https://console.neon.tech/app/settings/api-keys",
    color: "#00E599",
  },
  {
    id: "vercel",
    name: "Vercel",
    description: "Deployments and projects",
    category: "Hosting",
    kind: "token",
    tokenUrl: "https://vercel.com/account/tokens",
    color: "#000000",
  },
  {
    id: "netlify",
    name: "Netlify",
    description: "Sites and deploys",
    category: "Hosting",
    kind: "token",
    tokenUrl: "https://app.netlify.com/user/applications",
    color: "#00C7B7",
  },
  {
    id: "youtube",
    name: "YouTube",
    description: "Video data, transcripts and trends",
    category: "Media",
    kind: "token",
    tokenUrl: "https://console.cloud.google.com/apis/credentials",
    color: "#FF0000",
  },
]

/**
 * MCP servers that run on this machine. ZYRAXON already ships four of these;
 * the list is here so the Hub can show them next to the remote apps.
 */
export const localApps: AppEntry[] = [
  { id: "jarvis-browser", name: "Jarvis Browser", description: "Headless browser control", category: "Automation", kind: "local", color: "#4285F4" },
  { id: "nuphus-desktop", name: "Nuphus Desktop", description: "Desktop control", category: "Automation", kind: "local", color: "#7C3AED" },
  { id: "touchpoint-mcp", name: "Touchpoint", description: "Screen touch and input", category: "Automation", kind: "local", color: "#EC4899" },
  { id: "desktop-commander", name: "Desktop Commander", description: "Files, processes and shell", category: "System", kind: "local", color: "#0EA5E9" },
]

export const allSeedApps = (): AppEntry[] => [...zeroSetupApps, ...tokenApps, ...localApps]

export const categories = (apps: AppEntry[] = allSeedApps()): string[] =>
  Array.from(new Set(apps.map((a) => a.category))).sort()
