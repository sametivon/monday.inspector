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
        <title>Monday.com Inspector — the tools monday.com is missing</title>
        <meta
          name="description"
          content="A calm, premium Chrome extension for monday.com: import subitems from CSV, bulk-upload Excel images, bulk update items, run GraphQL queries and inspect board schemas. Free, no account, no row limits."
        />
        <link rel="canonical" href="https://mondayinspector.eu/" />
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
