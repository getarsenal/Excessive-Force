import { CapacitorConfig } from '@capacitor/cli';

// The App Store build: the same Vite output GitHub Pages serves, wrapped in a
// WKWebView. `dist` is what `npx vite build` writes; Codemagic builds it and
// then `cap sync ios` copies it into the native project (ios/App/App/public,
// generated, not committed).
const config: CapacitorConfig = {
  appId: 'com.scheidelholdings.excessiveforce',
  appName: 'Excessive Force',
  webDir: 'dist',
  ios: {
    // The page is a canvas with its own HUD anchored to the safe-area insets
    // (viewport-fit=cover): no inset from the system, no bounce, a dark
    // backdrop while the first frame loads.
    contentInset: 'never',
    scrollEnabled: false,
    backgroundColor: '#0b0d10',
    allowsLinkPreview: false,
    preferredContentMode: 'mobile',
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
