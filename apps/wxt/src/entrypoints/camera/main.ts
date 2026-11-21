import { runCameraPage } from "@/lib/camera/camera-page";

/** Firefox has no offscreen documents: the same capture page runs in a background tab. */
runCameraPage();
