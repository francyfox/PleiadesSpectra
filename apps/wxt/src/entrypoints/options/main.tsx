import "@repo/ui/styles.css";
import "./style.css";

import { registerHelpData } from "@/components/help/help";
import { mount } from "@/lib/alpine";
import { registerChipLineDirective } from "@/lib/chip-line.directive";
import { registerPluginsPageData } from "@/lib/plugins/plugins-page-data";
import { App } from "./App";

const root = document.querySelector("#app");
if (!root) throw new Error("#app not found");
registerChipLineDirective();
registerHelpData();
registerPluginsPageData();
mount(root, <App />);
