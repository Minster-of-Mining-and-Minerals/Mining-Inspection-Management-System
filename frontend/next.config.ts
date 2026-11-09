// next.config.ts
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

const nextConfig = {
  // Remove deprecated options
  // experimental: {
  //   appDir: true,
  // },
  
  // Remove eslint config
  // eslint: {
  //   ignoreDuringBuilds: true,
  // },
  
  // Remove serverRuntimeConfig
  // serverRuntimeConfig: {},
  
  // Add these instead
  typescript: {
    ignoreBuildErrors: true,
  },
  
  // For Docker deployment
  output: 'standalone', // This is important for Docker

  // The /api proxy below gives up after 30 s by default; inspection photo / video
  // uploads on slow connections need longer (production nginx goes to the backend directly)
  experimental: {
    proxyTimeout: 10 * 60 * 1000,
  },
  
  // Configure images if needed
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/api/auth/:action(session|csrf|providers|callback|signout|signin|_log)', 
        destination: '/api/auth/:action',
      },
      {
        source: '/api/auth/callback/:provider', 
        destination: '/api/auth/callback/:provider',
      },
      {
        source: '/api/:path*',
        // Proxy all other /api routes to the backend
        destination: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:4000/api'}/:path*`,
      },
      {
        // Uploaded files (attachments) are served by the backend. In production nginx
        // routes /uploads before it reaches Next.js; locally this proxy does the same.
        source: '/uploads/:path*',
        destination: `${process.env.BACKEND_INTERNAL_URL || 'http://localhost:4000'}/uploads/:path*`,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
