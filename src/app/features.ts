import type { Feature } from "./feature";
import { guide } from "./guidePage";
import { chestCalibration } from "../features/chestCalibration/chestCalibrationFeature";
import { refine } from "../features/refine/refineFeature";
import { run } from "../features/run/runFeature";

export const FEATURES: readonly Feature[] = [run, chestCalibration, refine, guide];
