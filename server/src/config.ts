import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve monorepo root regardless of whether running from src/ or dist/
export const SERVER_DIR = path.resolve(__dirname, '..');
export const ROOT_DIR = path.resolve(SERVER_DIR, '..');

// Load local .env from repo root (secrets stay server-local and are NEVER added to AI prompts)
dotenv.config({ path: path.join(ROOT_DIR, '.env') });

export const AGENTS_DIR = path.join(ROOT_DIR, 'agents');
export const REGISTRY_PATH = path.join(AGENTS_DIR, 'registry.json');
export const PROMPTS_DIR = path.join(AGENTS_DIR, 'prompts');
export const PLAYBOOK_DIR = path.join(ROOT_DIR, 'playbook');
export const CATALOG_DIR = path.join(ROOT_DIR, 'catalog');
export const CATALOG_INDEX_PATH = path.join(CATALOG_DIR, 'index.json');
export const WORKSPACE_DIR = path.join(ROOT_DIR, 'workspace');
export const DATA_DIR = path.join(ROOT_DIR, 'data');
export const DB_PATH = path.join(DATA_DIR, 'roforge.sqlite');
export const ENV_PATH = path.join(ROOT_DIR, '.env');
export const GEMINI_SETTINGS_PATH = path.join(os.homedir(), '.gemini', 'settings.json');

export const SERVER_PORT = Number(process.env.PORT || 4310);
export const SERVER_HOST = process.env.HOST || '127.0.0.1';
export const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

export function ensureRuntimeDirectories(): void {
  for (const dir of [WORKSPACE_DIR, DATA_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

export interface LocalOpenCloudConfig {
  apiKeyConfigured: boolean;
  defaultUniverseId: string | null;
  testPlaceId: string | null;
  prodPlaceId: string | null;
}

export function getLocalOpenCloudConfig(): LocalOpenCloudConfig {
  return {
    apiKeyConfigured: Boolean(process.env.ROBLOX_OPEN_CLOUD_API_KEY && process.env.ROBLOX_OPEN_CLOUD_API_KEY.trim().length > 0),
    defaultUniverseId: process.env.ROBLOX_DEFAULT_UNIVERSE_ID?.trim() || null,
    testPlaceId: process.env.ROBLOX_TEST_PLACE_ID?.trim() || null,
    prodPlaceId: process.env.ROBLOX_PROD_PLACE_ID?.trim() || null,
  };
}

/**
 * Safely updates local .env keys without ever echoing secrets back to prompts or clients.
 */
export function updateLocalEnvKeys(updates: Record<string, string>): void {
  const allowedKeys = new Set([
    'ROBLOX_OPEN_CLOUD_API_KEY',
    'ROBLOX_DEFAULT_UNIVERSE_ID',
    'ROBLOX_TEST_PLACE_ID',
    'ROBLOX_PROD_PLACE_ID',
    'USD_TO_PHP_RATE',
    'ROFORGE_PRO_MODEL',
    'ROFORGE_FAST_MODEL',
  ]);

  let existing = '';
  if (fs.existsSync(ENV_PATH)) {
    existing = fs.readFileSync(ENV_PATH, 'utf8');
  }

  const lines = existing ? existing.split(/\r?\n/) : [];
  const remaining = new Map<string, string>();
  for (const [k, v] of Object.entries(updates)) {
    if (allowedKeys.has(k)) {
      const sanitized = v.replace(/[\r\n]/g, '').trim();
      remaining.set(k, sanitized);
      process.env[k] = sanitized;
    }
  }

  const nextLines = lines.map((line) => {
    const match = line.match(/^([A-Z0-9_]+)=/);
    if (match && remaining.has(match[1])) {
      const val = remaining.get(match[1])!;
      remaining.delete(match[1]);
      return `${match[1]}=${val}`;
    }
    return line;
  });

  for (const [k, v] of remaining.entries()) {
    nextLines.push(`${k}=${v}`);
  }

  fs.writeFileSync(ENV_PATH, nextLines.filter((l, idx, arr) => !(idx === arr.length - 1 && l === '')).join('\n') + '\n', 'utf8');
}

