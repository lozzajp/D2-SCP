import type { Feature } from "./feature";
import { guide } from "./guidePage";
import { chestCalibration } from "../features/chestCalibration/chestCalibrationFeature";
import { refine } from "../features/refine/refineFeature";
import { run } from "../features/run/runFeature";
import { runePicks } from "../features/runePicks/runePicksFeature";

export const FEATURES: readonly Feature[] = [run, chestCalibration, refine, runePicks, guide];
