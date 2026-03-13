import { createRoot } from "react-dom/client";
import "../globals.css";
import "./styles.css";
import { Panel } from "./Panel";

const root = createRoot(document.getElementById("root")!);
root.render(<Panel />);
