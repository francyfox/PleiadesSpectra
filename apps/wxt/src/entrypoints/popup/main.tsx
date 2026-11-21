import "@repo/ui/styles.css";
import "./style.css";

import { mount } from "@/lib/alpine";
import { registerPopupData } from "@/lib/popup-data";
import { App } from "./App";

const root = document.querySelector("#app");
if (!root) throw new Error("#app not found");
registerPopupData();
mount(root, <App />);
