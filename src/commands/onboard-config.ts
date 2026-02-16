import type { OpenClawConfig } from "../config/config.js";
import { shortenHomePath } from "../utils.js";

export function applyOnboardingLocalWorkspaceConfig(
  baseConfig: OpenClawConfig,
  workspaceDir: string,
): OpenClawConfig {
  // Store workspace path with tilde notation for portability across users and OSes
  const workspaceForConfig = shortenHomePath(workspaceDir);

  return {
    ...baseConfig,
    agents: {
      ...baseConfig.agents,
      defaults: {
        ...baseConfig.agents?.defaults,
        workspace: workspaceForConfig,
      },
    },
    gateway: {
      ...baseConfig.gateway,
      mode: "local",
    },
  };
}
