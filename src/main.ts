import { FEATURES } from "./app/features";
import { PlayerProgress } from "./app/progress";
import { mountShell } from "./app/shell";
import "./style.css";

mountShell(document.querySelector("#app")!, FEATURES, new PlayerProgress());
