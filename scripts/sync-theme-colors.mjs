import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  buildThemeColors,
  renderGeneratedModule,
} from "./theme-colors-lib.mjs";

const root = process.cwd();
const tokenSourcePath = resolve(root, "app/tokens.css");
const generatedPath = resolve(root, "lib/generated/theme-colors.ts");

const css = await readFile(tokenSourcePath, "utf8");
const expected = renderGeneratedModule(buildThemeColors(css));
const checkOnly = process.argv.includes("--check");

let current = "";
try {
  current = await readFile(generatedPath, "utf8");
} catch (error) {
  if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
    throw error;
  }
}

if (checkOnly) {
  if (current !== expected) {
    throw new Error(
      "Generated theme colors are stale. Run `pnpm theme:sync` and commit the result.",
    );
  }
  console.log("Generated theme colors match app/tokens.css.");
} else if (current !== expected) {
  await mkdir(dirname(generatedPath), { recursive: true });
  await writeFile(generatedPath, expected, "utf8");
  console.log("Synchronized generated theme colors from app/tokens.css.");
} else {
  console.log("Generated theme colors are already synchronized.");
}
