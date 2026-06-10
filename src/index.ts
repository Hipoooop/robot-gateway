/**
 * OpenClaw Wildfire IM Channel Plugin (Multi-Account)
 */

import { WildfireChannelPlugin } from "./channel.js";
import { startClient, stopClient, isClientConnected } from "./clients.js";
import {
  listEnabledAccountConfigs,
  validateConfig,
} from "./config.js";

export default function register(api: any): void {
  // Register channel
  api.registerChannel({ plugin: WildfireChannelPlugin });

  // Register service for lifecycle management
  api.registerService({
    id: "wildfire",
    start: async () => {
      if (isClientConnected()) {
        api.logger?.info?.("[wildfire] service already started");
        return;
      }

      const accounts = listEnabledAccountConfigs(api);
      if (accounts.length === 0) {
        api.logger?.warn?.("[wildfire] plugin disabled or no config");
        return;
      }

      api.logger?.info?.(
        `[wildfire] starting ${accounts.length} account(s): ${accounts.map((a) => a.id).join(", ")}`,
      );

      const errors: string[] = [];

      for (const { id, config } of accounts) {
        const error = validateConfig(config);
        if (error) {
          api.logger?.error?.(
            `[wildfire:${id}] invalid config: ${error}`,
          );
          errors.push(`${id}: ${error}`);
          continue;
        }

        try {
          await startClient(api, config, id);
          api.logger?.info?.(`[wildfire:${id}] service started`);
        } catch (err: any) {
          api.logger?.error?.(
            `[wildfire:${id}] failed to start: ${err.message}`,
          );
          errors.push(`${id}: ${err.message}`);
        }
      }

      if (errors.length > 0 && !isClientConnected()) {
        throw new Error(
          `Wildfire startup errors: ${errors.join("; ")}`,
        );
      }
    },
    stop: async () => {
      await stopClient(api);
      api.logger?.info?.("[wildfire] service stopped");
    },
  });

  api.logger?.info?.("[wildfire] plugin loaded");
}
