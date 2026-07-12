import { Head } from "vite-react-ssg";
import MagneticButton from "@/components/MagneticButton";

export default function NotFound() {
  return (
    <>
      <Head>
        <title>Page not found — Monday.com Inspector</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
        <div
          className="font-display text-[clamp(4rem,14vw,9rem)] font-extrabold leading-none tracking-tightest"
          style={{
            background: "linear-gradient(135deg,#3E7BFA,#6161FF,#8A63FF)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          404
        </div>
        <h1 className="mt-4 font-display text-[1.5rem] font-bold text-ink">This page took a wrong turn.</h1>
        <p className="mt-3 max-w-sm text-[15px] text-muted">
          The page you're looking for isn't here. Let's get you back to something useful.
        </p>
        <div className="mt-8">
          <MagneticButton href="/">Back home →</MagneticButton>
        </div>
      </div>
    </>
  );
}
