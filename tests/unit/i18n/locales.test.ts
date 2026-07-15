import * as en from '@/i18n/locales/en.json';
import * as ja from '@/i18n/locales/ja.json';
import * as zhCN from '@/i18n/locales/zh-CN.json';
import * as zhTW from '@/i18n/locales/zh-TW.json';

interface TranslationTree {
  [key: string]: string | TranslationTree;
}

const locales = {
  'zh-CN': zhCN,
  'zh-TW': zhTW,
} as const;

const localizedKeys = [
  'chat.rewind.confirmMessageConversationOnly',
  'chat.rewind.menuConversationOnly',
  'chat.rewind.menuCodeAndConversation',
  'chat.rewind.noticeConversationOnly',
  'chat.rewind.noticeConversationOnlySaveFailed',
  'chat.fork.errorMessageNotFound',
  'chat.fork.errorNoSession',
  'chat.fork.errorNoActiveTab',
  'chat.bangBash.placeholder',
  'chat.bangBash.commandPanel',
  'chat.bangBash.copyAriaLabel',
  'chat.bangBash.clearAriaLabel',
  'chat.bangBash.statusLabel',
  'chat.bangBash.collapseOutput',
  'chat.bangBash.expandOutput',
  'chat.bangBash.running',
  'chat.bangBash.copyFailed',
  'settings.subagents.name',
  'settings.subagents.desc',
  'settings.subagents.noAgents',
  'settings.subagents.deleteConfirm',
  'settings.subagents.saveFailed',
  'settings.subagents.deleteFailed',
  'settings.subagents.renameCleanupFailed',
  'settings.subagents.created',
  'settings.subagents.updated',
  'settings.subagents.deleted',
  'settings.subagents.duplicateName',
  'settings.subagents.descriptionRequired',
  'settings.subagents.promptRequired',
  'settings.subagents.modal.titleEdit',
  'settings.subagents.modal.titleAdd',
  'settings.subagents.modal.nameDesc',
  'settings.subagents.modal.descriptionDesc',
  'settings.subagents.modal.descriptionPlaceholder',
  'settings.subagents.modal.advancedOptions',
  'settings.subagents.modal.modelDesc',
  'settings.subagents.modal.toolsDesc',
  'settings.subagents.modal.disallowedTools',
  'settings.subagents.modal.disallowedToolsDesc',
  'settings.subagents.modal.skills',
  'settings.subagents.modal.skillsDesc',
  'settings.subagents.modal.prompt',
  'settings.subagents.modal.promptDesc',
  'settings.subagents.modal.promptPlaceholder',
  'settings.enableBangBash.name',
  'settings.enableBangBash.desc',
  'settings.enableBangBash.validation.noNode',
  'settings.requireCommandOrControlEnterToSend.name',
  'settings.requireCommandOrControlEnterToSend.desc',
] as const;

const staleBangBashDesc =
  'Type ! on empty input to enter bash mode. Runs commands directly via Node.js child_process.';

const globallyCoveredLocales = {
  'zh-CN': zhCN,
  'zh-TW': zhTW,
} as const;

const globalI18nCoveragePrefixes = [
  'chat.toolbar.',
  'modal.instruction.',
  'renderer.ask.',
  'renderer.history.',
  'renderer.subagent.',
  'renderer.tool.',
  'settings.claude.',
  'settings.codex.',
  'settings.mcp.',
  'settings.opencode.',
  'settings.typora.',
] as const;

const globalI18nTechnicalFallbacks = new Set([
  'chat.toolbar.safeLabel',
  'chat.toolbar.yoloLabel',
  'renderer.tool.bashPrefix',
  'renderer.tool.command',
  'renderer.tool.list',
  'renderer.tool.pattern',
  'renderer.tool.toolSearch',
  'renderer.tool.toolSearchLabel',
  'renderer.tool.url',
  'renderer.tool.webSearch',
  'settings.claude.customVariables.placeholder',
  'settings.claude.slashCommands.agent.placeholder',
  'settings.claude.slashCommands.modelOverride.placeholder',
  'settings.claude.slashCommands.name.placeholder',
  'settings.claude.slashCommands.promptPlaceholder',
  'settings.codex.cliPath.placeholderNative',
  'settings.codex.cliPath.placeholderWindows',
  'settings.codex.cliPath.placeholderWsl',
  'settings.codex.customModels.placeholder',
  'settings.codex.env.placeholder',
  'settings.codex.hiddenSkills.placeholder',
  'settings.codex.installationMethod.wsl',
  'settings.codex.skillModal.name.placeholder',
  'settings.codex.subagentModal.name.placeholder',
  'settings.codex.wslDistro.placeholder',
  'settings.mcp.addOptionHttp',
  'settings.mcp.addOptionStdio',
  'settings.mcp.modal.command.placeholder',
  'settings.mcp.modal.env.placeholder',
  'settings.mcp.modal.headers.placeholder',
  'settings.mcp.modal.serverName.placeholder',
  'settings.mcp.modal.type.http',
  'settings.mcp.modal.type.sse',
  'settings.mcp.modal.type.stdio',
  'settings.mcp.modal.url.name',
  'settings.mcp.modal.url.placeholder',
  'settings.opencode.agentModal.color.placeholder',
  'settings.opencode.agentModal.model.placeholder',
  'settings.opencode.agentModal.options.placeholder',
  'settings.opencode.agentModal.permission.placeholder',
  'settings.opencode.agentModal.steps.placeholder',
  'settings.opencode.agentModal.temperature.placeholder',
  'settings.opencode.agentModal.tools.placeholder',
  'settings.opencode.agentModal.topP.name',
  'settings.opencode.agentModal.topP.placeholder',
  'settings.opencode.agentModal.variant.placeholder',
  'settings.opencode.cliPath.placeholderUnix',
  'settings.opencode.cliPath.placeholder',
  'settings.opencode.cliPath.placeholderWin',
  'settings.opencode.hiddenCommands.placeholder',
  'settings.opencode.models.providerOption',
  'settings.typora.api.heading',
]);

const expectedGlobalTechnicalFallbacks = new Set([
  ...globalI18nTechnicalFallbacks,
  'chat.bangBash.commandLabel',
  'common.typorai',
  'renderer.diff.prefix',
  'settings.codex.installationMethod.wsl',
  'settings.hotkeySearch',
  'settings.mcp.modal.url.name',
  'settings.opencode.agentModal.topP.name',
  'settings.tabs.claude',
  'settings.tabs.codex',
  'settings.tabs.opencode',
  'settings.tabs.typora',
]);

function isExpectedGlobalTechnicalFallback(key: string, value: string): boolean {
  const lowerKey = key.toLowerCase();

  if (['TyporAi', 'TyporAi', 'Claude', 'Codex', 'OpenCode', 'Typora', 'API', 'CLI', 'WSL', 'HTTP', 'SSE', 'URL', 'HTTP / SSE', 'stdio (local command)', 'Stdio (local command)', 'SSE (server-sent events)', 'Top p', 'Sonnet', 'Opus', 'Haiku', 'SAFE', 'YOLO'].includes(value)) {
    return true;
  }

  if (/^\{[A-Za-z0-9_.-]+\}$/.test(value)) {
    return true;
  }

  if (/^\{[A-Za-z0-9_.-]+\}( \(\{[A-Za-z0-9_.-]+\}\))?$/.test(value)) {
    return true;
  }

  if (value === '{count} tokens') {
    return true;
  }

  if (['+', '-'].includes(value)) {
    return true;
  }

  if (/^(Bash|WebFetch|Grep|Glob|ToolSearch|WebSearch|LS): \{[A-Za-z0-9_.-]+\}$/.test(value)
    || value === '$ {command}') {
    return true;
  }

  return expectedGlobalTechnicalFallbacks.has(key)
    || lowerKey.includes('placeholder')
    || key.startsWith('provider.')
    || key.startsWith('settings.subagents.modelOptions.')
    || key.startsWith('settings.mcp.modal.type.')
    || key.startsWith('settings.mcp.addOption');
}

function flattenTranslations(
  translations: TranslationTree,
  prefix = '',
  out: Record<string, string> = {}
): Record<string, string> {
  for (const [key, value] of Object.entries(translations)) {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') {
      flattenTranslations(value as TranslationTree, nextKey, out);
      continue;
    }

    out[nextKey] = String(value);
  }

  return out;
}

describe('locale files', () => {
  const english = flattenTranslations(en as unknown as TranslationTree);

  it('keeps every locale structurally aligned with English', () => {
    const englishKeys = Object.keys(english).sort();

    for (const [locale, translations] of Object.entries(locales)) {
      const localeKeys = Object.keys(flattenTranslations(translations as unknown as TranslationTree)).sort();
      expect(localeKeys).toEqual(englishKeys);
      expect(locale).toBeTruthy();
    }
  });

  it('localizes the recent bang bash and subagent additions', () => {
    for (const translations of Object.values(locales)) {
      const locale = flattenTranslations(translations as unknown as TranslationTree);

      for (const key of localizedKeys) {
        expect(locale[key]).toBeDefined();
        expect(locale[key]).not.toBe(english[key]);
      }

      expect(locale['settings.enableBangBash.desc']).not.toBe(staleBangBashDesc);
    }
  });

  it('uses commands-and-skills copy for hidden Claude entries', () => {
    expect(english['settings.hiddenSlashCommands.name']).toBe('Hidden Commands and Skills');
    expect(english['settings.hiddenSlashCommands.desc']).toBe(
      'Hide specific commands and skills from the dropdown. Useful for hiding Claude Code entries that are not relevant to TyporAi. Enter names without the leading slash, one per line.',
    );
  });

  it('keeps Japanese provider setting keys structurally complete', () => {
    const japanese = flattenTranslations(ja as unknown as TranslationTree);
    const allowedTechnicalFallbacks = new Set([
      'chat.toolbar.safeLabel',
      'chat.toolbar.yoloLabel',
      'settings.codex.installationMethod.nativeWindows',
      'settings.codex.installationMethod.wsl',
      'settings.codex.cliPath.placeholderNative',
      'settings.codex.cliPath.placeholderWsl',
      'settings.codex.cliPath.placeholderWindows',
      'settings.codex.wslDistro.placeholder',
      'settings.codex.hiddenSkills.placeholder',
      'settings.codex.env.placeholder',
      'settings.codex.customModels.placeholder',
      'settings.codex.skillModal.name.placeholder',
      'settings.codex.subagentModal.name.placeholder',
      'settings.opencode.cliPath.placeholderWin',
      'settings.opencode.cliPath.placeholderUnix',
      'settings.opencode.cliPath.placeholder',
      'settings.opencode.models.providerOption',
      'settings.opencode.hiddenCommands.placeholder',
      'settings.opencode.agentModal.name.placeholder',
      'settings.opencode.agentModal.model.placeholder',
      'settings.opencode.agentModal.variant.placeholder',
      'settings.opencode.agentModal.temperature.placeholder',
      'settings.opencode.agentModal.topP.name',
      'settings.opencode.agentModal.topP.placeholder',
      'settings.opencode.agentModal.color.placeholder',
      'settings.opencode.agentModal.steps.placeholder',
      'settings.opencode.agentModal.tools.placeholder',
      'settings.opencode.agentModal.permission.placeholder',
      'settings.opencode.agentModal.options.placeholder',
      'settings.typora.api.heading',
    ]);

    for (const key of Object.keys(english)) {
      const isProviderSettingsKey = key.startsWith('settings.codex.')
        || key.startsWith('settings.opencode.')
        || key.startsWith('settings.typora.')
        || key === 'settings.codexSafeMode.name'
        || key === 'settings.codexSafeMode.desc';

      if (!isProviderSettingsKey || allowedTechnicalFallbacks.has(key)) {
        continue;
      }

      expect(japanese[key]).toBeDefined();
    }
  });

  it('localizes Simplified Chinese provider setting pages instead of falling back to English copy', () => {
    const simplifiedChinese = flattenTranslations(zhCN as unknown as TranslationTree);
    const allowedTechnicalFallbacks = new Set([
      'settings.codex.installationMethod.wsl',
      'settings.codex.cliPath.placeholderNative',
      'settings.codex.cliPath.placeholderWsl',
      'settings.codex.cliPath.placeholderWindows',
      'settings.codex.wslDistro.placeholder',
      'settings.codex.hiddenSkills.placeholder',
      'settings.codex.env.placeholder',
      'settings.codex.customModels.placeholder',
      'settings.codex.skillModal.name.placeholder',
      'settings.codex.subagentModal.name.placeholder',
      'settings.claude.slashCommands.name.placeholder',
      'settings.claude.slashCommands.modelOverride.placeholder',
      'settings.claude.slashCommands.agent.placeholder',
      'settings.claude.slashCommands.promptPlaceholder',
      'settings.claude.customVariables.placeholder',
      'settings.opencode.cliPath.placeholderWin',
      'settings.opencode.cliPath.placeholderUnix',
      'settings.opencode.cliPath.placeholder',
      'settings.opencode.models.providerOption',
      'settings.opencode.hiddenCommands.placeholder',
      'settings.opencode.agentModal.name.placeholder',
      'settings.opencode.agentModal.model.placeholder',
      'settings.opencode.agentModal.variant.placeholder',
      'settings.opencode.agentModal.temperature.placeholder',
      'settings.opencode.agentModal.topP.name',
      'settings.opencode.agentModal.topP.placeholder',
      'settings.opencode.agentModal.color.placeholder',
      'settings.opencode.agentModal.steps.placeholder',
      'settings.opencode.agentModal.tools.placeholder',
      'settings.opencode.agentModal.permission.placeholder',
      'settings.opencode.agentModal.options.placeholder',
      'settings.opencode.env.placeholder',
      'settings.typora.api.heading',
    ]);

    for (const key of Object.keys(english)) {
      const isProviderSettingsKey = key.startsWith('settings.claude.')
        || key.startsWith('settings.codex.')
        || key.startsWith('settings.opencode.')
        || key.startsWith('settings.typora.')
        || key === 'settings.claudeSafeMode.name'
        || key === 'settings.claudeSafeMode.desc'
        || key === 'settings.codexSafeMode.name'
        || key === 'settings.codexSafeMode.desc';

      if (!isProviderSettingsKey || allowedTechnicalFallbacks.has(key)) {
        continue;
      }

      expect(simplifiedChinese[key]).toBeDefined();
      expect(simplifiedChinese[key]).not.toBe(english[key]);
    }
  });

  it('localizes Simplified Chinese MCP settings instead of falling back to English copy', () => {
    const simplifiedChinese = flattenTranslations(zhCN as unknown as TranslationTree);
    const allowedTechnicalFallbacks = new Set([
      'settings.mcp.modal.serverName.placeholder',
      'settings.mcp.modal.type.stdio',
      'settings.mcp.modal.type.sse',
      'settings.mcp.modal.type.http',
      'settings.mcp.modal.command.placeholder',
      'settings.mcp.modal.env.placeholder',
      'settings.mcp.modal.url.name',
      'settings.mcp.modal.url.placeholder',
      'settings.mcp.modal.headers.placeholder',
      'settings.mcp.addOptionStdio',
      'settings.mcp.addOptionHttp',
    ]);

    for (const key of Object.keys(english)) {
      if (!key.startsWith('settings.mcp.') || allowedTechnicalFallbacks.has(key)) {
        continue;
      }

      expect(simplifiedChinese[key]).toBeDefined();
      expect(simplifiedChinese[key]).not.toBe(english[key]);
    }
  });

  it('localizes Simplified Chinese runtime toolbar and tool rendering copy', () => {
    const simplifiedChinese = flattenTranslations(zhCN as unknown as TranslationTree);
    const allowedTechnicalFallbacks = new Set([
      'chat.toolbar.safeLabel',
      'chat.toolbar.yoloLabel',
      'renderer.tool.command',
      'renderer.tool.url',
      'renderer.tool.pattern',
      'renderer.tool.toolSearch',
      'renderer.tool.toolSearchLabel',
      'renderer.tool.webSearch',
      'renderer.tool.bashPrefix',
      'renderer.tool.list',
    ]);

    for (const key of Object.keys(english)) {
      const isRuntimeKey = key.startsWith('chat.toolbar.')
        || key.startsWith('renderer.tool.');

      if (!isRuntimeKey || allowedTechnicalFallbacks.has(key)) {
        continue;
      }

      expect(simplifiedChinese[key]).toBeDefined();
      expect(simplifiedChinese[key]).not.toBe(english[key]);
    }
  });

  it('localizes Simplified Chinese conversation runtime panels', () => {
    const simplifiedChinese = flattenTranslations(zhCN as unknown as TranslationTree);
    const runtimePrefixes = [
      'chat.input.',
      'renderer.history.',
      'renderer.subagent.',
      'renderer.ask.',
      'modal.instruction.',
    ];

    for (const key of Object.keys(english)) {
      if (!runtimePrefixes.some(prefix => key.startsWith(prefix))) {
        continue;
      }

      expect(simplifiedChinese[key]).toBeDefined();
      expect(simplifiedChinese[key]).not.toBe(english[key]);
    }
  });

  it('localizes Simplified Chinese runtime states, permissions, inline edit, and validation copy', () => {
    const simplifiedChinese = flattenTranslations(zhCN as unknown as TranslationTree);
    const runtimePrefixes = [
      'chat.imageAttachments.',
      'chat.permission.',
      'inlineEdit.',
      'renderer.message.',
      'renderer.plan.',
      'renderer.planApproval.',
      'renderer.rewind.',
      'renderer.thinking.',
      'renderer.writeEdit.',
      'validation.slug.',
    ];
    const allowedTechnicalFallbacks = new Set([
      'renderer.diff.prefix',
    ]);

    for (const key of Object.keys(english)) {
      const isRuntimeKey = runtimePrefixes.some(prefix => key.startsWith(prefix))
        || key.startsWith('renderer.diff.');

      if (!isRuntimeKey || allowedTechnicalFallbacks.has(key)) {
        continue;
      }

      expect(simplifiedChinese[key]).toBeDefined();
      expect(simplifiedChinese[key]).not.toBe(english[key]);
    }
  });

  it('keeps Traditional Chinese aligned with Simplified Chinese coverage for fixed namespaces', () => {
    const simplifiedChinese = flattenTranslations(zhCN as unknown as TranslationTree);
    const traditionalChinese = flattenTranslations(zhTW as unknown as TranslationTree);
    const coveredPrefixes = [
      'chat.imageAttachments.',
      'chat.input.',
      'chat.permission.',
      'chat.toolbar.',
      'inlineEdit.',
      'modal.instruction.',
      'renderer.ask.',
      'renderer.diff.',
      'renderer.history.',
      'renderer.message.',
      'renderer.plan.',
      'renderer.planApproval.',
      'renderer.rewind.',
      'renderer.subagent.',
      'renderer.thinking.',
      'renderer.tool.',
      'renderer.writeEdit.',
      'settings.claude.',
      'settings.codex.',
      'settings.mcp.',
      'settings.opencode.',
      'settings.typora.',
      'validation.slug.',
    ];

    for (const key of Object.keys(english)) {
      if (!coveredPrefixes.some(prefix => key.startsWith(prefix))) {
        continue;
      }

      if (simplifiedChinese[key] === english[key]) {
        continue;
      }

      expect(traditionalChinese[key]).toBeDefined();
      expect(traditionalChinese[key]).not.toBe(english[key]);
    }
  });

  it('localizes covered global namespaces for all target locales', () => {
    for (const translations of Object.values(globallyCoveredLocales)) {
      const locale = flattenTranslations(translations as unknown as TranslationTree);

      for (const key of Object.keys(english)) {
        const isCoveredKey = globalI18nCoveragePrefixes.some(prefix => key.startsWith(prefix));

        if (!isCoveredKey || globalI18nTechnicalFallbacks.has(key)
          || isExpectedGlobalTechnicalFallback(key, english[key])) {
          continue;
        }

        expect(locale[key]).toBeDefined();
        expect(locale[key]).not.toBe(english[key]);
      }
    }
  });

  it('does not contain mojibake question mark runs in covered locale namespaces', () => {
    for (const [localeName, translations] of Object.entries(globallyCoveredLocales)) {
      const locale = flattenTranslations(translations as unknown as TranslationTree);

      for (const [key, value] of Object.entries(locale)) {
        const isCoveredKey = globalI18nCoveragePrefixes.some(prefix => key.startsWith(prefix));

        if (!isCoveredKey) {
          continue;
        }

        expect(`${localeName}: ${key}: ${value}`).not.toMatch(/\?{3,}/);
      }
    }
  });

  it('localizes all non-technical strings for target locales', () => {
    for (const translations of Object.values(globallyCoveredLocales)) {
      const locale = flattenTranslations(translations as unknown as TranslationTree);

      for (const key of Object.keys(english)) {
        if (isExpectedGlobalTechnicalFallback(key, english[key])) {
          continue;
        }

        expect(locale[key]).toBeDefined();
        expect(locale[key]).not.toBe(english[key]);
      }
    }
  });
});
