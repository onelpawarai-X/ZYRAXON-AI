// Copyright (c) 2026 onelpawarai. All rights reserved.

/**
 * ZYRAXON's own icon set.
 *
 * The stock icons came across as thin outlined glyphs that all read the same at
 * rail size, so navigation had no silhouette to anchor on. These are drawn on a
 * 20x20 grid with a 1.5 stroke, round joins and a filled inner shape, which
 * keeps them legible at 16px and gives each destination a shape you can tell
 * apart before you read the label.
 */

const stroke = "stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\""
const solid = "fill=\"currentColor\""

export const ZY_ICONS = {
  /** Brand mark: a layered prism that reads as "many models, one surface". */
  "zy-mark": `<path d="M10 1.75 18 6v8l-8 4.25L2 14V6l8-4.25Z" ${stroke} stroke-width="1.3" opacity=".45"/><path d="m10 5.5 4.5 2.4v4.2L10 14.5l-4.5-2.4V7.9L10 5.5Z" ${solid} opacity=".9"/><path d="M10 5.5v9M5.5 7.9 10 10.3l4.5-2.4" ${stroke} stroke-width="1.1" opacity=".55"/>`,

  /** Projects — a stack of layers with the top one pulled forward. */
  "zy-projects": `<path d="M3.5 6.4 10 3.3l6.5 3.1L10 9.5 3.5 6.4Z" ${stroke} stroke-width="1.4"/><path d="m3.5 10.1 6.5 3.1 6.5-3.1" ${stroke} stroke-width="1.4" opacity=".55"/><path d="m3.5 13.6 6.5 3.1 6.5-3.1" ${stroke} stroke-width="1.4" opacity=".3"/>`,

  /** Local repositories — a git fork drawn as two lanes that merge. */
  "zy-repositories": `<circle cx="6" cy="5.5" r="2.1" ${solid}/><circle cx="6" cy="14.5" r="2.1" ${solid}/><circle cx="14" cy="5.5" r="2.1" ${solid} opacity=".55"/><path d="M6 7.6v4.8M14 7.6c0 3-1.6 3.6-3.5 4.1" ${stroke} stroke-width="1.4"/>`,

  /** MCP — two interlocking links, the integration surface. */
  "zy-mcp": `<path d="M8.2 11.8a3.4 3.4 0 0 1 0-4.8l2-2a3.4 3.4 0 0 1 4.8 4.8l-1 1" ${stroke} stroke-width="1.5"/><path d="M11.8 8.2a3.4 3.4 0 0 1 0 4.8l-2 2a3.4 3.4 0 0 1-4.8-4.8l1-1" ${stroke} stroke-width="1.5"/>`,

  /** Settings — stacked faders rather than a gear; reads faster than cogs. */
  "zy-settings": `<path d="M2.75 6h14.5M2.75 14h14.5" ${stroke} stroke-width="1.5"/><circle cx="7" cy="6" r="2.15" ${solid}/><circle cx="13" cy="14" r="2.15" ${solid}/>`,

  /** Language — a globe with meridian and equator. */
  "zy-language": `<circle cx="10" cy="10" r="7.1" ${stroke} stroke-width="1.4"/><path d="M2.9 10h14.2" ${stroke} stroke-width="1.2"/><path d="M10 2.9c2 2.1 3 4.5 3 7.1s-1 5-3 7.1c-2-2.1-3-4.5-3-7.1s1-5 3-7.1Z" ${stroke} stroke-width="1.2" opacity=".7"/>`,

  /** Appearance — half-filled disc, the universal contrast symbol. */
  "zy-appearance": `<circle cx="10" cy="10" r="7.1" ${stroke} stroke-width="1.4"/><path d="M10 2.9a7.1 7.1 0 0 1 0 14.2V2.9Z" ${solid} opacity=".85"/>`,

  /** Notifications — a bell with a single clapper stroke. */
  "zy-notifications": `<path d="M5.6 8.4a4.4 4.4 0 0 1 8.8 0c0 3.2.9 4.6 1.7 5.4.3.3 0 .8-.4.8H4.3c-.4 0-.7-.5-.4-.8.8-.8 1.7-2.2 1.7-5.4Z" ${stroke} stroke-width="1.4"/><path d="M8.3 17a1.9 1.9 0 0 0 3.4 0" ${stroke} stroke-width="1.4"/>`,

  /** Shortcuts — a keyboard key cap seen at an angle. */
  "zy-shortcuts": `<rect x="2.4" y="5.4" width="15.2" height="9.2" rx="1.6" ${stroke} stroke-width="1.4"/><path d="M5.6 8.6h.01M8.1 8.6h.01M10.6 8.6h.01M13.1 8.6h.01M6.4 11.4h7.2" ${stroke} stroke-width="1.6"/>`,

  /** Models — a chip with pins on all four sides. */
  "zy-models": `<rect x="5.1" y="5.1" width="9.8" height="9.8" rx="1.5" ${stroke} stroke-width="1.4"/><rect x="7.8" y="7.8" width="4.4" height="4.4" rx=".9" ${solid} opacity=".85"/><path d="M8 2.6v2.5M12 2.6v2.5M8 14.9v2.5M12 14.9v2.5M2.6 8h2.5M2.6 12h2.5M14.9 8h2.5M14.9 12h2.5" ${stroke} stroke-width="1.3"/>`,

  /** Providers — a plug with two prongs. */
  "zy-providers": `<path d="M6.4 2.6v4.1M13.6 2.6v4.1" ${stroke} stroke-width="1.5"/><path d="M4.1 6.7h11.8v2.6a5.9 5.9 0 0 1-11.8 0V6.7Z" ${stroke} stroke-width="1.4"/><path d="M10 15.2v2.2" ${stroke} stroke-width="1.5"/>`,

  /** Servers — three stacked blades with a status dot. */
  "zy-servers": `<rect x="2.6" y="3.1" width="14.8" height="4.4" rx="1.2" ${stroke} stroke-width="1.35"/><rect x="2.6" y="8.8" width="14.8" height="4.4" rx="1.2" ${stroke} stroke-width="1.35"/><rect x="2.6" y="14.5" width="14.8" height="2.4" rx="1.1" ${stroke} stroke-width="1.35" opacity=".5"/><circle cx="5.7" cy="5.3" r=".95" ${solid}/><circle cx="5.7" cy="11" r=".95" ${solid}/>`,

  /** Plugins — three studs that snap into a base. */
  "zy-plugins": `<path d="M6.2 2.4v3.1M13.8 2.4v3.1M10 2.4v3.1" ${stroke} stroke-width="1.5"/><rect x="2.5" y="5.5" width="15" height="5" rx="1.4" ${stroke} stroke-width="1.4"/><rect x="2.5" y="12.2" width="15" height="5.4" rx="1.4" ${solid} opacity=".9"/>`,

  /** Subscription — a faceted gem that reads as premium without a crown. */
  "zy-subscription": `<path d="m10 2.2 6.4 3.4-2.4 8.6H6L3.6 5.6 10 2.2Z" ${stroke} stroke-width="1.35"/><path d="M3.6 5.6h12.8M10 2.2 7.6 14.2M10 2.2l2.4 12" ${stroke} stroke-width="1.1" opacity=".55"/>`,

  /** About — an information disc. */
  "zy-about": `<circle cx="10" cy="10" r="7.2" ${stroke} stroke-width="1.4"/><circle cx="10" cy="6.9" r="1.15" ${solid}/><path d="M10 10.1v4" ${stroke} stroke-width="1.6"/>`,

  /** Help — a lifebuoy, distinct from About's information disc. */
  "zy-help": `<circle cx="10" cy="10" r="7.2" ${stroke} stroke-width="1.4"/><circle cx="10" cy="10" r="2.9" ${stroke} stroke-width="1.4"/><path d="m4.7 4.7 3.1 3.1M12.2 12.2l3.1 3.1M15.3 4.7l-3.1 3.1M7.8 12.2l-3.1 3.1" ${stroke} stroke-width="1.35"/>`,

  /** Sessions — stacked chat bubbles, newest in front. */
  "zy-sessions": `<path d="M3 4.4h11.2v7.3H7.6L4.2 14.6v-2.9H3V4.4Z" ${stroke} stroke-width="1.35" opacity=".55"/><path d="M6.2 7.9h10.8v6.6a1 1 0 0 1-1 1h-3.1v2.6l-3-2.6H7.2a1 1 0 0 1-1-1V7.9Z" ${solid} opacity=".92"/>`,

  /** Terminal — a prompt chevron with a caret. */
  "zy-terminal": `<rect x="2.2" y="3.4" width="15.6" height="13.2" rx="2" ${stroke} stroke-width="1.35"/><path d="m5.9 8.1 2.4 1.9-2.4 1.9M10.6 12.1h3.4" ${stroke} stroke-width="1.5"/>`,

  /** Review — a document with a check, for the diff pane. */
  "zy-review": `<path d="M12.6 2.6H4.6v14.8h10.8V5.4l-2.8-2.8Z" ${stroke} stroke-width="1.35"/><path d="m7.3 10.5 1.9 1.9 3.7-4" ${stroke} stroke-width="1.6"/>`,

  /** Files — a page with a folded corner. */
  "zy-files": `<path d="M12.4 2.6H4.8v14.8h10.4V5.2l-2.8-2.6Z" ${stroke} stroke-width="1.35"/><path d="M12.2 2.7v2.7h2.8" ${stroke} stroke-width="1.1" opacity=".55"/><path d="M7.5 9.6h5M7.5 12.5h5" ${stroke} stroke-width="1.3" opacity=".6"/>`,

  /** Status — three signal bars, the health indicator. */
  "zy-status": `<path d="M3.4 15.1v2.3M8 11.6v5.8M12.6 8.1v9.3M17.2 4.6v12.8" ${stroke} stroke-width="1.9"/>`,

  /** Search — a magnifier with a handle and a small inner arc. */
  "zy-search": `<circle cx="8.9" cy="8.9" r="5.4" ${stroke} stroke-width="1.5"/><path d="m12.9 12.9 3.7 3.7" ${stroke} stroke-width="1.8"/>`,

  /** Ecosystem — three nodes joined in a triangle. */
  "zy-ecosystem": `<circle cx="10" cy="4.4" r="2.3" ${solid}/><circle cx="4.4" cy="14.6" r="2.3" ${solid} opacity=".75"/><circle cx="15.6" cy="14.6" r="2.3" ${solid} opacity=".75"/><path d="m8.9 6.4-3.5 6.2M11.1 6.4l3.5 6.2M6.8 14.6h6.4" ${stroke} stroke-width="1.3"/>`,

  /** Voice — a wavefront leaving a speaker. */
  "zy-voice": `<path d="M3.2 7.6h2.7l3.4-2.8v10.4L5.9 12.4H3.2V7.6Z" ${solid}/><path d="M12.1 7.2a4.4 4.4 0 0 1 0 5.6M14.6 4.9a7.6 7.6 0 0 1 0 10.2" ${stroke} stroke-width="1.4"/>`,

  /** Code — a chevron pair inside a rounded frame, for language servers. */
  "zy-code": `<rect x="2.2" y="3.4" width="15.6" height="13.2" rx="2.4" ${stroke} stroke-width="1.35" opacity=".55"/><path d="m7.4 8.3-2.2 1.8 2.2 1.8M12.6 8.3l2.2 1.8-2.2 1.8" ${stroke} stroke-width="1.55"/>`,

  /** Add — a plus in a rounded frame. */
  "zy-add": `<rect x="2.6" y="2.6" width="14.8" height="14.8" rx="3.4" ${stroke} stroke-width="1.4" opacity=".5"/><path d="M10 6.3v7.4M6.3 10h7.4" ${stroke} stroke-width="1.7"/>`,
} as const

export type ZyIconName = keyof typeof ZY_ICONS