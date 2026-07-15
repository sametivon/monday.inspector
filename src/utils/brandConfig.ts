export const BRAND = {
  name: "Monday.com Inspector",
  author: "Sam",
  authorUrl: "https://www.linkedin.com/in/sametivon/",
  company: "shift-tab lab",
  companyUrl: "https://shift-tab.eu",
  tagline: "an independent software studio",
  website: "https://mondayinspector.eu",
  guidesUrl: "https://mondayinspector.eu/#guides",
  chromeStoreUrl: "https://chromewebstore.google.com/detail/kmmmfnkjdcmemcmjipidodnipidadaeg",
  email: "hello-shift-tab@proton.me",
  contactUrl: "mailto:hello-shift-tab@proton.me",
  // Voluntary, user-initiated feedback → straight to the inbox with a light
  // template. No telemetry, no form service, no infrastructure: the extension
  // stays "no analytics, no data collection" per the store disclosure. To move
  // to a form later, swap this one URL for a Tally/Google Form link.
  feedbackUrl:
    "mailto:hello-shift-tab@proton.me" +
    "?subject=" +
    encodeURIComponent("Monday.com Inspector — feedback") +
    "&body=" +
    encodeURIComponent(
      [
        "What I was doing:",
        "",
        "What worked (or didn't):",
        "",
        "A feature I'd love:",
        "",
        "— sent from Monday.com Inspector",
      ].join("\n")
    ),
  buyMeACoffeeUrl: "https://buymeacoffee.com/sametivon",
} as const;

export const LEAD_STORAGE_KEYS = {
  importCount: "lead_import_count",
  reviewPromptDismissed: "review_prompt_dismissed",
  welcomeDismissed: "welcome_dismissed",
} as const;

export const REVIEW_PROMPT_THRESHOLD = 3;
