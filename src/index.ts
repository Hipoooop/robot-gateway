/**
 * OpenClaw Wildfire IM Channel Plugin
 */

import { WildfireChannelPlugin } from "./channel.js";
import { startClient, stopClient, isClientConnected } from "./clients.js";
import { getAccountConfig, validateConfig } from "./config.js";

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

      const config = getAccountConfig(api);
      if (!config) {
        api.logger?.warn?.("[wildfire] plugin disabled or no config");
        return;
      }

      // Validate config
      const error = validateConfig(config);
      if (error) {
        api.logger?.error?.(`[wildfire] invalid config: ${error}`);
        throw new Error(`Wildfire config error: ${error}`);
      }

      try {
        await startClient(api, config);
        api.logger?.info?.("[wildfire] service started");
      } catch (err) {
        api.logger?.error?.("[wildfire] failed to start:", err);
        throw err;
      }
    },
    stop: async () => {
      await stopClient(api);
      api.logger?.info?.("[wildfire] service stopped");
    },
  });

  api.logger?.info?.("[wildfire] plugin loaded");
}
