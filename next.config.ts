import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  serverActions: {
    bodySizeLimit: '10MB', // Increased for image uploads (base64 encoded images can be large)
  },
};

export default withNextIntl(nextConfig);
