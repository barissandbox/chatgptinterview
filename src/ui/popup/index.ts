import { APP_URLS, EXTENSION_PATHS } from '../../shared/constants';
import {
  connectDeepgramSocket,
  getDeepgramBalanceErrorMessage,
  getDeepgramStorage,
  refreshDeepgramBalance,
  saveDeepgramApiKey as persistDeepgramApiKey
} from '../../api/deepgram';
import { isRuntimeEventMessage, sendRuntimeMessage } from '../../shared/messaging';
import { getDefaultThinkingVariantForModel, getSupportedThinkingVariants } from '../../shared/settings';
import { getStorage, removeStorage, setStorage } from '../../shared/storage';
import { requireButton, requireElement, requireFileInput, requireInput, requireSelect } from './domElements';
import { formatLimitItem } from './formatters';
import { MAX_CV_TEXT_CHARS, extractCvText } from './cvReader';
import type { AvailableModel, LimitInfo, ResponseStyle, StatusPayload, ThinkingVariant } from '../../shared/types';

const signedOutView = requireElement('signedOutView');
const signedInView = requireElement('signedInView');
const cvPanel = requireElement('cvPanel');
const deepgramPanel = requireElement('deepgramPanel');
const secondaryPanels = requireElement('secondaryPanels');
const appVersion = requireElement('appVersion');
const accountLabel = requireElement('accountLabel');
const authStatus = requireElement('authStatus');
const mainStatus = requireElement('mainStatus');
const limitList = requireElement('limitList');
const headerLimits = requireElement('headerLimits');
const planLabel = requireElement('planLabel');
const cvStatus = requireElement('cvStatus');
const loginButton = requireButton('loginButton');
const openButton = requireButton('openAssistantButton');
const signOutButton = requireButton('signOutButton');
const limitRefreshButton = requireButton('limitRefreshButton');
const modelRefreshButton = requireButton('modelRefreshButton');
const uploadCvButton = requireButton('uploadCvButton');
const removeCvButton = requireButton('removeCvButton');
const developerLink = requireButton('developerLink');
const sourceLink = requireButton('sourceLink');
const deepgramSignupButton = requireButton('deepgramSignupButton');
const testDeepgramButton = requireButton('testDeepgramButton');
const cvFileInput = requireFileInput('cvFileInput');
const deepgramApiKeyInput = requireInput('deepgramApiKeyInput');
const modelSelect = requireSelect('modelSelect');
const thinkingSelect = requireSelect('thinkingSelect');
const verbositySelect = requireSelect('verbositySelect');
const fastSelect = requireSelect('fastSelect');
const deepgramStatus = requireElement('deepgramStatus');

let currentModels: AvailableModel[] = [];
let savedDeepgramApiKey = '';
let isChatGptLoggedIn = false;

document.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  renderVersion();
  void initializePopup();
});

chrome.runtime.onMessage.addListener((incoming: unknown) => {
  if (isRuntimeEventMessage(incoming) && (incoming.action === 'event.authChanged' || incoming.action === 'event.assistantUpdated')) {
    void refreshStatus();
  }
  return false;
});

function bindEvents(): void {
  loginButton.addEventListener('click', () => {
    void startLogin();
  });
  openButton.addEventListener('click', () => {
    void openAssistant();
  });
  signOutButton.addEventListener('click', () => {
    void signOut();
  });
  limitRefreshButton.addEventListener('click', () => {
    void refreshLimits();
  });
  modelRefreshButton.addEventListener('click', () => {
    void refreshModels();
  });
  uploadCvButton.addEventListener('click', () => {
    cvFileInput.click();
  });
  removeCvButton.addEventListener('click', () => {
    void clearCvProfile();
  });
  cvFileInput.addEventListener('change', () => {
    void uploadCvProfile();
  });
  modelSelect.addEventListener('change', () => {
    void saveModelChoice();
  });
  thinkingSelect.addEventListener('change', () => {
    void saveThinkingChoice();
  });
  verbositySelect.addEventListener('change', () => {
    void saveVerbosityChoice();
  });
  fastSelect.addEventListener('change', () => {
    void saveFastChoice();
  });
  deepgramApiKeyInput.addEventListener('input', () => {
    updateAssistantButtonState();
    if (isChatGptLoggedIn && deepgramApiKeyInput.value.trim() !== savedDeepgramApiKey) {
      renderDeepgramStatus('');
      renderMainStatus('');
    }
  });
  testDeepgramButton.addEventListener('click', () => {
    void testDeepgramApiKey();
  });
  deepgramSignupButton.addEventListener('click', () => openExternal(APP_URLS.deepgramSignup));
  developerLink.addEventListener('click', () => openExternal(APP_URLS.developer));
  sourceLink.addEventListener('click', () => openExternal(APP_URLS.source));
}

/** Loads persisted popup data before the first status render. */
async function initializePopup(): Promise<void> {
  await loadDeepgramApiKey();
  await refreshStatus();
}

/** Renders the manifest version in the popup header. */
function renderVersion(): void {
  const version = chrome.runtime.getManifest().version;
  appVersion.textContent = version ? `v${version}` : '';
}

/** Loads extension status and refreshes every popup section from typed payload data. */
async function refreshStatus(): Promise<void> {
  const status = await sendRuntimeMessage({ action: 'status.get' });
  if (!status.ok) {
    renderAuthStatus(status.error || 'Could not load status.', false);
    return;
  }

  currentModels = status.catalog.availableModels;
  isChatGptLoggedIn = status.auth.loggedIn;
  accountLabel.textContent = status.auth.loggedIn
    ? status.auth.accountEmail || 'Signed in with ChatGPT'
    : 'Not signed in';
  signedOutView.hidden = status.auth.loggedIn;
  secondaryPanels.hidden = !status.auth.loggedIn;
  signedInView.hidden = false;
  cvPanel.hidden = false;
  deepgramPanel.hidden = !status.auth.loggedIn;
  openButton.hidden = !status.auth.loggedIn;
  signOutButton.hidden = !status.auth.loggedIn;
  headerLimits.hidden = !status.auth.loggedIn;
  planLabel.hidden = !status.auth.loggedIn;
  updateAssistantButtonState();

  if (status.auth.loggedIn) {
    renderLimits(status.catalog.limitInfo);
    renderModelOptions(status);
    renderThinkingOptions(status.settings.model, status.settings.thinkingVariant);
    renderRequestOptions(status);
    renderCvStatus(status);
    renderMainStatus('');
    void renderStoredDeepgramBalance();
  } else {
    renderAuthStatus(status.auth.error || 'Sign in with ChatGPT to generate interview answers from live transcripts.', !status.auth.error);
  }
}

/** Hydrates the Deepgram API key field from local extension storage. */
async function loadDeepgramApiKey(): Promise<void> {
  const deepgram = await getDeepgramStorage();
  savedDeepgramApiKey = deepgram.apiKey || '';
  deepgramApiKeyInput.value = savedDeepgramApiKey;
  const balanceLabel = deepgram.balanceLabel || '';
  renderDeepgramStatus(deepgramApiKeyInput.value.trim()
    ? ['API key saved locally.', balanceLabel].filter(Boolean).join(' ')
    : '');
  updateAssistantButtonState();
}

/** Verifies Deepgram websocket access and refreshes management balance data. */
async function testDeepgramApiKey(): Promise<void> {
  const apiKey = deepgramApiKeyInput.value.trim();
  if (!apiKey) {
    renderDeepgramStatus('Enter a Deepgram API key first.', false);
    return;
  }

  setBusy(testDeepgramButton, true, 'Testing');
  renderDeepgramStatus('Testing Deepgram connection...');
  try {
    await testDeepgramConnection(apiKey);
    await persistDeepgramApiKey(apiKey);
    savedDeepgramApiKey = apiKey;
    updateAssistantButtonState();
    renderMainStatus('');
    try {
      const balanceLabel = await refreshDeepgramBalance(apiKey);
      renderDeepgramLimitRow(balanceLabel);
      renderDeepgramStatus(`Deepgram API key works. Saved locally. ${balanceLabel}`);
    } catch (balanceError) {
      await persistDeepgramApiKey(apiKey, { clearBalance: true });
      renderDeepgramLimitRow('');
      renderDeepgramStatus(`Deepgram API key works. Saved locally. ${getDeepgramBalanceErrorMessage(balanceError)}`);
    }
  } catch (error) {
    renderDeepgramStatus(error instanceof Error ? error.message : 'Deepgram API key test failed.', false);
  } finally {
    setBusy(testDeepgramButton, false, 'Test & Save');
  }
}

/** Starts the ChatGPT OAuth flow through the background service worker. */
async function startLogin(): Promise<void> {
  setBusy(loginButton, true, 'Opening...');
  try {
    const result = await sendRuntimeMessage({ action: 'auth.start' });
    if (!result.ok) {
      renderAuthStatus(result.error || 'Could not start ChatGPT sign-in.', false);
    }
  } finally {
    setBusy(loginButton, false, 'Sign in with ChatGPT');
  }
}

/** Opens the assistant side panel and asks the background worker to bind it to the page. */
async function openAssistant(): Promise<void> {
  if (!hasSavedDeepgramKey()) {
    renderMainStatus('Test & Save a Deepgram API key to enable the assistant.', false);
    return;
  }

  setBusy(openButton, true, 'Opening...');
  const sidePanelOpenTask = openAssistantSidePanelFromPopup();
  const assistantOpenTask = sendRuntimeMessage({ action: 'assistant.open' });
  window.setTimeout(() => window.close(), 0);

  try {
    const [result] = await Promise.all([assistantOpenTask, sidePanelOpenTask]);
    if (!result.ok) {
      renderMainStatus(result.error || 'Could not open the assistant.', false);
    }
  } finally {
    setBusy(openButton, false, 'Open Assistant');
    updateAssistantButtonState();
  }
}

/** Opens the side panel from the popup, with tab-scoped fallback for Chrome variants. */
async function openAssistantSidePanelFromPopup(): Promise<void> {
  if (!chrome.sidePanel?.open) {
    return;
  }

  try {
    await chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
  } catch {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      return;
    }
    await chrome.sidePanel.setOptions({
      tabId: tab.id,
      path: EXTENSION_PATHS.sidePanel,
      enabled: true
    }).catch(() => undefined);
    await chrome.sidePanel.open({ tabId: tab.id }).catch(() => undefined);
  }
}

/** Signs out and refreshes local popup state after storage is cleared. */
async function signOut(): Promise<void> {
  const result = await sendRuntimeMessage({ action: 'auth.signOut' });
  if (!result.ok) {
    renderMainStatus(result.error || 'Could not sign out.', false);
    return;
  }
  await refreshStatus();
}

/** Refreshes ChatGPT limits and the saved Deepgram balance row. */
async function refreshLimits(): Promise<void> {
  setIconBusy(limitRefreshButton, true);
  try {
    const result = await sendRuntimeMessage({ action: 'catalog.refreshLimits' });
    if (!result.ok) {
      renderMainStatus(result.error || 'Could not refresh limits.', false);
      return;
    }
    await refreshStatus();
    await refreshDeepgramBalanceForSavedKey();
  } finally {
    setIconBusy(limitRefreshButton, false);
  }
}

/** Refreshes the ChatGPT model catalog used by the assistant. */
async function refreshModels(): Promise<void> {
  setIconBusy(modelRefreshButton, true);
  try {
    const result = await sendRuntimeMessage({ action: 'catalog.refreshModels' });
    if (!result.ok) {
      renderMainStatus(result.error || 'Could not refresh models.', false);
      return;
    }
    await refreshStatus();
  } finally {
    setIconBusy(modelRefreshButton, false);
  }
}

/** Reads a PDF CV locally and stores normalized text for future prompts. */
async function uploadCvProfile(): Promise<void> {
  const file = cvFileInput.files?.[0];
  cvFileInput.value = '';
  if (!file) {
    return;
  }

  setBusy(uploadCvButton, true, 'Reading');
  try {
    const text = await extractCvText(file);
    if (!text.trim()) {
      renderMainStatus('Could not extract readable CV text from this file.', false);
      return;
    }

    const normalizedText = text.slice(0, MAX_CV_TEXT_CHARS);
    await setStorage({
      profile: {
        fileName: file.name,
        text: normalizedText,
        updatedAt: Date.now()
      }
    });
    renderMainStatus('CV profile loaded locally.');
    await refreshStatus();
  } catch (error) {
    renderMainStatus(error instanceof Error ? error.message : 'Could not read CV file.', false);
  } finally {
    setBusy(uploadCvButton, false, 'Select');
  }
}

/** Removes the locally stored CV/profile payload. */
async function clearCvProfile(): Promise<void> {
  await removeStorage('profile');
  renderMainStatus('CV profile removed.');
  await refreshStatus();
}

/** Saves the selected model and resets thinking to that model's default. */
async function saveModelChoice(): Promise<void> {
  const model = modelSelect.value;
  const thinking = getDefaultThinkingVariantForModel(model, currentModels);
  const { settings = {} } = await getStorage('settings');
  await setStorage({ settings: { ...settings, model, thinkingVariant: thinking } });
  renderThinkingOptions(model, thinking);
}

/** Saves the selected reasoning effort for future answer requests. */
async function saveThinkingChoice(): Promise<void> {
  const thinking = thinkingSelect.value as ThinkingVariant;
  const { settings = {} } = await getStorage('settings');
  await setStorage({ settings: { ...settings, thinkingVariant: thinking } });
}

/** Saves selected text verbosity for future answer requests. */
async function saveVerbosityChoice(): Promise<void> {
  const verbosity = verbositySelect.value as ResponseStyle;
  const { settings = {} } = await getStorage('settings');
  await setStorage({ settings: { ...settings, verbosity } });
}

/** Saves selected service tier for future answer requests. */
async function saveFastChoice(): Promise<void> {
  const fastEnabled = fastSelect.value !== 'normal';
  const { settings = {} } = await getStorage('settings');
  await setStorage({ settings: { ...settings, fastEnabled } });
}

/** Renders text-capable visible models into the model selector. */
function renderModelOptions(status: StatusPayload): void {
  modelSelect.innerHTML = '';
  const visibleModels = status.catalog.availableModels.filter((model) => !model.hidden && model.inputModalities.includes('text'));
  const models = visibleModels.length > 0 ? visibleModels : status.catalog.availableModels.filter((model) => !model.hidden);
  for (const model of models) {
    const option = document.createElement('option');
    option.value = model.model;
    option.textContent = model.model;
    modelSelect.appendChild(option);
  }
  modelSelect.value = status.settings.model;
}

/** Renders reasoning-effort options supported by the selected model. */
function renderThinkingOptions(model: string, selectedThinking: ThinkingVariant): void {
  thinkingSelect.innerHTML = '';
  for (const variant of getSupportedThinkingVariants(model, currentModels)) {
    const option = document.createElement('option');
    option.value = variant.value;
    option.textContent = variant.value;
    thinkingSelect.appendChild(option);
  }
  thinkingSelect.value = selectedThinking;
}

/** Renders request behavior options next to reasoning effort. */
function renderRequestOptions(status: StatusPayload): void {
  verbositySelect.value = status.settings.verbosity || 'low';
  fastSelect.value = status.settings.fastEnabled === false ? 'normal' : 'fast';
}

/** Renders ChatGPT usage windows and plan metadata. */
function renderLimits(limitInfo: LimitInfo | null): void {
  limitList.innerHTML = '';
  planLabel.textContent = limitInfo?.planName || 'Free';
  if (!limitInfo?.items.length) {
    const row = document.createElement('div');
    row.className = 'limit-item';
    row.textContent = 'No limit data yet.';
    limitList.appendChild(row);
    return;
  }
  for (const item of limitInfo.items.slice(0, 3)) {
    const row = document.createElement('div');
    row.className = 'limit-item';
    row.textContent = formatLimitItem(item);
    limitList.appendChild(row);
  }
}

/** Renders the last saved Deepgram balance without making a network call. */
async function renderStoredDeepgramBalance(): Promise<void> {
  const deepgram = await getDeepgramStorage();
  renderDeepgramLimitRow(deepgram.balanceLabel || '');
}

/** Inserts or removes the Deepgram balance row in the limits list. */
function renderDeepgramLimitRow(label: string): void {
  document.getElementById('deepgramLimitItem')?.remove();
  if (!label) {
    return;
  }

  const row = document.createElement('div');
  row.id = 'deepgramLimitItem';
  row.className = 'limit-item';
  row.textContent = label;
  limitList.appendChild(row);
}

/** Renders the currently stored CV filename, size, and update date. */
function renderCvStatus(status: StatusPayload): void {
  const hasProfile = Boolean(status.profile.text.trim());
  uploadCvButton.hidden = hasProfile;
  removeCvButton.hidden = !hasProfile;
  if (!hasProfile) {
    cvStatus.textContent = 'No CV loaded.';
    return;
  }

  const updated = status.profile.updatedAt
    ? new Date(status.profile.updatedAt).toLocaleDateString()
    : '';
  const suffix = updated ? `, ${updated}` : '';
  cvStatus.textContent = `${status.profile.fileName || 'CV'} loaded locally (${status.profile.text.length} chars${suffix}).`;
}

/** Updates the authentication status line. */
function renderAuthStatus(message: string, ok = true): void {
  authStatus.textContent = message;
  authStatus.classList.toggle('error-text', !ok);
}

/** Updates the main popup status line. */
function renderMainStatus(message: string, ok = true): void {
  mainStatus.textContent = message;
  mainStatus.hidden = !message;
  mainStatus.classList.toggle('error-text', !ok);
}

/** Updates the Deepgram status line. */
function renderDeepgramStatus(message: string, ok = true): void {
  deepgramStatus.textContent = message;
  deepgramStatus.classList.toggle('error-text', !ok);
}

/** Tests whether the API key can open a Deepgram streaming socket. */
async function testDeepgramConnection(apiKey: string): Promise<void> {
  const socket = await connectDeepgramSocket('en-US', apiKey);
  socket.close(1000, 'Test complete');
}

/** Refreshes Deepgram balance data for the currently saved key. */
async function refreshDeepgramBalanceForSavedKey(): Promise<void> {
  const apiKey = savedDeepgramApiKey;
  if (!apiKey) {
    return;
  }

  try {
    const balanceLabel = await refreshDeepgramBalance(apiKey);
    renderDeepgramLimitRow(balanceLabel);
    renderDeepgramStatus(`Deepgram balance refreshed. ${balanceLabel}`);
  } catch (error) {
    renderDeepgramLimitRow('');
    renderDeepgramStatus(getDeepgramBalanceErrorMessage(error));
  }
}

/** Returns whether the visible Deepgram field matches the last tested and saved key. */
function hasSavedDeepgramKey(): boolean {
  return Boolean(savedDeepgramApiKey && deepgramApiKeyInput.value.trim() === savedDeepgramApiKey);
}

/** Enables the assistant only after ChatGPT login and a tested Deepgram key are present. */
function updateAssistantButtonState(): void {
  const enabled = isChatGptLoggedIn && hasSavedDeepgramKey();
  openButton.disabled = !enabled;
  openButton.title = enabled ? '' : 'Enter Deepgram API key';
}

/** Applies a text-button busy state without changing layout. */
function setBusy(button: HTMLButtonElement, busy: boolean, label: string): void {
  button.disabled = busy;
  button.textContent = label;
}

/** Applies an icon-button busy state without replacing the icon markup. */
function setIconBusy(button: HTMLButtonElement, busy: boolean): void {
  button.disabled = busy;
  button.classList.toggle('is-busy', busy);
}

/** Opens external documentation or signup links in a normal browser tab. */
function openExternal(url: string): void {
  void chrome.tabs.create({ url, active: true });
}
