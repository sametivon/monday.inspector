import type { RouteRecord } from "vite-react-ssg";
import Layout from "@/components/Layout";
import Home from "@/pages/Home";
import Changelog from "@/pages/Changelog";
import Privacy from "@/pages/Privacy";
import NotFound from "@/pages/NotFound";

/* Route paths deliberately carry the ".html" suffix: the previous static
   site's indexed URLs are /changelog.html etc., GitHub Pages serves flat
   files, and the client-side router must match the exact browser URL after
   hydration (a bare "changelog" path would fall through to the 404 route). */
export const routes: RouteRecord[] = [
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      // Same page, explicit-file URL: GH Pages serves /index.html directly
      // and the client router must match that URL too, not fall to 404.
      { path: "index.html", element: <Home /> },
      { path: "changelog.html", element: <Changelog /> },
      { path: "privacy.html", element: <Privacy /> },
      { path: "404.html", element: <NotFound /> },
      { path: "*", element: <NotFound /> },
    ],
  },
];

export default routes;
