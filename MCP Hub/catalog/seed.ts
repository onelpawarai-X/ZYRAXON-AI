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
  { id: "prisma", icon: "prisma", iconDomain: "prisma.io", name: "Prisma", description: "Database schema and migrations", category: "Database", kind: "oauth", url: "https://mcp.prisma.io/sse", color: "#2D3748", zeroSetup: true },
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
  { id: "arxiv", iconDomain: "arxiv.org", name: "arXiv", description: "Research papers and abstracts", category: "Knowledge", kind: "none", url: "https://arxiv.mcp.brunosan.de/mcp", color: "#B31B1B" },
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
  { id: "github", icon: "github", iconDomain: "github.com", name: "GitHub", description: "Repos, issues and pull requests", category: "Code", kind: "token", url: "https://api.githubcopilot.com/mcp/", tokenUrl: "https://github.com/settings/personal-access-tokens", scope: "repo read:org read:user user:email", color: "#181717" },
  { id: "supabase", icon: "supabase", iconDomain: "supabase.com", name: "Supabase", description: "Postgres, auth and storage", category: "Database", kind: "token", url: "https://mcp.supabase.com/mcp", tokenUrl: "https://supabase.com/dashboard/account/tokens", color: "#3ECF8E" },
  { id: "planetscale", iconDomain: "planetscale.com", name: "PlanetScale", description: "Serverless MySQL branches", category: "Database", kind: "token", url: "https://mcp.pscale.dev/mcp/planetscale", tokenUrl: "https://planetscale.com/console/settings/service-tokens", color: "#000000" },
  { id: "postgres", icon: "postgresql", iconDomain: "postgresql.org", name: "PostgreSQL", description: "Run queries against a database", category: "Database", kind: "token", url: "https://waystation.ai/postgres/mcp", tokenUrl: "https://waystation.ai", color: "#4169E1", via: "waystation" },
  { id: "slack", icon: "slack", iconDomain: "slack.com", name: "Slack", description: "Channels, messages and files", category: "Communication", kind: "token", url: "https://waystation.ai/slack/mcp", tokenUrl: "https://waystation.ai", color: "#4A154B", via: "waystation" },
  { id: "jira", icon: "jira", iconDomain: "atlassian.com", name: "Jira", description: "Issues, sprints and boards", category: "Project", kind: "token", url: "https://waystation.ai/jira/mcp", tokenUrl: "https://waystation.ai", color: "#0052CC", via: "waystation" },
  { id: "miro", iconDomain: "miro.com", name: "Miro", description: "Boards and sticky notes", category: "Design", kind: "token", url: "https://waystation.ai/miro/mcp", tokenUrl: "https://waystation.ai", color: "#FFD02F", via: "waystation" },
  { id: "monday", iconDomain: "monday.com", name: "Monday", description: "Boards and work items", category: "Project", kind: "token", url: "https://waystation.ai/monday/mcp", tokenUrl: "https://waystation.ai", color: "#FF3D57", via: "waystation" },
  { id: "discord", icon: "discord", iconDomain: "discord.com", name: "Discord", description: "Servers, channels and bots", category: "Communication", kind: "token", url: "https://mcp.discordservers.com/mcp", tokenUrl: "https://mcp.discordservers.com", color: "#5865F2", via: "discordservers" },
  { id: "instagram", icon: "instagram", iconDomain: "instagram.com", name: "Instagram", description: "Profiles, posts and media", category: "Marketing", kind: "token", url: "https://mcp.aisa.one/instagram/mcp", tokenUrl: "https://mcp.aisa.one", color: "#E4405F", via: "aisa" },
  { id: "brave", iconDomain: "brave.com", name: "Brave Search", description: "Independent web search", category: "Search", kind: "token", url: "https://server.smithery.ai/brave/mcp", tokenUrl: "https://smithery.ai", color: "#FB542B", via: "smithery" },
  { id: "browserbase", iconDomain: "browserbase.com", name: "Browserbase", description: "Headless browser sessions", category: "Developer", kind: "token", url: "https://server.smithery.ai/@browserbasehq/mcp-browserbase/mcp", tokenUrl: "https://smithery.ai", color: "#111827", via: "smithery" },
  { id: "brightdata", iconDomain: "brightdata.com", name: "Bright Data", description: "Web data and proxy scraping", category: "Developer", kind: "token", url: "https://server.smithery.ai/@luminati-io/brightdata-mcp/mcp", tokenUrl: "https://smithery.ai", color: "#0050FF", via: "smithery" },
  { id: "sqlite", icon: "sqlite", iconDomain: "sqlite.org", name: "SQLite", description: "Query a local database file", category: "Database", kind: "token", url: "https://server.smithery.ai/@wgong/sqlite-mcp-server/mcp", tokenUrl: "https://smithery.ai", color: "#003B57", via: "smithery" },
  { id: "box", icon: "box", iconDomain: "box.com", name: "Box", description: "Files and folders", category: "Storage", kind: "token", url: "https://mcp.agentboxd.com/mcp", tokenUrl: "https://agentboxd.com", color: "#0061D5", via: "agentboxd" },
  { id: "confluence", iconDomain: "atlassian.com", name: "Confluence", description: "Pages and documentation", category: "Knowledge", kind: "token", url: "https://mcp.0dteconfluence.com/mcp", tokenUrl: "https://mcp.0dteconfluence.com", color: "#1868DB", via: "0dte" },
  { id: "pdf", icon: "adobepdf", iconDomain: "adobe.com", name: "PDF", description: "Read and extract from PDFs", category: "Documents", kind: "token", url: "https://mcp.ifillpdf.com/mcp", tokenUrl: "https://mcp.ifillpdf.com", color: "#E3262F", via: "ifillpdf" },
  { id: "zoom", icon: "zoom", iconDomain: "zoom.us", name: "Zoom", description: "Meetings and recordings", category: "Communication", kind: "token", url: "https://mcp.zoom.us/mcp/docs/streamable", tokenUrl: "https://zoom.us/developer", color: "#2D8CFF" },
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
 * Apps with no server of their own, reached through a hosted community server.
 *
 * These are the ones worth being careful about. The endpoint is real and was
 * probed, but it belongs to a third party rather than to the vendor, so an
 * account there may be needed. Each entry names who runs it.
 */
export const socialApps: AppEntry[] = [
  { id: "gmail", icon: "gmail", iconDomain: "gmail.com", name: "Gmail", description: "Read, search and send mail", category: "Communication", kind: "oauth", url: "https://gmail.mintmcp.com/mcp", color: "#EA4335", via: "mintmcp", zeroSetup: true },
  { id: "whatsapp", icon: "whatsapp", iconDomain: "whatsapp.com", name: "WhatsApp Business", description: "Send and receive messages", category: "Communication", kind: "oauth", url: "https://api.izap.ai/mcp", color: "#25D366", via: "izap", zeroSetup: true },
  { id: "reddit", icon: "reddit", iconDomain: "reddit.com", name: "Reddit", description: "Subreddits, posts and comments", category: "Social", kind: "oauth", url: "https://redditgrow.ai/mcp", color: "#FF4500", via: "redditgrow", zeroSetup: true },
  { id: "facebook", icon: "facebook", iconDomain: "facebook.com", name: "Facebook Pages", description: "Pages, posts and insights", category: "Social", kind: "oauth", url: "https://mcp.hasdata.com/api/mcp?apis=facebook", color: "#0866FF", via: "hasdata", zeroSetup: true },
  { id: "shopify", icon: "shopify", iconDomain: "shopify.com", name: "Shopify", description: "Products, orders and customers", category: "Commerce", kind: "oauth", url: "https://mcp.hasdata.com/api/mcp?apis=shopify", color: "#7AB55C", via: "hasdata", zeroSetup: true },
  { id: "google-maps", iconDomain: "google.com", name: "Google Maps", description: "Places, geocoding and routes", category: "Maps", kind: "oauth", url: "https://mcp.hasdata.com/api/mcp?apis=google_maps", color: "#4285F4", via: "hasdata", zeroSetup: true },
  { id: "google-images", iconDomain: "google.com", name: "Google Images", description: "Image search", category: "Media", kind: "oauth", url: "https://mcp.hasdata.com/api/mcp?apis=google_images", color: "#EA4335", via: "hasdata", zeroSetup: true },
  { id: "mastodon", icon: "mastodon", iconDomain: "joinmastodon.org", name: "Mastodon", description: "Posts, timelines and search", category: "Social", kind: "oauth", url: "https://gateway.pipeworx.io/mastodon/mcp", color: "#6364FF", via: "pipeworx", zeroSetup: true },
  { id: "apify", icon: "apify", iconDomain: "apify.com", name: "Apify", description: "Scrapers and actors", category: "Developer", kind: "oauth", url: "https://mcp.apify.com/", color: "#FF8200", zeroSetup: true },

  { id: "youtube", icon: "youtube", iconDomain: "youtube.com", name: "YouTube", description: "Search, transcripts and video data", category: "Media", kind: "none", url: "https://mcp.jojapi.com/youtube", color: "#FF0000", via: "jojapi" },
  { id: "telegram", icon: "telegram", iconDomain: "telegram.org", name: "Telegram", description: "Messages, channels and bots", category: "Communication", kind: "none", url: "https://mcp.jojapi.com/telegram", color: "#26A5E4", via: "jojapi" },
  { id: "x-twitter", icon: "x", iconDomain: "x.com", name: "X (Twitter)", description: "Posts, timelines and search", category: "Social", kind: "none", url: "https://mcp.jojapi.com/twitter", color: "#000000", via: "jojapi" },
  { id: "google-search", iconDomain: "google.com", name: "Google Search", description: "Web results and snippets", category: "Search", kind: "none", url: "https://mcp.jojapi.com/google-search", color: "#4285F4", via: "jojapi" },
  { id: "linkedin", icon: "linkedin", iconDomain: "linkedin.com", name: "LinkedIn", description: "Profiles, posts and pages", category: "Social", kind: "none", url: "https://linkedin.run.mcp.com.ai/mcp", color: "#0A66C2", via: "mcp.com.ai" },
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