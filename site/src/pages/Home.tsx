import { Head } from "vite-react-ssg";
import Hero from "@/components/Hero";
import ProductDemo from "@/sections/ProductDemo";
import Features from "@/sections/Features";
import HowItWorks from "@/sections/HowItWorks";
import Compare from "@/sections/Compare";
import Credibility from "@/sections/Credibility";
import Guides from "@/sections/Guides";
import FAQ from "@/sections/FAQ";

export default function Home() {
  return (
    <>
      <Head>
        <title>Monday.com Inspector — Import Subitems, Bulk Upload Excel Images, GraphQL Query | Free Chrome Extension</title>
        <meta
          name="description"
          content="The free Chrome extension that unlocks everything monday.com is missing: import subitems from CSV, bulk-upload images from Excel into File columns, bulk update hundreds of items, run GraphQL queries. No row limits, no account needed."
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
            softwareVersion: "1.6.4",
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            author: {
              "@type": "Organization",
              name: "Fruition Services",
              url: "https://mondayinspector.eu",
            },
            url: "https://mondayinspector.eu",
            installUrl:
              "https://chromewebstore.google.com/detail/kmmmfnkjdcmemcmjipidodnipidadaeg",
          })}
        </script>
      </Head>
      <Hero />
      <ProductDemo />
      <Features />
      <HowItWorks />
      <Compare />
      <Credibility />
      <Guides />
      <FAQ />
    </>
  );
}
