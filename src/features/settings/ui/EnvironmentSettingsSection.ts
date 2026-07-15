import { getEnvironmentReviewKeysForScope } from '../../../core/providers/providerEnvironment';
import type { EnvironmentScope } from '../../../core/types/settings';
import { t } from '../../../i18n/i18n';
import type TyporAiPlugin from '../../../main';
import { SettingBuilder } from '../../../ui/SettingBuilder';
import { EnvSnippetManager } from './EnvSnippetManager';

interface EnvironmentSettingsSectionOptions {
  container: HTMLElement;
  plugin: TyporAiPlugin;
  scope: EnvironmentScope;
  heading?: string;
  name: string;
  desc: string;
  placeholder: string;
  renderCustomContextLimits?: (container: HTMLElement) => void;
}

export function renderEnvironmentSettingsSection(
  options: EnvironmentSettingsSectionOptions,
): void {
  const {
    container,
    plugin,
    scope,
    heading,
    name,
    desc,
    placeholder,
    renderCustomContextLimits,
  } = options;

  const settings = new SettingBuilder(container);
  if (heading) settings.heading(heading);

  const reviewEl = container.ownerDocument.createElement('div');
  reviewEl.className = 'typorai-env-review-warning typorai-setting-validation typorai-setting-validation-warning typorai-hidden';
  container.append(reviewEl);

  const updateReviewWarning = () => {
    const reviewKeys = getEnvironmentReviewKeysForScope(envTextarea.value, scope);
    if (reviewKeys.length === 0) {
      reviewEl.classList.add('typorai-hidden');
      reviewEl.replaceChildren();
      return;
    }

    reviewEl.textContent = t('settings.envReview.message', { keys: reviewKeys.join(', ') });
    reviewEl.classList.remove('typorai-hidden');
  };

  const envTextarea = settings.textarea(
    name,
    plugin.getEnvironmentVariablesForScope(scope),
    () => updateReviewWarning(),
    desc,
  );
  envTextarea.placeholder = placeholder;
  envTextarea.rows = 6;
  envTextarea.cols = 50;
  envTextarea.classList.add('typorai-settings-env-textarea');
  envTextarea.dataset.envScope = scope;

  updateReviewWarning();

  const contextLimitsContainer = container.ownerDocument.createElement('div');
  contextLimitsContainer.className = 'typorai-context-limits-container';
  container.append(contextLimitsContainer);
  renderCustomContextLimits?.(contextLimitsContainer);

  envTextarea.addEventListener('blur', () => {
    void (async (): Promise<void> => {
      await plugin.applyEnvironmentVariables(scope, envTextarea.value);
      renderCustomContextLimits?.(contextLimitsContainer);
      updateReviewWarning();
    })();
  });

  const envSnippetsContainer = container.ownerDocument.createElement('div');
  envSnippetsContainer.className = 'typorai-env-snippets-container';
  container.append(envSnippetsContainer);
  new EnvSnippetManager(envSnippetsContainer, plugin, scope, () => {
    renderCustomContextLimits?.(contextLimitsContainer);
  });
}
