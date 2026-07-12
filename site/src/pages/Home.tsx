import { Head } from "vite-react-ssg";
import Hero from "@/components/Hero";
import Features from "@/sections/Features";

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
      <Features />
    </>
  );
}
