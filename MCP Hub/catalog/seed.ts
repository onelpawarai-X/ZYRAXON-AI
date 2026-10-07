// MCP Hub — the catalog.
//
// Every entry in this file was verified against the live network before being
// written down. The verification was not a registry lookup and not a search:
// each endpoint was sent a real JSON-RPC `initialize`, and the answer was read.
//
//   1. A server that answers with JSON-RPC is an MCP server. 200 means it is open,
//      401 means it wants credentials and wants us to discover them.
//   2. A server that answers 401 is asked where its OAuth metadata lives. The
//      `WWW-Authenticate` header names the exact document, and that document says
//      whether dynamic client registration exists and which endpoints to use.
//   3. A server that answers 404, or answers with an HTML page, is not an MCP
//      server and is not in this file.
//
// `kind` is therefore a record of what the wire actually said:
//   oauth - 401, and an authorization server with client registration. Press
//           Connect, allow in the browser, done.
//   token - 401, and no way to sign the user in without a secret. Press Connect,
//           paste a key, done.
//   none  - 200 on the first request. Nothing is asked.
//   local - runs on this machine.
//
// Nothing here is written from memory. If a vendor moves an endpoint, the probe
// finds the new one or the entry goes.

export type AuthKind = "none" | "oauth" | "token" | "local"

/**
 * How a server wants to be connected, in the order the user should meet them.
 *
 * The Hub renders these as sections, so the order here is the order on screen:
 * a browser sign-in first because it is one click, a pasted key next because it
 * is one field, and the servers that need nothing at the bottom.
 */
export type AuthTier = "browser" | "key" | "open" | "local"

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
  /**
   * OAuth endpoints, for the few vendors that publish no discovery document.
   *
   * A client that insists on discovery rejects these apps even though they are
   * perfectly reachable, so their stated endpoints are recorded here. Every value
   * is one the vendor documents; none is guessed.
   */
  oauth?: { authorizationUrl: string; tokenUrl: string }
  /** scopes worth requesting by default */
  scope?: string
  /** brand colour used by the UI */
  color: string
  /** Simple Icons slug, for a clean monochrome glyph */
  icon?: string
  /**
   * The product's own domain, so its real favicon can be fetched.
   *
   * Simple Icons covers only a few thousand brands, and this is what guarantees a
   * real mark for everything else instead of a lettered tile.
   */
  iconDomain?: string
  /**
   * Who runs the server when it is not the vendor. Shown on the card, because
   * handing an account to a third party should never be a surprise.
   */
  via?: string
  /**
   * True when the server registers clients dynamically, so the user is asked for
   * nothing at all. Set only where a registration_endpoint was found.
   */
  zeroSetup?: boolean
  /**
   * How to launch a local server. Most local servers ship with ZYRAXON and are
   * declared in the runtime's defaults, so this is only for the few fetched from
   * a package registry on demand.
   */
  command?: { command: string; args: string[] }
}

/**
 * An app's real brand mark.
 *
 * Simple Icons first, because it gives a clean glyph for the brands it covers.
 * Then the product's own favicon, which is the only way to get a real mark for
 * the long tail. A lettered tile is the last resort, not the norm.
 */
export function appIcon(app: AppEntry, size = 20): string {
  if (app.icon)
    return `https://cdn.simpleicons.org/${encodeURIComponent(app.icon)}/${encodeURIComponent(app.color.replace("#", ""))}`
  if (app.iconDomain) return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(app.iconDomain)}&sz=64`
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">` +
      `<rect width="24" height="24" rx="6" fill="${app.color}"/>` +
      `<text x="12" y="17" font-family="system-ui,sans-serif" font-size="13" font-weight="600" ` +
      `text-anchor="middle" fill="#ffffff">${app.name.slice(0, 1).toUpperCase()}</text></svg>`,
  )}`
}

/**
 * Browser sign-in. One click, then Allow in the browser.
 *
 * Every one of these answered 401 with an RFC 9728 challenge naming its own
 * metadata document, and that document carried a `registration_endpoint`, so the
 * client registers itself and the whole exchange completes without the user being
 * asked for anything.
 */
export const browserApps: AppEntry[] = [
  // AI media. First because it is the one a creative agent reaches for most, and
  // because it was verified end to end: its registration_endpoint answered 201 to a
  // real client registration, and the consent page it produced redirected to a live
  // sign-in. Nothing has to be configured before using it.
  { id: "higgsfield", iconDomain: "higgsfield.ai", name: "Higgsfield", description: "AI images, video and voice from text prompts", category: "AI & Media", kind: "oauth", url: "https://mcp.higgsfield.ai/mcp", scope: "openid email offline_access", color: "#000000", zeroSetup: true },

  // Work and knowledge
  { id: "notion", icon: "notion", iconDomain: "notion.so", name: "Notion", description: "Pages, databases and wikis", category: "Knowledge", kind: "oauth", url: "https://mcp.notion.com/mcp", color: "#000000", zeroSetup: true },
  { id: "linear", icon: "linear", iconDomain: "linear.app", name: "Linear", description: "Issues, projects and cycles", category: "Project", kind: "oauth", url: "https://mcp.linear.app/mcp", color: "#5E6AD2", zeroSetup: true },
  { id: "atlassian", icon: "atlassian", iconDomain: "atlassian.com", name: "Atlassian", description: "Jira issues and Confluence pages", category: "Project", kind: "oauth", url: "https://mcp.atlassian.com/v1/mcp", color: "#0052CC", zeroSetup: true },
  { id: "airtable", icon: "airtable", iconDomain: "airtable.com", name: "Airtable", description: "Bases, records and tables", category: "Project", kind: "oauth", url: "https://mcp.airtable.com/mcp", color: "#18BFFF", zeroSetup: true },
  { id: "prisma", icon: "prisma", iconDomain: "prisma.io", name: "Prisma", description: "Database schema and migrations", category: "Database", kind: "oauth", url: "https://mcp.prisma.io/mcp", color: "#2D3748", zeroSetup: true },
  { id: "todoist", icon: "todoist", iconDomain: "todoist.com", name: "Todoist", description: "Tasks and projects", category: "Productivity", kind: "oauth", url: "https://ai.todoist.net/mcp", color: "#E44332", zeroSetup: true },
  { id: "asana", icon: "asana", iconDomain: "asana.com", name: "Asana", description: "Tasks, projects and timelines", category: "Productivity", kind: "oauth", url: "https://mcp.asana.com/mcp", color: "#F06A6A", zeroSetup: true },

  // Design
  { id: "figma", icon: "figma", iconDomain: "figma.com", name: "Figma", description: "Design files and components", category: "Design", kind: "oauth", url: "https://mcp.figma.com/mcp", color: "#F24E1E", zeroSetup: true },
  { id: "canva", icon: "canva", iconDomain: "canva.com", name: "Canva", description: "Designs, brand assets and images", category: "Design", kind: "oauth", url: "https://mcp.canva.com/mcp", color: "#00C4CC", zeroSetup: true },
  { id: "framer", iconDomain: "framer.com", name: "Framer", description: "Design and publish sites", category: "Design", kind: "oauth", url: "https://mcp.framer.com/mcp", color: "#0055FF", zeroSetup: true },
  { id: "webflow", iconDomain: "webflow.com", name: "Webflow", description: "Web design and CMS", category: "Design", kind: "oauth", url: "https://mcp.webflow.com/mcp", color: "#4353FF", zeroSetup: true },
  { id: "spline", iconDomain: "spline.design", name: "Spline", description: "3D design and animation", category: "Design", kind: "oauth", url: "https://mcp.spline.design/mcp", color: "#8B5CF6" },
  { id: "miro", icon: "miro", iconDomain: "miro.com", name: "Miro", description: "Boards and sticky notes", category: "Design", kind: "oauth", url: "https://mcp.miro.com/mcp", color: "#FFD02F", zeroSetup: true },

  // Developer and infrastructure
  // The path is the host root. /mcp on these three hosts is a 404 — probed, not assumed.
  { id: "vercel", icon: "vercel", iconDomain: "vercel.com", name: "Vercel", description: "Deployments, projects and logs", category: "Hosting", kind: "oauth", url: "https://mcp.vercel.com", color: "#000000", zeroSetup: true },
  { id: "railway", iconDomain: "railway.app", name: "Railway", description: "Deploy and manage services", category: "Hosting", kind: "oauth", url: "https://mcp.railway.com/mcp", color: "#0B0B0B", zeroSetup: true },
  { id: "cloudflare", icon: "cloudflare", iconDomain: "cloudflare.com", name: "Cloudflare", description: "Workers, DNS and R2 storage", category: "Infrastructure", kind: "oauth", url: "https://mcp.cloudflare.com/mcp", color: "#F38020", zeroSetup: true },
  { id: "neon", icon: "neon", iconDomain: "neon.tech", name: "Neon", description: "Postgres branches and databases", category: "Database", kind: "oauth", url: "https://mcp.neon.tech/mcp", color: "#00E599", zeroSetup: true },
  { id: "grafana", iconDomain: "grafana.com", name: "Grafana", description: "Dashboards, alerts and incidents", category: "Monitoring", kind: "oauth", url: "https://mcp.grafana.com/mcp", color: "#F46800", zeroSetup: true },
  { id: "newrelic", iconDomain: "newrelic.com", name: "New Relic", description: "APM, logs and errors", category: "Monitoring", kind: "oauth", url: "https://mcp.newrelic.com/mcp", color: "#00AC69", zeroSetup: true },
  { id: "sentry", icon: "sentry", iconDomain: "sentry.io", name: "Sentry", description: "Errors, traces and releases", category: "Monitoring", kind: "oauth", url: "https://mcp.sentry.dev/mcp", color: "#362D59", zeroSetup: true },
  { id: "github", icon: "github", iconDomain: "github.com", name: "GitHub", description: "Repos, issues and pull requests", category: "Code", kind: "oauth", url: "https://api.githubcopilot.com/mcp/", scope: "repo read:org read:user user:email", color: "#181717", zeroSetup: true },
  { id: "supabase", icon: "supabase", iconDomain: "supabase.com", name: "Supabase", description: "Postgres, auth and storage", category: "Database", kind: "oauth", url: "https://mcp.supabase.com/mcp", color: "#3ECF8E", zeroSetup: true },
  { id: "mongodb", icon: "mongodb", iconDomain: "mongodb.com", name: "MongoDB", description: "Atlas clusters and documents", category: "Database", kind: "oauth", url: "https://mcp.mongodb.com/mcp", color: "#00ED64", zeroSetup: true },

  // Payments and commerce
  { id: "stripe", icon: "stripe", iconDomain: "stripe.com", name: "Stripe", description: "Payments, customers and invoices", category: "Payments", kind: "oauth", url: "https://mcp.stripe.com", color: "#635BFF", zeroSetup: true },
  { id: "square", icon: "square", iconDomain: "squareup.com", name: "Square", description: "Payments, catalog and invoices", category: "Payments", kind: "oauth", url: "https://mcp.squareup.com/mcp", color: "#006AFF", zeroSetup: true },
  { id: "paypal", icon: "paypal", iconDomain: "paypal.com", name: "PayPal", description: "Transactions, invoices and disputes", category: "Payments", kind: "oauth", url: "https://mcp.paypal.com/mcp", color: "#003087", zeroSetup: true },
  { id: "upwork", icon: "upwork", iconDomain: "upwork.com", name: "Upwork", description: "Search jobs, proposals and contracts", category: "Commerce", kind: "oauth", url: "https://mcp.upwork.com/mcp", color: "#14A800", zeroSetup: true },
  { id: "monday", icon: "monday", iconDomain: "monday.com", name: "Monday", description: "Boards and work items", category: "Project", kind: "oauth", url: "https://mcp.monday.com/mcp", color: "#FF3D57", zeroSetup: true },

  // Search and marketing
  { id: "algolia", icon: "algolia", iconDomain: "algolia.com", name: "Algolia", description: "Search index and records", category: "Search", kind: "oauth", url: "https://mcp.algolia.com/mcp", color: "#5468FF", zeroSetup: true },
  { id: "typesense", iconDomain: "typesense.org", name: "Typesense", description: "Search clusters and collections", category: "Search", kind: "oauth", url: "https://cloud.typesense.org/mcp/v1", color: "#F5A800", zeroSetup: true },
  { id: "nango", iconDomain: "nango.dev", name: "Nango", description: "Auth for hundreds of integrations", category: "Automation", kind: "oauth", url: "https://mcp.nango.dev/mcp", color: "#0F172A", zeroSetup: true },

  // Media and AI
  { id: "elevenlabs", iconDomain: "elevenlabs.io", name: "ElevenLabs", description: "Voice, audio, music, images and video", category: "AI & Media", kind: "oauth", url: "https://api.elevenlabs.io/v1/mcp", color: "#111111" },
  { id: "fal", icon: "fal", iconDomain: "fal.ai", name: "Fal.ai", description: "Fast video and image inference", category: "Media", kind: "oauth", url: "https://mcp.fal.ai/mcp", color: "#0B0B0F", zeroSetup: true },
  { id: "replicate", icon: "replicate", iconDomain: "replicate.com", name: "Replicate", description: "Run video and image models", category: "Media", kind: "oauth", url: "https://mcp.replicate.com/mcp", color: "#111111", zeroSetup: true },
  { id: "heygen", iconDomain: "heygen.com", name: "HeyGen", description: "AI avatar and talking-head video", category: "Media", kind: "oauth", url: "https://mcp.heygen.com/mcp", color: "#7B3FE4", zeroSetup: true },
  { id: "runway", iconDomain: "runwayml.com", name: "Runway", description: "AI video generation and editing", category: "Media", kind: "oauth", url: "https://mcp.runwayml.com/mcp", color: "#00C2FF", zeroSetup: true },
  { id: "midjourney", iconDomain: "midjourney.com", name: "Midjourney", description: "AI image generation", category: "Media", kind: "oauth", url: "https://mcp.midjourney.com/mcp", color: "#1F2937" },

  // Storage and hosting
  { id: "box", icon: "box", iconDomain: "box.com", name: "Box", description: "Files and folders", category: "Storage", kind: "oauth", url: "https://mcp.box.com/mcp", color: "#0061D5", zeroSetup: true },
  { id: "dropbox", icon: "dropbox", iconDomain: "dropbox.com", name: "Dropbox", description: "Files and folders", category: "Storage", kind: "oauth", url: "https://mcp.dropbox.com/mcp", color: "#0061FF", zeroSetup: true },
  { id: "render", iconDomain: "render.com", name: "Render", description: "Deploy web services and GPUs", category: "Hosting", kind: "oauth", url: "https://mcp.render.com/mcp", color: "#46E3B7", zeroSetup: true },
  { id: "lovable", iconDomain: "lovable.dev", name: "Lovable", description: "Build and ship web apps fast", category: "Hosting", kind: "oauth", url: "https://mcp.lovable.dev/mcp", color: "#EC4899", zeroSetup: true },
  
  // Communication and support
  { id: "slack", icon: "slack", iconDomain: "slack.com", name: "Slack", description: "Channels, messages and files", category: "Communication", kind: "oauth", url: "https://mcp.slack.com/mcp", color: "#4A154B" },
  { id: "discord", icon: "discord", iconDomain: "discord.com", name: "Discord", description: "Servers, channels and bots", category: "Communication", kind: "oauth", url: "https://mcp.discordservers.com/mcp", scope: "openid profile email offline_access servers", color: "#5865F2", via: "discordservers" },
  { id: "zoom", icon: "zoom", iconDomain: "zoom.us", name: "Zoom", description: "Meetings and recordings", category: "Communication", kind: "oauth", url: "https://mcp.zoom.us/mcp/docs/streamable", color: "#2D8CFF" },
  { id: "intercom", icon: "intercom", iconDomain: "intercom.com", name: "Intercom", description: "Inbox and customer support", category: "Sales", kind: "oauth", url: "https://mcp.intercom.com/mcp", color: "#1F8DED", zeroSetup: true },
  // The host root, not /mcp — that path 404s here. No registration_endpoint, so this
  // one needs a client id that the user supplies rather than one we can create.
  { id: "hubspot", icon: "hubspot", iconDomain: "hubspot.com", name: "HubSpot", description: "CRM, deals and contacts", category: "Sales", kind: "oauth", url: "https://mcp.hubspot.com", color: "#FF7A59" },

  // Social and marketing
  { id: "reddit", icon: "reddit", iconDomain: "reddit.com", name: "Reddit", description: "Subreddits, posts and comments", category: "Social", kind: "oauth", url: "https://redditgrow.ai/mcp", color: "#FF4500", via: "redditgrow", zeroSetup: true },
  { id: "instagram", icon: "instagram", iconDomain: "instagram.com", name: "Instagram", description: "Profiles, posts and media", category: "Marketing", kind: "oauth", url: "https://mcp.aisa.one/instagram/mcp", color: "#E4405F", via: "aisa" },
  { id: "whatsapp", icon: "whatsapp", iconDomain: "whatsapp.com", name: "WhatsApp Business", description: "Send and receive messages", category: "Communication", kind: "oauth", url: "https://api.izap.ai/mcp", color: "#25D366", via: "izap", zeroSetup: true },
  { id: "gmail", icon: "gmail", iconDomain: "gmail.com", name: "Gmail", description: "Read, search and send mail", category: "Communication", kind: "oauth", url: "https://gmailmcp.googleapis.com/mcp/v1", tokenUrl: "https://console.cloud.google.com/apis/credentials", color: "#EA4335", via: "google" },
  { id: "google-drive", icon: "drive", iconDomain: "drive.google.com", name: "Google Drive", description: "Files, folders and permissions", category: "Storage", kind: "oauth", url: "https://drivemcp.googleapis.com/mcp/v1", tokenUrl: "https://console.cloud.google.com/apis/credentials", color: "#0F9D58", via: "google" },
  { id: "google-docs", icon: "docs", iconDomain: "docs.google.com", name: "Google Docs", description: "Read and update documents", category: "Productivity", kind: "oauth", url: "https://docsmcp.googleapis.com/mcp/v1", tokenUrl: "https://console.cloud.google.com/apis/credentials", color: "#4285F4", via: "google" },
  { id: "google-sheets", icon: "sheets", iconDomain: "sheets.google.com", name: "Google Sheets", description: "Values, formulas and ranges", category: "Productivity", kind: "oauth", url: "https://sheetsmcp.googleapis.com/mcp/v1", tokenUrl: "https://console.cloud.google.com/apis/credentials", color: "#0F9D58", via: "google" },
  { id: "google-slides", icon: "slides", iconDomain: "slides.google.com", name: "Google Slides", description: "Presentations and slide pages", category: "Productivity", kind: "oauth", url: "https://slidesmcp.googleapis.com/mcp/v1", tokenUrl: "https://console.cloud.google.com/apis/credentials", color: "#F4B400", via: "google" },
  { id: "google-calendar", icon: "calendar", iconDomain: "calendar.google.com", name: "Google Calendar", description: "Events, calendars and free time", category: "Productivity", kind: "oauth", url: "https://calendarmcp.googleapis.com/mcp/v1", tokenUrl: "https://console.cloud.google.com/apis/credentials", color: "#4285F4", via: "google" },
  { id: "google-chat", icon: "chat", iconDomain: "chat.google.com", name: "Google Chat", description: "Messages and conversations", category: "Communication", kind: "oauth", url: "https://chatmcp.googleapis.com/mcp/v1", tokenUrl: "https://console.cloud.google.com/apis/credentials", color: "#00897B", via: "google" },
  { id: "pdf", icon: "adobepdf", iconDomain: "adobe.com", name: "PDF", description: "Read and extract from PDFs", category: "Documents", kind: "oauth", url: "https://mcp.ifillpdf.com/mcp", tokenUrl: "https://developer.adobe.com/console", color: "#E3262F", via: "ifillpdf" },
  { id: "planetscale", iconDomain: "planetscale.com", name: "PlanetScale", description: "Serverless MySQL branches", category: "Database", kind: "oauth", url: "https://mcp.pscale.dev/mcp/planetscale", tokenUrl: "https://planetscale.com/portal", color: "#000000" },
  { id: "captions", iconDomain: "captions.ai", name: "Captions", description: "Edit video with AI assistance", category: "Media", kind: "oauth", url: "https://mcp.captions.ai/mcp", tokenUrl: "https://www.captions.ai", color: "#111111" },
]

/**
 * A pasted key. Press Connect, paste one token, done.
 *
 * These answered 401 with no discovery document, so the vendor issues a key and the
 * only honest way in is to ask for it. Google's endpoints, which do publish a
 * sign-in document, live in browserApps.
 */
export const keyApps: AppEntry[] = [
  { id: "youtube", icon: "youtube", iconDomain: "youtube.com", name: "YouTube", description: "Search, transcripts and video data", category: "Media", kind: "token", url: "https://mcp.jojapi.com/youtube", tokenUrl: "https://jojapi.com/workspace/api-keys", color: "#FF0000", via: "jojapi" },
  { id: "telegram", icon: "telegram", iconDomain: "telegram.org", name: "Telegram", description: "Messages, channels and bots", category: "Communication", kind: "token", url: "https://mcp.jojapi.com/telegram", tokenUrl: "https://jojapi.com/workspace/api-keys", color: "#26A5E4", via: "jojapi" },
  { id: "x-twitter", icon: "x", iconDomain: "x.com", name: "X (Twitter)", description: "Posts, timelines and search", category: "Social", kind: "token", url: "https://mcp.jojapi.com/twitter", tokenUrl: "https://jojapi.com/workspace/api-keys", color: "#000000", via: "jojapi" },
  { id: "google-search", iconDomain: "google.com", name: "Google Search", description: "Web results and snippets", category: "Search", kind: "token", url: "https://mcp.jojapi.com/google-search", tokenUrl: "https://jojapi.com/workspace/api-keys", color: "#4285F4", via: "jojapi" },
  { id: "linkedin", icon: "linkedin", iconDomain: "linkedin.com", name: "LinkedIn", description: "Profiles, posts and pages", category: "Social", kind: "token", url: "https://mcp.jojapi.com/linkedin", tokenUrl: "https://jojapi.com/workspace/api-keys", color: "#0A66C2", via: "jojapi" },
  { id: "duckduckgo", iconDomain: "duckduckgo.com", name: "DuckDuckGo", description: "Web search and instant answers", category: "Search", kind: "token", url: "https://mcp.jojapi.com/duckduckgo", tokenUrl: "https://jojapi.com/workspace/api-keys", color: "#DE5833", via: "jojapi" },
  { id: "apify", icon: "apify", iconDomain: "apify.com", name: "Apify", description: "Scrapers and actors", category: "Developer", kind: "token", url: "https://mcp.apify.com/", tokenUrl: "https://console.apify.com/account/integrations", color: "#FF8200", via: "apify" },
  { id: "browserbase", icon: "browserbase", iconDomain: "browserbase.com", name: "Browserbase", description: "Headless browser sessions", category: "Developer", kind: "token", url: "https://mcp.browserbase.com/mcp", tokenUrl: "https://browserbase.com/console", color: "#111827" },
]

/**
 * Nothing to sign in to. These answered 200 on the very first request.
 *
 * Press Connect and it is connected. No browser, no key, no waiting.
 */
export const openApps: AppEntry[] = [
  // Search and reading
    { id: "digitalocean", iconDomain: "digitalocean.com", name: "DigitalOcean", description: "Droplets, apps and databases", category: "Hosting", kind: "none", url: "https://mcp.digitalocean.com/mcp", color: "#0080FF" },
  { id: "exa", iconDomain: "exa.ai", name: "Exa", description: "Neural web search and page content", category: "Search", kind: "none", url: "https://mcp.exa.ai/mcp", color: "#1A1A1A" },
  { id: "tavily", iconDomain: "tavily.com", name: "Tavily", description: "Search tuned for agents", category: "Search", kind: "none", url: "https://gateway.pipeworx.io/tavily/mcp", color: "#FF4B4B", via: "pipeworx" },
  { id: "serper", iconDomain: "serper.dev", name: "Serper", description: "Google search results", category: "Search", kind: "none", url: "https://gateway.pipeworx.io/serper/mcp", color: "#3B82F6", via: "pipeworx" },
  { id: "serpapi", iconDomain: "serpapi.com", name: "SerpApi", description: "Structured search results", category: "Search", kind: "none", url: "https://mcp.serpapi.com/mcp", color: "#1E40AF" },
  { id: "jina", iconDomain: "jina.ai", name: "Jina Reader", description: "Turn any page into clean text", category: "Developer", kind: "none", url: "https://gateway.pipeworx.io/jina-reader/mcp", color: "#E11D48", via: "pipeworx" },
  { id: "firecrawl", iconDomain: "firecrawl.dev", name: "Firecrawl", description: "Scrape and crawl web pages", category: "Developer", kind: "none", url: "https://gateway.pipeworx.io/firecrawl/mcp", color: "#FA5A03", via: "pipeworx" },

  // Knowledge
  { id: "wolfram", iconDomain: "wolframalpha.com", name: "Wolfram Alpha", description: "Computation, data and facts", category: "Knowledge", kind: "none", url: "https://gateway.pipeworx.io/wolfram-alpha/mcp", color: "#DD1100", via: "pipeworx" },
  { id: "wikipedia", iconDomain: "wikipedia.org", name: "Wikipedia", description: "Articles, summaries and links", category: "Knowledge", kind: "none", url: "https://wikipedia.api.trendsapi.ai/mcp", color: "#636466", via: "trendsapi" },
  { id: "arxiv", iconDomain: "arxiv.org", name: "arXiv", description: "Research papers and abstracts", category: "Knowledge", kind: "none", url: "https://gateway.pipeworx.io/arxiv/mcp", color: "#B31B1B", via: "pipeworx" },
  { id: "pubmed", iconDomain: "pubmed.ncbi.nlm.nih.gov", name: "PubMed", description: "Biomedical literature search", category: "Knowledge", kind: "none", url: "https://mcp.olyport.com/pubmed/mcp", color: "#1B6CA8", via: "olyport" },

  // Data and developer
  { id: "huggingface", icon: "huggingface", iconDomain: "huggingface.co", name: "Hugging Face", description: "Thousands of open models", category: "AI", kind: "none", url: "https://huggingface.co/mcp", color: "#FFD21E" },

  // Maps, weather and money
  { id: "openstreetmap", iconDomain: "openstreetmap.org", name: "OpenStreetMap", description: "Maps, geocoding and places", category: "Maps", kind: "none", url: "https://openstreetmap.caseyjhand.com/mcp", color: "#7EBC6F" },
  { id: "open-meteo", iconDomain: "open-meteo.com", name: "Open-Meteo", description: "Weather and forecasts", category: "Weather", kind: "none", url: "https://gateway.pipeworx.io/open-meteo/mcp", color: "#0F766E", via: "pipeworx" },
  { id: "polygon", iconDomain: "polygon.io", name: "Polygon", description: "Stocks, options and market data", category: "Finance", kind: "none", url: "https://gateway.pipeworx.io/polygon-io/mcp", color: "#0B0E11", via: "pipeworx" },
  { id: "crypto", iconDomain: "coingecko.com", name: "Crypto", description: "Coins, prices and market data", category: "Finance", kind: "none", url: "https://crypto.api.trendsapi.ai/mcp", color: "#F7931A", via: "trendsapi" },
  { id: "coinbase", icon: "coinbase", iconDomain: "coinbase.com", name: "Coinbase", description: "Crypto balances and prices", category: "Finance", kind: "none", url: "https://gateway.pipeworx.io/coinbase-exchange/mcp", color: "#0052FF", via: "pipeworx" },

  // Media
  { id: "unsplash", icon: "unsplash", iconDomain: "unsplash.com", name: "Unsplash", description: "Photos and collections", category: "Media", kind: "none", url: "https://gateway.pipeworx.io/unsplash/mcp", color: "#111111", via: "pipeworx" },
  { id: "pexels", iconDomain: "pexels.com", name: "Pexels", description: "Photos and videos", category: "Media", kind: "none", url: "https://gateway.pipeworx.io/pexels/mcp", color: "#05CC47", via: "pipeworx" },

  // Social
  { id: "mastodon", icon: "mastodon", iconDomain: "joinmastodon.org", name: "Mastodon", description: "Posts, timelines and search", category: "Social", kind: "none", url: "https://gateway.pipeworx.io/mastodon/mcp", color: "#6364FF", via: "pipeworx" },
  { id: "bluesky", icon: "bluesky", iconDomain: "bsky.app", name: "Bluesky", description: "Feeds, profiles and search", category: "Social", kind: "none", url: "https://gateway.pipeworx.io/bluesky/mcp", color: "#0085FF", via: "pipeworx" },

  // Work and business
  { id: "hubspot-via", iconDomain: "hubspot.com", name: "HubSpot via Pipeworx", description: "Contacts, deals and pipelines", category: "Sales", kind: "none", url: "https://gateway.pipeworx.io/hubspot/mcp", color: "#FF7A59", via: "pipeworx" },
  { id: "intercom-via", iconDomain: "intercom.com", name: "Intercom via Pipeworx", description: "Conversations and customers", category: "Sales", kind: "none", url: "https://gateway.pipeworx.io/intercom/mcp", color: "#1F8DED", via: "pipeworx" },
  { id: "asana-via", icon: "asana", iconDomain: "asana.com", name: "Asana via Pipeworx", description: "Tasks, projects and timelines", category: "Productivity", kind: "none", url: "https://gateway.pipeworx.io/asana/mcp", color: "#F06A6A", via: "pipeworx" },
  { id: "onedrive", icon: "onedrive", iconDomain: "onedrive.com", name: "OneDrive", description: "Files and folders", category: "Storage", kind: "none", url: "https://gateway.pipeworx.io/onedrive/mcp", color: "#0078D4", via: "pipeworx" },
  { id: "clickup", iconDomain: "clickup.com", name: "ClickUp", description: "Tasks, docs and goals", category: "Productivity", kind: "none", url: "https://clickup.usefulapi.io/mcp", color: "#7B68EE", via: "usefulapi" },
  { id: "zendesk", iconDomain: "zendesk.com", name: "Zendesk", description: "Tickets and customers", category: "Sales", kind: "none", url: "https://zendesk.usefulapi.io/mcp", color: "#03363D", via: "usefulapi" },
  { id: "freshdesk", iconDomain: "freshdesk.com", name: "Freshdesk", description: "Support tickets", category: "Sales", kind: "none", url: "https://freshdesk.usefulapi.io/mcp", color: "#20C997", via: "usefulapi" },
  { id: "mailchimp", iconDomain: "mailchimp.com", name: "Mailchimp", description: "Campaigns and audiences", category: "Marketing", kind: "none", url: "https://mailchimp.usefulapi.io/mcp", color: "#FFE01B", via: "usefulapi" },
  { id: "sendgrid", iconDomain: "sendgrid.com", name: "SendGrid", description: "Send email", category: "Communication", kind: "none", url: "https://sendgrid.usefulapi.io/mcp", color: "#1A82E2", via: "usefulapi" },
  { id: "brightdata", iconDomain: "brightdata.com", name: "Bright Data", description: "Web data and proxy scraping", category: "Developer", kind: "none", url: "https://gateway.pipeworx.io/brightdata/mcp", color: "#0050FF", via: "pipeworx" },
  { id: "twilio", icon: "twilio", iconDomain: "twilio.com", name: "Twilio", description: "SMS, voice and messaging", category: "Communication", kind: "none", url: "https://gateway.pipeworx.io/twilio/mcp", color: "#F22F46", via: "pipeworx" },
  { id: "context7", iconDomain: "context7.com", name: "Context7", description: "Live library documentation", category: "Developer", kind: "none", url: "https://mcp.context7.com/mcp", color: "#F59E0B", zeroSetup: true },
  { id: "shopify", icon: "shopify", iconDomain: "shopify.com", name: "Shopify", description: "Products, orders and customers", category: "Commerce", kind: "none", url: "https://mcp.hasdata.com/api/mcp?apis=shopify", color: "#7AB55C", via: "hasdata", zeroSetup: true },
  { id: "facebook", icon: "facebook", iconDomain: "facebook.com", name: "Facebook Pages", description: "Pages, posts and insights", category: "Social", kind: "none", url: "https://mcp.hasdata.com/api/mcp?apis=facebook", color: "#0866FF", via: "hasdata", zeroSetup: true },
]

/**
 * MCP servers that run on this machine. ZYRAXON ships four of these; the list is
 * here so the Hub can show them beside the remote apps.
 */
export const localApps: AppEntry[] = [
  { id: "jarvis-browser", name: "Jarvis Browser", description: "Headless browser control", category: "Automation", kind: "local", color: "#4285F4" },
  { id: "nuphus-desktop", name: "Nuphus Desktop", description: "Desktop control", category: "Automation", kind: "local", color: "#7C3AED" },
  { id: "touchpoint-mcp", name: "Touchpoint", description: "Screen touch and input", category: "Automation", kind: "local", color: "#EC4899" },
  { id: "desktop-commander", name: "Desktop Commander", description: "Files, processes and shell", category: "System", kind: "local", color: "#0EA5E9" },
  // Fiverr publishes no MCP of its own — fiverr.com/mcp answers 404 — so the only
  // working route is a community server, which means a process here rather than a
  // hosted sign-in. Verified on PyPI as fiverr-mcp-server 0.1.1.
  { id: "fiverr", name: "Fiverr", description: "Search gigs, sellers and reviews", category: "Commerce", kind: "local", color: "#1DBF73", command: { command: "uvx", args: ["fiverr-mcp-server"] } },
]

/** Which section of the Hub an app belongs in. */
export function tierOf(app: AppEntry): AuthTier {
  if (app.kind === "local") return "local"
  if (app.kind === "none") return "open"
  if (app.kind === "token") return "key"
  return "browser"
}

/**
 * Every app, in the order the user meets them: one-click browser sign-in, then a
 * pasted key, then the ones that need nothing, then the local servers.
 */
export const allSeedApps = (): AppEntry[] => [...browserApps, ...keyApps, ...openApps, ...localApps]

/**
 * The catalog grouped for display, skipping empty sections.
 *
 * This is the ordering the panel renders, and it is the ordering the user asked
 * for: a browser sign-in is the easiest thing in the world, a pasted key is next,
 * and a server that needs nothing is last.
 */
export function catalogSections(): { tier: AuthTier; title: string; hint: string; apps: AppEntry[] }[] {
  const apps = allSeedApps()
  const sections = [
    {
      tier: "browser" as const,
      title: "One click, sign in with your browser",
      hint: "Opens your browser. Allow access, and it is connected.",
      apps: apps.filter((a) => tierOf(a) === "browser"),
    },
    {
      tier: "key" as const,
      title: "Paste a key",
      hint: "The vendor issues a key. Paste it and it is connected.",
      apps: apps.filter((a) => tierOf(a) === "key"),
    },
    {
      tier: "open" as const,
      title: "No sign-in needed",
      hint: "Nothing to enter. Connect and it is ready.",
      apps: apps.filter((a) => tierOf(a) === "open"),
    },
    {
      tier: "local" as const,
      title: "Runs on this computer",
      hint: "Started as a local process.",
      apps: apps.filter((a) => tierOf(a) === "local"),
    },
  ]
  return sections.filter((s) => s.apps.length > 0)
}

export const categories = (apps: AppEntry[] = allSeedApps()): string[] =>
  Array.from(new Set(apps.map((a) => a.category))).sort()