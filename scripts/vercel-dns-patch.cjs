const dns = require("node:dns");

const VERCEL_IP = "76.76.21.21";
const originalLookup = dns.lookup.bind(dns);

dns.lookup = function patchedLookup(hostname, options, callback) {
  if (String(hostname).toLowerCase() === "vercel.com") {
    if (typeof options === "function") {
      return process.nextTick(options, null, VERCEL_IP, 4);
    }
    if (options && options.all) {
      return process.nextTick(callback, null, [{ address: VERCEL_IP, family: 4 }]);
    }
    return process.nextTick(callback, null, VERCEL_IP, 4);
  }
  return originalLookup(hostname, options, callback);
};
