import { createRoot } from "react-dom/client";
import "../globals.css";
import { Popup } from "./Popup";

const root = createRoot(document.getElementById("root")!);
root.render(<Popup />);
