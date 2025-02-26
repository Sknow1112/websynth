/** @type {import('next').NextConfig} */
const nextConfig = {
    basePath: "/websynth",
    assetPrefix: "/websynth/",
    output: "standalone",
    webpack: (config) => {
        config.resolve.fallback = {
            ...config.resolve.fallback,
            fs: false,
            path: false,
            os: false,
        };
        return config;
    },
};

module.exports = nextConfig;
