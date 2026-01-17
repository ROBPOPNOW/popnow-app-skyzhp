
import { defineConfig } from "@trigger.dev/sdk/v3";
import { ffmpeg } from "@trigger.dev/build/extensions/ffmpeg";

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_ID || "proj_dtmdbscahfzkvinomtbw", // Replace with your Trigger.dev project ID
  runtime: "node",
  logLevel: "log",
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
      // CRITICAL: FFmpeg extension required for video processing
      ffmpeg(),
    ],
  },
});
