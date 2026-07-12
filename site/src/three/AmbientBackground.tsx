import { lazy, Suspense } from "react";
import { ClientOnly } from "vite-react-ssg";

/* Lazy, client-only WebGL layer. The R3F/three chunk never enters the SSG
   (Node) bundle, so prerendering stays fast and free of browser-only imports.
   A CSS mesh gradient paints instantly underneath as the SSR-safe fallback. */
const AmbientCanvas = lazy(() => import("./AmbientCanvas"));

export default function AmbientBackground() {
  return (
    <div
      aria-hidden
      className="fixed inset-0 -z-10"
      style={{
        background:
          "radial-gradient(60% 50% at 22% 20%, #E7F1FF 0%, transparent 60%)," +
          "radial-gradient(50% 45% at 82% 26%, #F3EEFF 0%, transparent 60%)," +
          "radial-gradient(55% 50% at 60% 96%, #EAF8F2 0%, transparent 60%), #FAFBFC",
      }}
    >
      <ClientOnly>
        {() => (
          <Suspense fallback={null}>
            <AmbientCanvas />
          </Suspense>
        )}
      </ClientOnly>
    </div>
  );
}
