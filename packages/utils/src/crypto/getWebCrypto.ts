export const getWebCrypto = (operation: string): Crypto => {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle) {
    throw new Error(`Web Crypto API is required for ${operation}`);
  }
  return cryptoApi;
};
