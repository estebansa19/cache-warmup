import type { IncomingMessage, ServerResponse } from "node:http";

export type Preference = { provider: string; model: string };

export function createBridge(options?: {
  override?: Preference | null;
  extraOrigins?: string[];
  log?: boolean;
}): Promise<{
  handle(req: IncomingMessage, res: ServerResponse): Promise<void>;
  status(): Promise<unknown>;
  describe(): {
    active: { id: string; label: string; usage: string } | null;
    preference: Preference;
    locked: boolean;
  };
}>;
