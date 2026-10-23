// /api/game/<action>: every game action in one function (api/_lib/game-api.ts lists them).
import { defaultDeps, handleGame } from '../_lib/game-api.js';

const action = (req: Request) => new URL(req.url).pathname.split('/').filter(Boolean).pop() ?? '';

export async function GET(req: Request): Promise<Response> {
  return handleGame(req, action(req), await defaultDeps());
}

export async function POST(req: Request): Promise<Response> {
  return handleGame(req, action(req), await defaultDeps());
}
