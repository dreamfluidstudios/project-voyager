import path from "node:path";

export type ServerConfiguration = {
  dataDirectory: string;
  expectedProjectId?: string;
};

type ResolveServerConfigurationOptions = {
  args?: string[];
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  defaultDataDirectory: string;
};

export function resolveServerConfiguration({
  args = process.argv.slice(2),
  env = process.env,
  cwd = process.cwd(),
  defaultDataDirectory,
}: ResolveServerConfigurationOptions): ServerConfiguration {
  let commandLineDataDirectory: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--data-dir") {
      const value = args[index + 1]?.trim();
      if (value === undefined || value.length === 0) {
        throw new Error("--data-dir requires a non-blank path.");
      }
      commandLineDataDirectory = value;
      index += 1;
      continue;
    }
    if (argument?.startsWith("--data-dir=")) {
      const value = argument.slice("--data-dir=".length).trim();
      if (value.length === 0) {
        throw new Error("--data-dir requires a non-blank path.");
      }
      commandLineDataDirectory = value;
      continue;
    }
    throw new Error(`Unknown Project Voyager argument: ${argument}`);
  }

  const environmentDataDirectory = nonBlank(env.VOYAGER_DATA_DIR);
  const configuredDataDirectory =
    commandLineDataDirectory ?? environmentDataDirectory;
  const dataDirectory =
    configuredDataDirectory === undefined
      ? path.resolve(defaultDataDirectory)
      : path.resolve(cwd, configuredDataDirectory);

  return {
    dataDirectory,
    expectedProjectId: nonBlank(env.VOYAGER_PROJECT_ID),
  };
}

function nonBlank(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}
