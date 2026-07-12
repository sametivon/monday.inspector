import { Outlet } from "react-router-dom";
import AmbientBackground from "@/three/AmbientBackground";
import SmoothScroll from "@/components/SmoothScroll";
import Nav from "@/components/Nav";
import Footer from "@/sections/Footer";

export default function Layout() {
  return (
    <>
      <AmbientBackground />
      <SmoothScroll />
      <Nav />
      <main className="relative z-10">
        <Outlet />
      </main>
      <Footer />
    </>
  );
}
