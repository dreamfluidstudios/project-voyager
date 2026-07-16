import path from "node:path";

import { describe, expect, it } from "vitest";

import { resolveServerConfiguration } from "../apps/server/src/config.js";

const cwd = path.resolve("temporary-workspace");
const defaultDataDirectory = path.resolve("repository-data");

describe("resolveServerConfiguration", () => {
  it("uses the repository data directory by default", () => {
    expect(
      resolveServerConfiguration({
        args: [],
        env: {},
        cwd,
        defaultDataDirectory,
      }),
    ).toEqual({ dataDirectory: defaultDataDirectory });
  });

  it("supports environment-based project-scoped storage", () => {
    expect(
      resolveServerConfiguration({
        args: [],
        env: {
          VOYAGER_DATA_DIR: ".voyager/data",
          VOYAGER_PROJECT_ID: "  sample-project  ",
        },
        cwd,
        defaultDataDirectory,
      }),
    ).toEqual({
      dataDirectory: path.resolve(cwd, ".voyager/data"),
      expectedProjectId: "sample-project",
    });
  });

  it("lets --data-dir override the environment", () => {
    const configuration = resolveServerConfiguration({
      args: ["--data-dir", "cli-data"],
      env: { VOYAGER_DATA_DIR: "environment-data" },
      cwd,
      defaultDataDirectory,
    });

    expect(configuration.dataDirectory).toBe(path.resolve(cwd, "cli-data"));
  });

  it("rejects unknown or incomplete command-line arguments", () => {
    expect(() =>
      resolveServerConfiguration({
        args: ["--unknown"],
        env: {},
        cwd,
        defaultDataDirectory,
      }),
    ).toThrow(/Unknown Project Voyager argument/);
    expect(() =>
      resolveServerConfiguration({
        args: ["--data-dir"],
        env: {},
        cwd,
        defaultDataDirectory,
      }),
    ).toThrow(/requires a non-blank path/);
  });
});
