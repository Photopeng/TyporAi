import { TYPORAI_STORAGE_PATH } from '../../../core/bootstrap/StoragePaths';
import type { FileStore, PathService } from '../../../core/ports';
import {
  buildSystemPrompt,
  computeSystemPromptKey,
  type SystemPromptSettings,
} from '../../../core/prompt/mainAgent';
import { expandHomePath } from '../../../utils/path';
import {
  OPENCODE_BUILD_MODE_ID,
  OPENCODE_PLAN_MODE_ID,
  OPENCODE_SAFE_MODE_ID,
  OPENCODE_YOLO_MODE_ID,
} from '../modes';
import { resolveOpencodeDatabasePath } from './OpencodePaths';

export interface OpencodeLaunchArtifacts {
  configPath: string;
  configContent: string;
  databasePath: string | null;
  launchKey: string;
  systemPromptPath: string;
}

export interface OpencodeManagedAgentConfig {
  definition?: Record<string, unknown>;
  id: string;
}

const DEFAULT_OPENCODE_MANAGED_AGENT_CONFIGS: readonly OpencodeManagedAgentConfig[] = [
  { id: OPENCODE_BUILD_MODE_ID },
  {
    definition: {
      mode: 'primary',
      permission: {
        plan_enter: 'allow',
        question: 'allow',
      },
    },
    id: OPENCODE_YOLO_MODE_ID,
  },
  {
    definition: {
      mode: 'primary',
      permission: {
        plan_enter: 'allow',
        question: 'allow',
        bash: 'deny',
        edit: 'deny',
      },
    },
    id: OPENCODE_SAFE_MODE_ID,
  },
  { id: OPENCODE_PLAN_MODE_ID },
];

export interface PrepareOpencodeLaunchArtifactsParams {
  artifactsSubdir?: string;
  defaultAgentId?: string;
  managedAgents?: readonly OpencodeManagedAgentConfig[];
  runtimeEnv: NodeJS.ProcessEnv;
  settings?: SystemPromptSettings;
  systemPromptKey?: string;
  systemPromptText?: string;
  userName?: string;
  workspaceRoot: string;
  fileStore?: FileStore;
  pathService?: PathService;
}

export async function prepareOpencodeLaunchArtifacts(
  params: PrepareOpencodeLaunchArtifactsParams,
): Promise<OpencodeLaunchArtifacts> {
  const fileStore = params.fileStore;
  const pathService = params.pathService;
  if (!fileStore || !pathService) throw new Error('OpenCode launch artifacts require host file and path services');
  const artifactsDir = pathService.join(
    params.workspaceRoot,
    TYPORAI_STORAGE_PATH,
    params.artifactsSubdir ?? 'opencode',
  );
  const systemPromptPath = pathService.join(artifactsDir, 'system.md');
  const configPath = pathService.join(artifactsDir, 'config.json');
  const systemPrompt = normalizeSystemPrompt(
    params.systemPromptText ?? buildSystemPrompt(requireSettings(params)),
  );
  const promptKey = params.systemPromptKey
    ?? (params.systemPromptText !== undefined
      ? params.systemPromptText
      : computeSystemPromptKey(requireSettings(params)));
  const baseConfig = await loadOpencodeBaseConfig(
    params.runtimeEnv.OPENCODE_CONFIG,
    params.workspaceRoot,
    fileStore,
    pathService,
  );
  const configContent = `${JSON.stringify(
    buildOpencodeManagedConfig(
      baseConfig,
      systemPromptPath,
      params.userName ?? params.settings?.userName,
      params.managedAgents,
      params.defaultAgentId,
    ),
    null,
    2,
  )}\n`;
  const databasePath = resolveOpencodeDatabasePath(params.runtimeEnv);

  await fileStore.ensureDirectory(artifactsDir);
  await ensureOpencodeDatabaseDirectory(databasePath, fileStore, pathService);
  await writeIfChanged(systemPromptPath, systemPrompt, fileStore);
  await writeIfChanged(configPath, configContent, fileStore);

  return {
    configPath,
    configContent,
    databasePath,
    launchKey: [
      promptKey,
      configContent,
      databasePath ?? '',
      params.runtimeEnv.XDG_DATA_HOME ?? '',
    ].join('::'),
    systemPromptPath,
  };
}

async function ensureOpencodeDatabaseDirectory(databasePath: string | null, fileStore: FileStore, pathService: PathService): Promise<void> {
  if (!databasePath || databasePath === ':memory:') {
    return;
  }

  await fileStore.ensureDirectory(pathService.dirname(databasePath));
}

export function buildOpencodeManagedConfig(
  baseConfig: Record<string, unknown>,
  systemPromptPath: string,
  userName?: string,
  managedAgents: readonly OpencodeManagedAgentConfig[] = DEFAULT_OPENCODE_MANAGED_AGENT_CONFIGS,
  defaultAgentId?: string,
): Record<string, unknown> {
  const config: Record<string, unknown> = {
    ...baseConfig,
    $schema: typeof baseConfig.$schema === 'string'
      ? baseConfig.$schema
      : 'https://opencode.ai/config.json',
  };
  const existingAgents = isPlainObject(baseConfig.agent)
    ? { ...baseConfig.agent }
    : {};
  const nextAgents: Record<string, unknown> = { ...existingAgents };
  const agentConfigs = managedAgents.length > 0
    ? managedAgents
    : DEFAULT_OPENCODE_MANAGED_AGENT_CONFIGS;

  for (const agentConfig of agentConfigs) {
    const existingAgentValue = existingAgents[agentConfig.id];
    const existingAgent = isPlainObject(existingAgentValue)
      ? { ...existingAgentValue }
      : {};
    nextAgents[agentConfig.id] = {
      ...existingAgent,
      ...(isPlainObject(agentConfig.definition) ? agentConfig.definition : {}),
      prompt: `{file:${systemPromptPath}}`,
    };
  }

  config.agent = nextAgents;
  const trimmedDefaultAgentId = defaultAgentId?.trim();
  if (trimmedDefaultAgentId) {
    config.default_agent = trimmedDefaultAgentId;
  }

  const trimmedUserName = userName?.trim();
  if (trimmedUserName) {
    config.username = trimmedUserName;
  }

  return config;
}

async function writeIfChanged(filePath: string, content: string, fileStore: FileStore): Promise<void> {
  try {
    const existing = await fileStore.readText(filePath);
    if (existing === content) {
      return;
    }
  } catch {
    // Missing file; write below.
  }

  await fileStore.writeAtomic(filePath, content);
}

async function loadOpencodeBaseConfig(
  configuredPath: string | undefined,
  workspaceRoot: string,
  fileStore: FileStore,
  pathService: PathService,
): Promise<Record<string, unknown>> {
  const trimmedPath = configuredPath?.trim();
  if (!trimmedPath) {
    return {};
  }

  const expandedPath = expandHomePath(trimmedPath);
  const resolvedPath = pathService.isAbsolute(expandedPath)
    ? expandedPath
    : pathService.normalize(pathService.join(workspaceRoot, expandedPath));

  try {
    const rawConfig = await fileStore.readText(resolvedPath);
    const parsedConfig = JSON.parse(rawConfig) as unknown;
    return isPlainObject(parsedConfig) ? parsedConfig : {};
  } catch {
    return {};
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeSystemPrompt(systemPrompt: string): string {
  return systemPrompt.endsWith('\n') ? systemPrompt : `${systemPrompt}\n`;
}

function requireSettings(
  params: PrepareOpencodeLaunchArtifactsParams,
): SystemPromptSettings {
  if (params.settings) {
    return params.settings;
  }

  throw new Error('prepareOpencodeLaunchArtifacts requires settings when no systemPromptText is provided');
}
