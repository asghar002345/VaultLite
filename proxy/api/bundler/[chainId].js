// Vercel Function: POST /api/bundler/:chainId
import { handle } from '../../lib/handler.js';
const chainOf = (req) => new URL(req.url).pathname.split('/').filter(Boolean).pop();
export const POST = (req) => handle(req, chainOf(req));
export const OPTIONS = (req) => handle(req, chainOf(req));
export const GET = (req) => handle(req, chainOf(req));
