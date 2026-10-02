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
  /** Simple Icons slug, used to render the app's real logo */
  icon?: string
  /** true when the server registers clients dynamically, so nothing is asked of the user */
  zeroSetup?: boolean
}

/**
 * Render an app's real brand mark. Simple Icons is used because it carries one
 * consistent, recognisable glyph per product and degrades to the brand colour when
 * the network is unavailable — the panel still reads correctly offline.
 */
export function appIcon(app: AppEntry, size = 20): string {
  if (app.icon)
    return `https://cdn.simpleicons.org/${encodeURIComponent(app.icon)}/${encodeURIComponent(app.color.replace("#", ""))}`
  // Fall back to the brand colour as a lettered tile so a row never renders blank.
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">` +
      `<rect width="24" height="24" rx="6" fill="${app.color}"/>` +
      `<text x="12" y="17" font-family="system-ui,sans-serif" font-size="13" font-weight="600" ` +
      `text-anchor="middle" fill="#ffffff">${app.name.slice(0, 1).toUpperCase()}</text></svg>`,
  )}`
}

/**
 * Apps that complete an OAuth flow without the user supplying a client id.
 * Verified against each server's /.well-known/oauth-authorization-server.
 */
export const zeroSetupApps: AppEntry[] = [
  {
    id: "notion",
    icon: "notion",
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
    icon: "linear",
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
    icon: "atlassian",
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
    icon: "sentry",
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
    icon: "stripe",
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
    icon: "cloudflare",
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
    icon: "figma",
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
    icon: "github",
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
    icon: "supabase",
    name: "Supabase",
    description: "Postgres, auth and storage",
    category: "Database",
    kind: "token",
    tokenUrl: "https://supabase.com/dashboard/account/tokens",
    color: "#3ECF8E",
  },
  {
    id: "neon",
    icon: "neon",
    name: "Neon",
    description: "Serverless Postgres",
    category: "Database",
    kind: "token",
    tokenUrl: "https://console.neon.tech/app/settings/api-keys",
    color: "#00E599",
  },
  {
    id: "vercel",
    icon: "vercel",
    name: "Vercel",
    description: "Deployments and projects",
    category: "Hosting",
    kind: "token",
    tokenUrl: "https://vercel.com/account/tokens",
    color: "#000000",
  },
  {
    id: "netlify",
    icon: "netlify",
    name: "Netlify",
    description: "Sites and deploys",
    category: "Hosting",
    kind: "token",
    tokenUrl: "https://app.netlify.com/user/applications",
    color: "#00C7B7",
  },
  {
    id: "youtube",
    icon: "youtube",
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

/**
 * Social and communication apps.
 *
 * None of these have an official hosted MCP server, so they are reached through
 * community servers published in the registry, or through the provider's own
 * API with a token. Every one of them is in the registry, which is why the
 * panel can offer them without shipping a special case for each.
 */
export const socialApps: AppEntry[] = [
  {
    id: "gmail",
    icon: "gmail",
    name: "Gmail",
    description: "Read, search and send mail",
    category: "Communication",
    kind: "token",
    tokenUrl: "https://console.cloud.google.com/apis/credentials",
    color: "#EA4335",
  },
  {
    id: "youtube-data",
    icon: "youtube",
    name: "YouTube Data",
    description: "Search, upload and manage videos",
    category: "Media",
    kind: "token",
    tokenUrl: "https://console.cloud.google.com/apis/credentials",
    color: "#FF0000",
  },
  {
    id: "slack",
    icon: "slack",
    name: "Slack",
    description: "Channels, messages and files",
    category: "Communication",
    kind: "token",
    tokenUrl: "https://api.slack.com/apps",
    color: "#4A154B",
  },
  {
    id: "discord",
    icon: "discord",
    name: "Discord",
    description: "Servers, channels and bots",
    category: "Communication",
    kind: "token",
    tokenUrl: "https://discord.com/developers/applications",
    color: "#5865F2",
  },
  {
    id: "telegram",
    icon: "telegram",
    name: "Telegram",
    description: "Messages, channels and bots",
    category: "Communication",
    kind: "token",
    tokenUrl: "https://core.telegram.org/bots#botfather",
    color: "#26A5E4",
  },
  {
    id: "whatsapp",
    icon: "whatsapp",
    name: "WhatsApp Business",
    description: "Send and receive messages",
    category: "Communication",
    kind: "token",
    tokenUrl: "https://developers.facebook.com/apps",
    color: "#25D366",
  },
  {
    id: "meta-ads",
    icon: "meta",
    name: "Meta Ads",
    description: "Facebook and Instagram campaigns",
    category: "Marketing",
    kind: "token",
    tokenUrl: "https://developers.facebook.com/apps",
    color: "#0866FF",
  },
  {
    id: "linkedin",
    icon: "linkedin",
    name: "LinkedIn",
    description: "Posts, profiles and outreach",
    category: "Marketing",
    kind: "token",
    tokenUrl: "https://www.linkedin.com/developers/apps",
    color: "#0A66C2",
  },
  {
    id: "x-twitter",
    icon: "x",
    name: "X (Twitter)",
    description: "Posts, timelines and search",
    category: "Marketing",
    kind: "token",
    tokenUrl: "https://developer.x.com/en/portal/dashboard",
    color: "#000000",
  },
  {
    id: "reddit",
    icon: "reddit",
    name: "Reddit",
    description: "Subreddits, posts and comments",
    category: "Marketing",
    kind: "token",
    tokenUrl: "https://www.reddit.com/prefs/apps",
    color: "#FF4500",
  },
]

export const allSeedApps = (): AppEntry[] => [
  ...zeroSetupApps,
  ...tokenApps,
  ...socialApps,
  ...localApps,
]

export const categories = (apps: AppEntry[] = allSeedApps()): string[] =>
  Array.from(new Set(apps.map((a) => a.category))).sort()
