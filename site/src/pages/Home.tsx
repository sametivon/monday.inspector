import { Head } from "vite-react-ssg";
import Hero from "@/components/Hero";
import ProblemSolution from "@/sections/ProblemSolution";
import ProductDemo from "@/sections/ProductDemo";
import Features from "@/sections/Features";
import HowItWorks from "@/sections/HowItWorks";
import Workflows from "@/sections/Workflows";
import Compare from "@/sections/Compare";
import Credibility from "@/sections/Credibility";
import Pricing from "@/sections/Pricing";
import Guides from "@/sections/Guides";
import FAQ from "@/sections/FAQ";

export default function Home() {
  return (
    <>
      <Head>
        <title>Monday.com Inspector — Import Subitems, Bulk Upload Excel Images, GraphQL Query | Free Chrome Extension</title>
        <meta
          name="description"
          content="The DevTools for monday.com — a free Chrome extension to inspect board schemas, run GraphQL queries, import subitems from CSV, bulk-upload Excel images and bulk-update hundreds of items. No row limits, no account needed."
        />
        <link rel="canonical" href="https://mondayinspector.eu/" />
        <meta property="og:title" content="Monday.com Inspector — The Power Toolkit for monday.com" />
        <meta property="og:description" content="Import subitems from CSV, bulk update items, run GraphQL queries — free Chrome extension, no account needed." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://mondayinspector.eu/" />
        <meta property="og:image" content="https://mondayinspector.eu/og-image.png" />
        <meta property="og:site_name" content="Monday.com Inspector" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Monday.com Inspector — The Power Toolkit for monday.com" />
        <meta name="twitter:description" content="Import subitems from CSV, bulk update items, run GraphQL queries — free Chrome extension, no account needed." />
        <meta name="twitter:image" content="https://mondayinspector.eu/og-image.png" />
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "Monday.com Inspector",
            description:
              "Free Chrome extension for monday.com: import subitems from CSV, bulk-upload images from Excel into File columns, bulk update items, run GraphQL queries, inspect board schemas.",
            applicationCategory: "BrowserExtension",
            operatingSystem: "Chrome",
            softwareVersion: "1.6.5",
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            author: {
              "@type": "Organization",
              name: "shift-tab lab",
              url: "https://shift-tab.eu",
            },
            url: "https://mondayinspector.eu",
            installUrl:
              "https://chromewebstore.google.com/detail/kmmmfnkjdcmemcmjipidodnipidadaeg",
          })}
        </script>
      </Head>
      <Hero />
      <ProblemSolution />
      <ProductDemo />
      <Features />
      <HowItWorks />
      <Workflows />
      <Compare />
      <Credibility />
      <Pricing />
      <Guides />
      <FAQ />
    </>
  );
}
