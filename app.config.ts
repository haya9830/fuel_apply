import type { ExpoConfig } from "expo/config";
import app from "./app.json";

/** GitHub Pages uses /fuel_apply; a normal static host can leave EXPO_BASE_URL empty. */
export default (): ExpoConfig => ({
  ...(app.expo as ExpoConfig),
  extra: {
    ...app.expo.extra,
    google: {
      clientId:
        process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ||
        app.expo.extra.google.clientId,
      apiKey:
        process.env.EXPO_PUBLIC_GOOGLE_API_KEY || app.expo.extra.google.apiKey,
      appId:
        process.env.EXPO_PUBLIC_GOOGLE_APP_ID || app.expo.extra.google.appId,
    },
  },
  experiments: { baseUrl: process.env.EXPO_BASE_URL || "" },
});
