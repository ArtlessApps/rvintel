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
    ];
  },
};

export default nextConfig;
