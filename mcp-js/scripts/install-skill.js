import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = join(root, "skills", "pa-price-action");
const codexHome = process.env.CODEX_HOME || join(homedir(), ".codex");
const target = join(codexHome, "skills", "pa-price-action");

if (!existsSync(source)) {
  throw new Error(`Skill source not found: ${source}`);
}

mkdirSync(dirname(target), { recursive: true });
if (existsSync(target)) rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });

console.log(`Installed pa-price-action skill to ${target}`);
