// Copyright (c) 2026 onelpawarai. All rights reserved.

const stage = process.env.SST_STAGE || "dev"

export default {
  url: stage === "production" ? "https://zyraxonai.lovable.app" : `https://${stage}.zyraxonai.lovable.app`,
  console: stage === "production" ? "https://zyraxonai.lovable.app/auth" : `https://${stage}.zyraxonai.lovable.app/auth`,
  email: "help@anoma.ly",
  socialCard: "https://social-cards.sst.dev",
  github: "https://github.com/onelpawarai/ZYRAXON-AI",
  discord: "https://discord.gg/GP8yX33NA",
  headerLinks: [
    { name: "app.header.home", url: "/" },
    { name: "app.header.docs", url: "/docs/" },
  ],
}
