
import { defineConfig } from "@trigger.dev/sdk/v3";
import { ffmpeg } from "@trigger.dev/build/extensions/ffmpeg";

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_ID || "proj_dtmdbscahfzkvinomtbw",
  runtime: "node",
  logLevel: "log",
  
  // CRITICAL: Explicitly define the trigger directory
  dirs: ["./trigger"],
  
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
  
  build: {
    extensions: [
      // FFmpeg extension required for video processing
      ffmpeg(),
    ],
    // Ensure all dependencies are bundled
    external: [],
  },
});
