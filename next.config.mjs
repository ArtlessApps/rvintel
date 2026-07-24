/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  async redirects() {
    return [
      {
        source: "/markets/san-diego",
        destination: "/markets/san-diego-ca",
        permanent: true,
      },
      {
        source: "/markets/riverside-county",
        destination: "/markets/riverside-county-ca",
        permanent: true,
      },
      {
        source: "/reports/san-diego-rv-market-report-q2-2026.pdf",
        destination: "/magnets/san-diego-ca-rate-card.html",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
