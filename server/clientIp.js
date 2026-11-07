import { isIP } from 'node:net';
import { ipKeyGenerator } from 'express-rate-limit';

// onhacks.ca reaches Render through Cloudflare (Render's own edge is Cloudflare too), so
// request.ip is a Cloudflare address shared by many unrelated visitors. Cloudflare sets
// CF-Connecting-IP to the real visitor address and overwrites any value a client sends,
// so per-network rate limits key on it when present and fall back to request.ip locally.
export function clientIp(request) {
  const header = request.get('cf-connecting-ip')?.trim();
  return header && isIP(header) ? header : request.ip;
}

export const clientIpKey = (request) => ipKeyGenerator(clientIp(request));
