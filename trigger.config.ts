
import { defineConfig } from "@trigger.dev/sdk/v3";

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_ID || "proj_dtmdbscahfzkvinomtbw",
  runtime: "node",
  logLevel: "log",
  
  // CRITICAL: maxDuration is now required (minimum 5 seconds)
  // For video moderation (extracting frames, AWS checks), set to 5 minutes
  maxDuration: 300, // 300 seconds = 5 minutes
  
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
    // FFmpeg extension is not available in Trigger.dev v3 (4.3.x)
    // FFmpeg will be available in the deployment environment by default
    // or can be installed via system packages
    extensions: [],
    
    // Ensure all dependencies are bundled
    external: [],
  },
});
