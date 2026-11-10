// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // আপনার অন্যান্য কনফিগ যদি থাকে তবে তা এখানেই থাকবে
  
  async rewrites() {
    return [
      {
        source: '/bot-api/:path*',
        // আপনার সার্ভারের এক্সটার্নাল আইপিটি এখানে দিন
        destination: 'http://136.87.183.229:4000/api/:path*', 
      },
    ];
  },


  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  devIndicators: {
    buildActivity: false,
  },
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;