// @lovable.dev/vite-tanstack-config already includes the TanStack Start,
// React, Tailwind, path-alias, and Nitro integration used by this project.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Lovable's sandbox uses its own Cloudflare-oriented preview target. Vercel
// needs Nitro's Vercel preset so TanStack Start SSR routes are emitted in a
// Vercel-compatible server bundle.
const isVercel = Boolean(process.env.VERCEL);

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  nitro: isVercel ? { preset: "vercel" } : undefined,
});
