import type { Feature } from "./feature";
import { chestCalibration } from "../features/chestCalibration/chestCalibrationFeature";
import { refine } from "../features/refine/refineFeature";
import { repeat } from "../features/repeat/repeatFeature";
import { runePlanner } from "../features/runePlanner/runePlannerFeature";
import { seedFinder } from "../features/seedFinder/seedFinderFeature";

export const FEATURES: readonly Feature[] = [seedFinder, chestCalibration, runePlanner, refine, repeat];
