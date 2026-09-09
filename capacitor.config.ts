import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.findit.ai",
  appName: "FindIt AI",
  webDir: ".output/public",
  server: {
    // Point to your active host machine IP on port 8000 for mobile device / emulator access
    url: "http://10.30.234.158:8000",
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
  },
};

export default config;
