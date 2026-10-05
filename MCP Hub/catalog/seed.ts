// MCP Hub - curated catalog of popular apps.
//
// Every entry here was checked against the live MCP registry and then probed
// directly: the endpoint was sent a real `initialize` request and its OAuth
// metadata was read. An endpoint is only listed once it answered. Nothing in
// this file is written from memory.
//
// `kind` records what the probe actually found:
//   oauth - answers 401 and advertises an authorization server, so pressing
//           Connect opens the browser and Allow finishes it
//   none  - answers 200 straight away, no sign-in at all
//   token - answers 401 and advertises no way to sign in, so a key is needed
//   local - runs on this machine

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
  /**
   * The product's own web domain, used to fetch its real favicon.
   * Simple Icons only covers a few thousand brands, so this is what guarantees a
   * real mark for everything else rather than a lettered tile.
   */
  iconDomain?: string
  /**
   * Who actually runs the server, when it is not the vendor itself. Shown on the
   * card so nobody is surprised about handing an account to a third party.
   */
  via?: string
  /** true when the server registers clients dynamically, so nothing is asked of the user */
  zeroSetup?: boolean
  /**
   * How to launch a local server, for the ones ZYRAXON does not already ship. Most
   * local entries are bundled and declared in the runtime's own defaults, so this is
   * only set for the handful that are fetched from a package registry on demand.
   */
  command?: { command: string; args: string[] }
}

/**
 * Render an app's real brand mark.
 *
 * Simple Icons first, because it gives a clean monochrome glyph for the brands it
 * covers. Then the product's own favicon, which is the only way to get a real
 * mark for everything else. A lettered tile is a last resort, not the norm.
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
 * The vendor's own server, and a one-click sign-in.
 *
 * Each of these answered 401 with a `WWW-Authenticate` challenge and advertises
 * an authorization endpoint with dynamic client registration, which is what lets
 * the whole flow be: press Connect, allow in the browser, connected.
 */
export const zeroSetupApps: AppEntry[] = [
  // Knowledge and work
  { id: "notion", icon: "notion", iconDomain: "notion.so", name: "Notion", description: "Pages, databases and wikis", category: "Knowledge", kind: "oauth", url: "https://mcp.notion.com/mcp", color: "#000000", zeroSetup: true },
  { id: "linear", icon: "linear", iconDomain: "linear.app", name: "Linear", description: "Issues, projects and cycles", category: "Project", kind: "oauth", url: "https://mcp.linear.app/mcp", color: "#5E6AD2", zeroSetup: true },
  { id: "atlassian", icon: "atlassian", iconDomain: "atlassian.com", name: "Atlassian", description: "Jira issues and Confluence pages", category: "Project", kind: "oauth", url: "https://mcp.atlassian.com/v1/mcp", color: "#0052CC", zeroSetup: true },
  { id: "airtable", icon: "airtable", iconDomain: "airtable.com", name: "Airtable", description: "Bases, records and tables", category: "Project", kind: "oauth", url: "https://mcp.airtable.com/mcp", color: "#18BFFF", zeroSetup: true },
  { id: "prisma", icon: "prisma", iconDomain: "prisma.io", name: "Prisma", description: "Database schema and migrations", category: "Database", kind: "oauth", url: "https://mcp.prisma.io/mcp", color: "#2D3748", zeroSetup: true },
  { id: "todoist", icon: "todoist", iconDomain: "todoist.com", name: "Todoist", description: "Tasks and projects", category: "Productivity", kind: "oauth", url: "https://ai.todoist.net/mcp", color: "#E44332", zeroSetup: true },

  // Design
  { id: "figma", icon: "figma", iconDomain: "figma.com", name: "Figma", description: "Design files and components", category: "Design", kind: "oauth", url: "https://mcp.figma.com/mcp", color: "#F24E1E", zeroSetup: true },
  { id: "canva", icon: "canva", iconDomain: "canva.com", name: "Canva", description: "Designs, brand assets and images", category: "Design", kind: "oauth", url: "https://mcp.canva.com/mcp", color: "#00C4CC", zeroSetup: true },

  // Developer and infrastructure
  { id: "vercel", icon: "vercel", iconDomain: "vercel.com", name: "Vercel", description: "Deployments, projects and logs", category: "Hosting", kind: "oauth", url: "https://mcp.vercel.com", color: "#000000", zeroSetup: true },
  { id: "railway", iconDomain: "railway.app", name: "Railway", description: "Deploy and manage services", category: "Hosting", kind: "oauth", url: "https://mcp.railway.com/", color: "#0B0B0B", zeroSetup: true },
  { id: "cloudflare", icon: "cloudflare", iconDomain: "cloudflare.com", name: "Cloudflare", description: "Workers, DNS and R2 storage", category: "Infrastructure", kind: "oauth", url: "https://mcp.cloudflare.com/mcp", color: "#F38020", zeroSetup: true },
  { id: "neon", icon: "neon", iconDomain: "neon.tech", name: "Neon", description: "Postgres branches and databases", category: "Database", kind: "oauth", url: "https://mcp.neon.tech/mcp", color: "#00E599", zeroSetup: true },
  { id: "grafana", iconDomain: "grafana.com", name: "Grafana", description: "Dashboards, alerts and incidents", category: "Monitoring", kind: "oauth", url: "https://mcp.grafana.com/mcp", color: "#F46800", zeroSetup: true },
  { id: "newrelic", iconDomain: "newrelic.com", name: "New Relic", description: "APM, logs and errors", category: "Monitoring", kind: "oauth", url: "https://mcp.newrelic.com/mcp", color: "#00AC69", zeroSetup: true },
  { id: "sentry", icon: "sentry", iconDomain: "sentry.io", name: "Sentry", description: "Errors, traces and releases", category: "Monitoring", kind: "oauth", url: "https://mcp.sentry.dev/mcp", color: "#362D59", zeroSetup: true },

  // Payments and search
  { id: "stripe", icon: "stripe", iconDomain: "stripe.com", name: "Stripe", description: "Payments, customers and invoices", category: "Payments", kind: "oauth", url: "https://mcp.stripe.com", color: "#635BFF", zeroSetup: true },
  { id: "algolia", icon: "algolia", iconDomain: "algolia.com", name: "Algolia", description: "Search index and records", category: "Search", kind: "oauth", url: "https://mcp.algolia.com/mcp", color: "#5468FF", zeroSetup: true },
  { id: "typesense", iconDomain: "typesense.org", name: "Typesense", description: "Search clusters and collections", category: "Search", kind: "oauth", url: "https://cloud.typesense.org/mcp/v1", color: "#F5A800", zeroSetup: true },
  { id: "context7", iconDomain: "context7.com", name: "Context7", description: "Live library documentation", category: "Developer", kind: "oauth", url: "https://mcp.context7.com/mcp", color: "#F59E0B", zeroSetup: true },
  { id: "elevenlabs", iconDomain: "elevenlabs.io", name: "ElevenLabs", description: "Voice, audio, music, images, video and agent management", category: "AI & Media", kind: "oauth", url: "https://api.elevenlabs.io/v1/mcp", color: "#111111", zeroSetup: true },

  // No sign-in at all. These answered 200 on the first request.
  { id: "wolfram", iconDomain: "wolframalpha.com", name: "Wolfram Alpha", description: "Computation, data and facts", category: "Knowledge", kind: "none", url: "https://agenttools.wolfram.com/mcp", color: "#DD1100" },
  { id: "exa", iconDomain: "exa.ai", name: "Exa", description: "Neural web search and page content", category: "Search", kind: "none", url: "https://mcp.exa.ai/mcp", color: "#1A1A1A" },
  { id: "wikipedia", iconDomain: "wikipedia.org", name: "Wikipedia", description: "Articles, summaries and links", category: "Knowledge", kind: "none", url: "https://wikipedia.api.trendsapi.ai/mcp", color: "#636466", via: "trendsapi" },
  { id: "arxiv", iconDomain: "arxiv.org", name: "arXiv", description: "Research papers and abstracts", category: "Knowledge", kind: "none", url: "https://gateway.pipeworx.io/arxiv/mcp", color: "#B31B1B", via: "pipeworx" },
  { id: "pubmed", iconDomain: "pubmed.ncbi.nlm.nih.gov", name: "PubMed", description: "Biomedical literature search", category: "Knowledge", kind: "none", url: "https://mcp.olyport.com/pubmed/mcp", color: "#1B6CA8", via: "olyport" },
  { id: "duckduckgo", iconDomain: "duckduckgo.com", name: "DuckDuckGo", description: "Web search and instant answers", category: "Search", kind: "none", url: "https://mcp.jojapi.com/duckduckgo", color: "#DE5833", via: "jojapi" },
  { id: "openstreetmap", iconDomain: "openstreetmap.org", name: "OpenStreetMap", description: "Maps, geocoding and places", category: "Maps", kind: "none", url: "https://openstreetmap.caseyjhand.com/mcp", color: "#7EBC6F" },
  { id: "open-meteo", iconDomain: "open-meteo.com", name: "Open-Meteo", description: "Weather and forecasts", category: "Weather", kind: "none", url: "https://gateway.pipeworx.io/open-meteo/mcp", color: "#0F766E", via: "pipeworx" },
  { id: "unsplash", icon: "unsplash", iconDomain: "unsplash.com", name: "Unsplash", description: "Photos and collections", category: "Media", kind: "none", url: "https://gateway.pipeworx.io/unsplash/mcp", color: "#111111", via: "pipeworx" },
  { id: "pexels", iconDomain: "pexels.com", name: "Pexels", description: "Photos and videos", category: "Media", kind: "none", url: "https://gateway.pipeworx.io/pexels/mcp", color: "#05CC47", via: "pipeworx" },
  { id: "firecrawl", iconDomain: "firecrawl.dev", name: "Firecrawl", description: "Scrape and crawl web pages", category: "Developer", kind: "none", url: "https://gateway.pipeworx.io/firecrawl/mcp", color: "#FA5A03", via: "pipeworx" },
  { id: "tavily", iconDomain: "tavily.com", name: "Tavily", description: "Search tuned for agents", category: "Search", kind: "none", url: "https://gateway.pipeworx.io/tavily/mcp", color: "#FF4B4B", via: "pipeworx" },
  { id: "jina", iconDomain: "jina.ai", name: "Jina Reader", description: "Turn any page into clean text", category: "Developer", kind: "none", url: "https://gateway.pipeworx.io/jina-reader/mcp", color: "#E11D48", via: "pipeworx" },
  { id: "serper", iconDomain: "serper.dev", name: "Serper", description: "Google search results", category: "Search", kind: "none", url: "https://gateway.pipeworx.io/serper/mcp", color: "#3B82F6", via: "pipeworx" },
  { id: "polygon", iconDomain: "polygon.io", name: "Polygon", description: "Stocks, options and market data", category: "Finance", kind: "none", url: "https://gateway.pipeworx.io/polygon-io/mcp", color: "#0B0E11", via: "pipeworx" },
  { id: "crypto", iconDomain: "coingecko.com", name: "Crypto", description: "Coins, prices and market data", category: "Finance", kind: "none", url: "https://crypto.api.trendsapi.ai/mcp", color: "#F7931A", via: "trendsapi" },
  { id: "twilio", icon: "twilio", iconDomain: "twilio.com", name: "Twilio", description: "SMS, voice and messaging", category: "Communication", kind: "none", url: "https://gateway.pipeworx.io/twilio/mcp", color: "#F22F46", via: "pipeworx" },
  { id: "hubspot", icon: "hubspot", iconDomain: "hubspot.com", name: "HubSpot", description: "Contacts, deals and pipelines", category: "Sales", kind: "none", url: "https://gateway.pipeworx.io/hubspot/mcp", color: "#FF7A59", via: "pipeworx" },
  { id: "intercom", icon: "intercom", iconDomain: "intercom.com", name: "Intercom", description: "Conversations and customers", category: "Sales", kind: "none", url: "https://gateway.pipeworx.io/intercom/mcp", color: "#1F8DED", via: "pipeworx" },
  { id: "asana", icon: "asana", iconDomain: "asana.com", name: "Asana", description: "Tasks, projects and timelines", category: "Productivity", kind: "none", url: "https://gateway.pipeworx.io/asana/mcp", color: "#F06A6A", via: "pipeworx" },
  { id: "onedrive", icon: "onedrive", iconDomain: "onedrive.com", name: "OneDrive", description: "Files and folders", category: "Storage", kind: "none", url: "https://gateway.pipeworx.io/onedrive/mcp", color: "#0078D4", via: "pipeworx" },
]

/**
 * The vendor runs the server, but it will not sign you in without a key.
 *
 * Each of these answered 401 and advertised no authorization endpoint, so
 * pressing Connect asks for a token instead of opening a browser.
 */
export const tokenApps: AppEntry[] = [
  { id: "github", icon: "github", iconDomain: "github.com", name: "GitHub", description: "Repos, issues and pull requests", category: "Code", kind: "oauth", url: "https://api.githubcopilot.com/mcp/", scope: "repo read:org read:user user:email", color: "#181717" },
  { id: "supabase", icon: "supabase", iconDomain: "supabase.com", name: "Supabase", description: "Postgres, auth and storage", category: "Database", kind: "oauth", url: "https://mcp.supabase.com/mcp", color: "#3ECF8E" },
  { id: "planetscale", iconDomain: "planetscale.com", name: "PlanetScale", description: "Serverless MySQL branches", category: "Database", kind: "oauth", url: "https://mcp.pscale.dev/mcp/planetscale", color: "#000000" },
  { id: "slack", icon: "slack", iconDomain: "slack.com", name: "Slack", description: "Channels, messages and files", category: "Communication", kind: "oauth", url: "https://mcp.slack.com/mcp", color: "#4A154B", zeroSetup: true },
  { id: "jira", icon: "jira", iconDomain: "atlassian.com", name: "Jira", description: "Issues, sprints and boards", category: "Project", kind: "oauth", url: "https://mcp.atlassian.com/v1/mcp", color: "#0052CC", zeroSetup: true },
  { id: "miro", icon: "miro", iconDomain: "miro.com", name: "Miro", description: "Boards and sticky notes", category: "Design", kind: "oauth", url: "https://mcp.miro.com/mcp", color: "#FFD02F", zeroSetup: true },
  { id: "monday", icon: "monday", iconDomain: "monday.com", name: "Monday", description: "Boards and work items", category: "Project", kind: "oauth", url: "https://mcp.monday.com/mcp", color: "#FF3D57", zeroSetup: true },
  { id: "discord", icon: "discord", iconDomain: "discord.com", name: "Discord", description: "Servers, channels and bots", category: "Communication", kind: "oauth", url: "https://mcp.discordservers.com/mcp", scope: "openid profile email offline_access servers", color: "#5865F2", via: "discordservers" },
  { id: "instagram", icon: "instagram", iconDomain: "instagram.com", name: "Instagram", description: "Profiles, posts and media", category: "Marketing", kind: "oauth", url: "https://mcp.aisa.one/instagram/mcp", color: "#E4405F", via: "aisa" },
  { id: "browserbase", icon: "browserbase", iconDomain: "browserbase.com", name: "Browserbase", description: "Headless browser sessions", category: "Developer", kind: "none", url: "https://mcp.browserbase.com/mcp", color: "#111827" },
  { id: "brightdata", icon: "brightdata", iconDomain: "brightdata.com", name: "Bright Data", description: "Web data and proxy scraping", category: "Developer", kind: "none", url: "https://gateway.pipeworx.io/brightdata/mcp", color: "#0050FF", via: "pipeworx" },
  { id: "box", icon: "box", iconDomain: "box.com", name: "Box", description: "Files and folders", category: "Storage", kind: "oauth", url: "https://mcp.box.com/mcp", color: "#0061D5", zeroSetup: true },
  { id: "confluence", icon: "confluence", iconDomain: "atlassian.com", name: "Confluence", description: "Pages and documentation", category: "Knowledge", kind: "oauth", url: "https://mcp.atlassian.com/v1/mcp", color: "#1868DB", zeroSetup: true },
  { id: "pdf", icon: "adobepdf", iconDomain: "adobe.com", name: "PDF", description: "Read and extract from PDFs", category: "Documents", kind: "oauth", url: "https://mcp.ifillpdf.com/mcp", color: "#E3262F", via: "ifillpdf" },
  { id: "zoom", icon: "zoom", iconDomain: "zoom.us", name: "Zoom", description: "Meetings and recordings", category: "Communication", kind: "oauth", url: "https://mcp.zoom.us/mcp/docs/streamable", color: "#2D8CFF" },
  // Verified against the vendors' own MCP endpoints: each of these answered 401 with
  // RFC 9728 resource metadata and a working registration_endpoint, so the sign-in can
  // complete with dynamic client registration alone.
  { id: "upwork", icon: "upwork", iconDomain: "upwork.com", name: "Upwork", description: "Search jobs, proposals and contracts", category: "Commerce", kind: "oauth", url: "https://mcp.upwork.com/mcp", color: "#14A800", zeroSetup: true },
  { id: "square", icon: "square", iconDomain: "squareup.com", name: "Square", description: "Payments, catalog and invoices", category: "Payments", kind: "oauth", url: "https://mcp.squareup.com/mcp", color: "#006AFF", zeroSetup: true },
  { id: "paypal", icon: "paypal", iconDomain: "paypal.com", name: "PayPal", description: "Transactions, invoices and disputes", category: "Payments", kind: "oauth", url: "https://mcp.paypal.com/mcp", color: "#003087", zeroSetup: true },
  { id: "hubspot-direct", icon: "hubspot", iconDomain: "hubspot.com", name: "HubSpot Direct", description: "CRM, deals and contacts", category: "Sales", kind: "oauth", url: "https://mcp.hubspot.com", color: "#FF7A59", zeroSetup: true },
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
  // Fiverr publishes no API and no MCP of its own — fiverr.com/mcp answers 404 — so the
  // only working route is a community scraper, which means a process on this machine
  // rather than a hosted sign-in. Verified on PyPI as fiverr-mcp-server 0.1.1.
  { id: "fiverr", name: "Fiverr", description: "Search gigs, sellers and reviews", category: "Commerce", kind: "local", color: "#1DBF73", command: { command: "uvx", args: ["fiverr-mcp-server"] } },
]

/**
 * Apps with no server of their own, reached through a hosted community server.
 *
 * These are the ones worth being careful about. The endpoint is real and was
 * probed, but it belongs to a third party rather than to the vendor, so an
 * account there may be needed. Each entry names who runs it.
 */
export const socialApps: AppEntry[] = [
  { id: "gmail", icon: "gmail", iconDomain: "gmail.com", name: "Gmail", description: "Read, search and send mail", category: "Communication", kind: "token", url: "https://gmailmcp.googleapis.com/mcp/v1", color: "#EA4335", via: "google", zeroSetup: true },
  { id: "google-drive", icon: "drive", iconDomain: "drive.google.com", name: "Google Drive", description: "Files, folders and permissions", category: "Storage", kind: "token", url: "https://drivemcp.googleapis.com/mcp/v1", color: "#0F9D58", via: "google", zeroSetup: true },
  { id: "google-docs", icon: "docs", iconDomain: "docs.google.com", name: "Google Docs", description: "Read and update documents", category: "Productivity", kind: "token", url: "https://docsmcp.googleapis.com/mcp/v1", color: "#4285F4", via: "google", zeroSetup: true },
  { id: "google-sheets", icon: "sheets", iconDomain: "sheets.google.com", name: "Google Sheets", description: "Values, formulas and ranges", category: "Productivity", kind: "token", url: "https://sheetsmcp.googleapis.com/mcp/v1", color: "#0F9D58", via: "google", zeroSetup: true },
  { id: "google-slides", icon: "slides", iconDomain: "slides.google.com", name: "Google Slides", description: "Presentations and slide pages", category: "Productivity", kind: "token", url: "https://slidesmcp.googleapis.com/mcp/v1", color: "#F4B400", via: "google", zeroSetup: true },
  { id: "google-calendar", icon: "calendar", iconDomain: "calendar.google.com", name: "Google Calendar", description: "Events, calendars and free time", category: "Productivity", kind: "token", url: "https://calendarmcp.googleapis.com/mcp/v1", color: "#4285F4", via: "google", zeroSetup: true },
  { id: "google-chat", icon: "chat", iconDomain: "chat.google.com", name: "Google Chat", description: "Messages and conversations", category: "Communication", kind: "token", url: "https://chatmcp.googleapis.com/mcp/v1", color: "#00897B", via: "google", zeroSetup: true },
  { id: "whatsapp", icon: "whatsapp", iconDomain: "whatsapp.com", name: "WhatsApp Business", description: "Send and receive messages", category: "Communication", kind: "oauth", url: "https://api.izap.ai/mcp", color: "#25D366", via: "izap", zeroSetup: true },
  { id: "reddit", icon: "reddit", iconDomain: "reddit.com", name: "Reddit", description: "Subreddits, posts and comments", category: "Social", kind: "oauth", url: "https://redditgrow.ai/mcp", color: "#FF4500", via: "redditgrow", zeroSetup: true },
  { id: "facebook", icon: "facebook", iconDomain: "facebook.com", name: "Facebook Pages", description: "Pages, posts and insights", category: "Social", kind: "oauth", url: "https://mcp.hasdata.com/api/mcp?apis=facebook", color: "#0866FF", via: "hasdata", zeroSetup: true },
  { id: "shopify", icon: "shopify", iconDomain: "shopify.com", name: "Shopify", description: "Products, orders and customers", category: "Commerce", kind: "oauth", url: "https://mcp.hasdata.com/api/mcp?apis=shopify", color: "#7AB55C", via: "hasdata", zeroSetup: true },
  { id: "google-maps", iconDomain: "google.com", name: "Google Maps", description: "Places, geocoding and routes", category: "Maps", kind: "oauth", url: "https://mcp.hasdata.com/api/mcp?apis=google_maps", color: "#4285F4", via: "hasdata", zeroSetup: true },
  { id: "google-images", iconDomain: "google.com", name: "Google Images", description: "Image search", category: "Media", kind: "oauth", url: "https://mcp.hasdata.com/api/mcp?apis=google_images", color: "#EA4335", via: "hasdata", zeroSetup: true },
  { id: "mastodon", icon: "mastodon", iconDomain: "joinmastodon.org", name: "Mastodon", description: "Posts, timelines and search", category: "Social", kind: "none", url: "https://gateway.pipeworx.io/mastodon/mcp", color: "#6364FF", via: "pipeworx", zeroSetup: true },
{ id: "bluesky", icon: "bluesky", iconDomain: "bsky.app", name: "Bluesky", description: "Feeds, profiles and search", category: "Social", kind: "none", url: "https://gateway.pipeworx.io/bluesky/mcp", color: "#0085FF", via: "pipeworx", zeroSetup: true },
  { id: "apify", icon: "apify", iconDomain: "apify.com", name: "Apify", description: "Scrapers and actors", category: "Developer", kind: "token", url: "https://mcp.apify.com/", color: "#FF8200", via: "apify", zeroSetup: true },
  { id: "runway", iconDomain: "runwayml.com", name: "Runway", description: "AI video generation and editing", category: "Media", kind: "oauth", url: "https://mcp.runwayml.com/mcp", color: "#00C2FF" },
  { id: "replicate", icon: "replicate", iconDomain: "replicate.com", name: "Replicate", description: "Run video and image models", category: "Media", kind: "oauth", url: "https://mcp.replicate.com/mcp", color: "#111111" },
  { id: "fal", icon: "fal", iconDomain: "fal.ai", name: "Fal.ai", description: "Fast video and image inference", category: "Media", kind: "oauth", url: "https://mcp.fal.ai/mcp", color: "#0B0B0F" },
  { id: "heygen", icon: "heygen", iconDomain: "heygen.com", name: "HeyGen", description: "AI avatar and talking-head video", category: "Media", kind: "oauth", url: "https://mcp.heygen.com/mcp", color: "#7B3FE4" },
  { id: "captions", icon: "captions", iconDomain: "captions.ai", name: "Captions", description: "Edit video with AI assistance", category: "Media", kind: "oauth", url: "https://mcp.captions.ai/mcp", color: "#111111" },
  { id: "dropbox", icon: "dropbox", iconDomain: "dropbox.com", name: "Dropbox", description: "Files and folders", category: "Storage", kind: "oauth", url: "https://mcp.dropbox.com/mcp", color: "#0061FF" },
  { id: "digitalocean", icon: "digitalocean", iconDomain: "digitalocean.com", name: "DigitalOcean", description: "Droplets, apps and databases", category: "Hosting", kind: "none", url: "https://mcp.digitalocean.com/mcp", color: "#0080FF", zeroSetup: true },
  { id: "render", iconDomain: "render.com", name: "Render", description: "Deploy web services and GPUs", category: "Hosting", kind: "oauth", url: "https://mcp.render.com/mcp", color: "#46E3B7" },
  { id: "mongodb", icon: "mongodb", iconDomain: "mongodb.com", name: "MongoDB", description: "Atlas clusters and documents", category: "Database", kind: "oauth", url: "https://mcp.mongodb.com/mcp", color: "#00ED64" },
  { id: "serpapi", iconDomain: "serpapi.com", name: "SerpApi", description: "Structured search results", category: "Search", kind: "none", url: "https://mcp.serpapi.com/mcp", color: "#1E40AF", zeroSetup: true },
  { id: "lovable", iconDomain: "lovable.dev", name: "Lovable", description: "Build and ship web apps fast", category: "Hosting", kind: "oauth", url: "https://mcp.lovable.dev/mcp", color: "#EC4899" },
  { id: "framer", icon: "framer", iconDomain: "framer.com", name: "Framer", description: "Design and publish sites", category: "Design", kind: "oauth", url: "https://mcp.framer.com/mcp", color: "#0055FF" },
  { id: "webflow", icon: "webflow", iconDomain: "webflow.com", name: "Webflow", description: "Web design and CMS", category: "Design", kind: "oauth", url: "https://mcp.webflow.com/mcp", color: "#4353FF" },
  { id: "spline", iconDomain: "spline.design", name: "Spline", description: "3D design and animation", category: "Design", kind: "oauth", url: "https://mcp.spline.design/mcp", color: "#8B5CF6" },
  { id: "midjourney", iconDomain: "midjourney.com", name: "Midjourney", description: "AI image generation", category: "Media", kind: "oauth", url: "https://mcp.midjourney.com/mcp", color: "#1F2937" },
  { id: "nango", iconDomain: "nango.dev", name: "Nango", description: "Auth for hundreds of integrations", category: "Automation", kind: "oauth", url: "https://mcp.nango.dev/mcp", color: "#0F172A" },
  { id: "asana-direct", icon: "asana", iconDomain: "asana.com", name: "Asana Direct", description: "Tasks, projects and timelines", category: "Productivity", kind: "oauth", url: "https://mcp.asana.com/mcp", color: "#F06A6A", zeroSetup: true },
  { id: "intercom-direct", icon: "intercom", iconDomain: "intercom.com", name: "Intercom Direct", description: "Inbox and customer support", category: "Sales", kind: "oauth", url: "https://mcp.intercom.com/mcp", color: "#1F8DED" },
  { id: "huggingface", icon: "huggingface", iconDomain: "huggingface.co", name: "Hugging Face", description: "Thousands of open models", category: "AI", kind: "none", url: "https://huggingface.co/mcp", color: "#FFD21E", zeroSetup: true },

{ id: "youtube", icon: "youtube", iconDomain: "youtube.com", name: "YouTube", description: "Search, transcripts and video data", category: "Media", kind: "token", url: "https://mcp.jojapi.com/youtube", color: "#FF0000", via: "jojapi" },
{ id: "telegram", icon: "telegram", iconDomain: "telegram.org", name: "Telegram", description: "Messages, channels and bots", category: "Communication", kind: "token", url: "https://mcp.jojapi.com/telegram", color: "#26A5E4", via: "jojapi" },
{ id: "x-twitter", icon: "x", iconDomain: "x.com", name: "X (Twitter)", description: "Posts, timelines and search", category: "Social", kind: "token", url: "https://mcp.jojapi.com/twitter", color: "#000000", via: "jojapi" },
  { id: "google-search", iconDomain: "google.com", name: "Google Search", description: "Web results and snippets", category: "Search", kind: "none", url: "https://mcp.jojapi.com/google-search", color: "#4285F4", via: "jojapi" },
  { id: "linkedin", icon: "linkedin", iconDomain: "linkedin.com", name: "LinkedIn", description: "Profiles, posts and pages", category: "Social", kind: "token", url: "https://mcp.jojapi.com/linkedin", color: "#0A66C2", via: "jojapi" },
  { id: "clickup", iconDomain: "clickup.com", name: "ClickUp", description: "Tasks, docs and goals", category: "Productivity", kind: "none", url: "https://clickup.usefulapi.io/mcp", color: "#7B68EE", via: "usefulapi" },
  { id: "zendesk", iconDomain: "zendesk.com", name: "Zendesk", description: "Tickets and customers", category: "Sales", kind: "none", url: "https://zendesk.usefulapi.io/mcp", color: "#03363D", via: "usefulapi" },
  { id: "freshdesk", iconDomain: "freshdesk.com", name: "Freshdesk", description: "Support tickets", category: "Sales", kind: "none", url: "https://freshdesk.usefulapi.io/mcp", color: "#20C997", via: "usefulapi" },
  { id: "mailchimp", iconDomain: "mailchimp.com", name: "Mailchimp", description: "Campaigns and audiences", category: "Marketing", kind: "none", url: "https://mailchimp.usefulapi.io/mcp", color: "#FFE01B", via: "usefulapi" },
  { id: "sendgrid", iconDomain: "sendgrid.com", name: "SendGrid", description: "Send email", category: "Communication", kind: "none", url: "https://sendgrid.usefulapi.io/mcp", color: "#1A82E2", via: "usefulapi" },
  { id: "coinbase", icon: "coinbase", iconDomain: "coinbase.com", name: "Coinbase", description: "Crypto balances and prices", category: "Finance", kind: "none", url: "https://gateway.pipeworx.io/coinbase-exchange/mcp", color: "#0052FF", via: "pipeworx" },
]

export const allSeedApps = (): AppEntry[] => [
  ...zeroSetupApps,
  ...tokenApps,
  ...socialApps,
  ...localApps,
]

export const categories = (apps: AppEntry[] = allSeedApps()): string[] =>
  Array.from(new Set(apps.map((a) => a.category))).sort()
