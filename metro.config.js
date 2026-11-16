// Learn more https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// expo-sqlite на веб использует сборку SQLite в WebAssembly.
config.resolver.assetExts.push('wasm');

// SharedArrayBuffer (нужен wa-sqlite/OPFS) доступен только в
// «cross-origin isolated» окружении — добавляем заголовки в dev-сервер.
config.server.enhanceMiddleware = (middleware) => {
  return (req, res, next) => {
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    middleware(req, res, next);
  };
};

module.exports = config;
