/** ChatGPT usage-limit client and popup-friendly normalization. */
import { APP_URLS } from '../../shared/constants';
import { getStorage, setStorage } from '../../shared/storage';
import { asRecord } from '../../shared/records';
import type { AccessContext, LimitInfo, LimitInfoItem, StoredLimitInfo } from '../../shared/types';
import { createChatGptRequestHeaders } from './headersFactory';

const LIMIT_PERCENT_PRECISION = 1;
const DEFAULT_LIMIT_ID = 'codex';

interface UsageRateLimitWindow {
  usedPercent: number;
  windowDurationMins: number | null;
  resetsAt: number;
}

interface UsageRateLimitSnapshot {
  limitId: string;
  limitName: string;
  primary: UsageRateLimitWindow | null;
  secondary: UsageRateLimitWindow | null;
}

/** Refreshes stored usage limits while preserving the previous value on failures. */
export async function refreshStoredLimitInfo(accessContext: AccessContext): Promise<StoredLimitInfo> {
  try {
    return await fetchAndStoreLimitInfo(accessContext);
  } catch (error) {
    console.warn('Unable to refresh ChatGPT limit info.', error);
    return (await getStorage('catalog')).catalog?.limitInfo || null;
  }
}

/** Fetches usage limits and stores the normalized payload with a timestamp. */
export async function fetchAndStoreLimitInfo(accessContext: AccessContext): Promise<LimitInfo> {
  const limitInfo = await fetchLimitInfo(accessContext);
  const { catalog = {} } = await getStorage('catalog');
  await setStorage({
    catalog: {
      ...catalog,
      limitInfo,
      limitInfoUpdatedAt: Date.now()
    }
  });
  return limitInfo;
}

/** Fetches current usage limits from ChatGPT. */
export async function fetchLimitInfo(accessContext: AccessContext): Promise<LimitInfo> {
  const response = await fetch(APP_URLS.chatgptUsage, {
    method: 'GET',
    headers: createChatGptRequestHeaders(accessContext, 'application/json', false)
  });

  if (!response.ok) {
    throw new Error(`ChatGPT limit check failed with status ${response.status}.`);
  }

  return createLimitInfoPayload(await response.json());
}

/** Normalizes current and legacy stored usage-limit shapes for rendering. */
export function normalizeLimitInfo(limitInfo: StoredLimitInfo): LimitInfo | null {
  if (!limitInfo || typeof limitInfo !== 'object') {
    return null;
  }

  const data = asRecord(limitInfo);
  const planName = normalizePlanName(
    data.planName
    || data.plan
    || data.planType
    || data.subscriptionPlan
  );
  const items = Array.isArray(data.items)
    ? data.items.map(normalizeLimitInfoItem).filter((item): item is LimitInfoItem => item !== null)
    : [];

  if (items.length > 0 || planName) {
    return {
      planName,
      items
    };
  }

  return normalizeLegacyLimitInfo(data);
}

/** Checks whether a usage-limit payload has any UI-renderable data. */
export function hasRenderableLimitInfo(limitInfo: LimitInfo | null): boolean {
  return Boolean(limitInfo?.planName) || (Array.isArray(limitInfo?.items) && limitInfo.items.length > 0);
}

/** Parses raw ChatGPT usage windows into internal snapshots. */
function parseUsageRateLimitPayload(payload: unknown): UsageRateLimitSnapshot[] {
  const data = asRecord(payload);
  const snapshots: UsageRateLimitSnapshot[] = [
    createUsageRateLimitSnapshot({
      limitId: DEFAULT_LIMIT_ID,
      limitName: '',
      rateLimit: asRecord(data.rate_limit)
    })
  ];

  const additional = Array.isArray(data.additional_rate_limits) ? data.additional_rate_limits : [];
  for (const item of additional) {
    const entry = asRecord(item);
    let limitId = '';
    if (typeof entry.metered_feature === 'string') {
      limitId = entry.metered_feature;
    } else if (typeof entry.limit_name === 'string') {
      limitId = entry.limit_name;
    }
    snapshots.push(createUsageRateLimitSnapshot({
      limitId,
      limitName: typeof entry.limit_name === 'string' ? entry.limit_name : '',
      rateLimit: asRecord(entry.rate_limit)
    }));
  }

  const codeReviewSnapshot = createUsageRateLimitSnapshot({
    limitId: 'code_review',
    limitName: 'Code Review',
    rateLimit: asRecord(data.code_review_rate_limit)
  });
  if (hasRateLimitSnapshotData(codeReviewSnapshot)) {
    snapshots.push(codeReviewSnapshot);
  }

  return snapshots;
}

/** Creates a normalized usage snapshot from a raw rate-limit object. */
function createUsageRateLimitSnapshot({
  limitId,
  limitName,
  rateLimit
}: {
  limitId: string;
  limitName: string;
  rateLimit: Record<string, unknown>;
}): UsageRateLimitSnapshot {
  return {
    limitId: normalizeLimitId(limitId || DEFAULT_LIMIT_ID),
    limitName: normalizeOptionalString(limitName),
    primary: parseUsageRateLimitWindow(asRecord(rateLimit.primary_window)),
    secondary: parseUsageRateLimitWindow(asRecord(rateLimit.secondary_window))
  };
}

/** Parses one rate-limit window when reset and usage data are present. */
function parseUsageRateLimitWindow(window: Record<string, unknown>): UsageRateLimitWindow | null {
  const usedPercent = tryGetNumber(window.used_percent);
  const windowDurationMins = tryGetWindowDurationMins(window);
  const resetsAt = tryGetInt(window.reset_at);
  const hasData = usedPercent != null || windowDurationMins != null || resetsAt != null;

  if (!hasData || resetsAt == null) {
    return null;
  }

  return {
    usedPercent: roundLimitPercent(Math.max(0, usedPercent ?? 0)),
    windowDurationMins,
    resetsAt
  };
}

/** Returns whether a usage snapshot contains at least one visible window. */
function hasRateLimitSnapshotData(snapshot: UsageRateLimitSnapshot): boolean {
  return Boolean(snapshot.primary || snapshot.secondary);
}

/** Converts a raw ChatGPT usage payload into popup-ready limit info. */
function createLimitInfoPayload(payload: unknown): LimitInfo {
  return {
    planName: extractPlanName(payload),
    items: createLimitInfoItems(parseUsageRateLimitPayload(payload))
  };
}

/** Creates renderable limit rows from normalized usage snapshots. */
function createLimitInfoItems(snapshots: UsageRateLimitSnapshot[]): LimitInfoItem[] {
  const items: LimitInfoItem[] = [];
  for (const snapshot of snapshots) {
    if (!hasRateLimitSnapshotData(snapshot)) {
      continue;
    }

    if (snapshot.primary) {
      items.push(createLimitInfoItem(snapshot, snapshot.primary, 'primary'));
    }

    if (snapshot.secondary) {
      items.push(createLimitInfoItem(snapshot, snapshot.secondary, 'secondary'));
    }
  }

  return items;
}

/** Converts one usage window into a stable limit row. */
function createLimitInfoItem(
  snapshot: UsageRateLimitSnapshot,
  window: UsageRateLimitWindow,
  windowType: 'primary' | 'secondary'
): LimitInfoItem {
  const usedPercent = roundLimitPercent(Math.max(0, window.usedPercent));
  const leftPercent = roundLimitPercent(Math.max(0, 100 - usedPercent));
  return {
    id: `${snapshot.limitId || DEFAULT_LIMIT_ID}:${window.windowDurationMins ?? 0}:${windowType}`,
    featureLabel: getLimitDisplayName(snapshot),
    windowLabel: getLimitWindowLabel(window.windowDurationMins),
    leftPercent,
    usedPercent,
    resetsAt: window.resetsAt,
    windowDurationMins: window.windowDurationMins ?? 0,
    limitId: snapshot.limitId || DEFAULT_LIMIT_ID
  };
}

/** Formats usage window duration into a compact display label. */
function getLimitWindowLabel(windowDurationMins: number | null): string {
  if (windowDurationMins && windowDurationMins > 0) {
    if (windowDurationMins % 1440 === 0) {
      return `${windowDurationMins / 1440}d`;
    }

    if (windowDurationMins % 60 === 0) {
      return `${windowDurationMins / 60}h`;
    }

    return `${windowDurationMins}m`;
  }

  return '';
}

/** Chooses a user-facing display name for a usage snapshot. */
function getLimitDisplayName(snapshot: UsageRateLimitSnapshot): string {
  if (snapshot.limitName) {
    return snapshot.limitName;
  }

  if (!snapshot.limitId || snapshot.limitId === DEFAULT_LIMIT_ID) {
    return '';
  }

  return prettifyLimitId(snapshot.limitId);
}

/** Converts machine-readable limit ids into display labels. */
function prettifyLimitId(value: string): string {
  return String(value || DEFAULT_LIMIT_ID)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase()) || 'Limit';
}

/** Normalizes feature ids for comparison and stable row ids. */
function normalizeLimitId(value: unknown): string {
  return String(value || DEFAULT_LIMIT_ID).trim().toLowerCase().replace(/-/g, '_') || DEFAULT_LIMIT_ID;
}

/** Normalizes optional strings from unknown API fields. */
function normalizeOptionalString(value: unknown): string {
  return String(value || '').trim();
}

/** Converts ChatGPT limit-window seconds into rounded minutes. */
function tryGetWindowDurationMins(window: Record<string, unknown>): number | null {
  const rawSeconds = tryGetInt(window.limit_window_seconds);
  if (rawSeconds == null || rawSeconds <= 0) {
    return null;
  }

  return Math.ceil(rawSeconds / 60);
}

/** Parses integer-like values from usage payload fields. */
function tryGetInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  }

  return null;
}

/** Parses numeric usage values from unknown payload fields. */
function tryGetNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

/** Applies display precision to usage percentages. */
function roundLimitPercent(value: number): number {
  return Number(value.toFixed(LIMIT_PERCENT_PRECISION));
}

/** Converts older stored limit payloads into the current renderable shape. */
function normalizeLegacyLimitInfo(limitInfo: Record<string, unknown>): LimitInfo | null {
  const leftPercent = tryGetNumber(limitInfo.leftPercent);
  const resetsAt = tryGetInt(limitInfo.resetsAt);
  const windowDurationMins = tryGetInt(limitInfo.windowDurationMins);
  if (leftPercent == null || resetsAt == null || windowDurationMins == null) {
    return null;
  }

  const item = normalizeLimitInfoItem({
    id: `${DEFAULT_LIMIT_ID}:${windowDurationMins}:legacy`,
    featureLabel: typeof limitInfo.label === 'string' ? limitInfo.label : prettifyLimitId(DEFAULT_LIMIT_ID),
    windowLabel: getLimitWindowLabel(windowDurationMins),
    leftPercent,
    usedPercent: tryGetNumber(limitInfo.usedPercent) ?? Math.max(0, 100 - leftPercent),
    resetsAt,
    windowDurationMins,
    limitId: DEFAULT_LIMIT_ID
  });

  if (!item) {
    return null;
  }

  return {
    planName: '',
    items: [item]
  };
}

/** Validates and normalizes a stored limit row. */
function normalizeLimitInfoItem(item: unknown): LimitInfoItem | null {
  const data = asRecord(item);
  const leftPercent = tryGetNumber(data.leftPercent);
  const resetsAt = tryGetInt(data.resetsAt);
  const windowDurationMins = tryGetInt(data.windowDurationMins);
  if (leftPercent == null || resetsAt == null || windowDurationMins == null) {
    return null;
  }

  const normalizedLimitId = normalizeLimitId(data.limitId);
  let featureLabel = normalizeOptionalString(data.featureLabel);
  if (normalizedLimitId === DEFAULT_LIMIT_ID && featureLabel.toLowerCase() === prettifyLimitId(DEFAULT_LIMIT_ID).toLowerCase()) {
    featureLabel = '';
  }

  return {
    id: normalizeOptionalString(data.id) || `${DEFAULT_LIMIT_ID}:${windowDurationMins}:item`,
    featureLabel: featureLabel || (normalizedLimitId === DEFAULT_LIMIT_ID ? '' : prettifyLimitId(normalizedLimitId)),
    windowLabel: normalizeOptionalString(data.windowLabel) || getLimitWindowLabel(windowDurationMins),
    leftPercent: roundLimitPercent(leftPercent),
    usedPercent: roundLimitPercent(tryGetNumber(data.usedPercent) ?? Math.max(0, 100 - leftPercent)),
    resetsAt,
    windowDurationMins,
    limitId: normalizedLimitId
  };
}

/** Extracts a subscription plan label from known and nested payload locations. */
function extractPlanName(payload: unknown): string {
  const data = asRecord(payload);
  const directCandidates = [
    data.plan,
    data.plan_name,
    data.plan_type,
    data.planType,
    data.subscription_plan,
    data.subscriptionPlan,
    data.subscription_tier,
    data.subscriptionTier,
    data.account_plan,
    data.accountPlan,
    data.tier,
    asRecord(data.workspace).plan,
    asRecord(data.workspace).plan_name,
    asRecord(data.organization).plan,
    asRecord(data.organization).plan_name,
    asRecord(data.account).plan,
    asRecord(data.subscription).plan,
    asRecord(data.user).plan
  ];

  for (const candidate of directCandidates) {
    const normalized = normalizePlanName(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return findPlanNameRecursively(payload);
}

/** Searches nested plan-like fields while bounding traversal depth. */
function findPlanNameRecursively(value: unknown, depth = 0): string {
  if (depth > 4 || value == null) {
    return '';
  }

  if (typeof value === 'string') {
    return normalizePlanName(value);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const normalized = findPlanNameRecursively(item, depth + 1);
      if (normalized) {
        return normalized;
      }
    }
    return '';
  }

  if (typeof value !== 'object') {
    return '';
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (!/(plan|tier|subscription)/i.test(key)) {
      continue;
    }

    const normalized = findPlanNameRecursively(nestedValue, depth + 1);
    if (normalized) {
      return normalized;
    }
  }

  return '';
}

/** Normalizes raw plan labels into a small display-friendly set. */
function normalizePlanName(value: unknown): string {
  const normalized = normalizeOptionalString(value).toLowerCase();
  if (!normalized) {
    return '';
  }

  const knownPlans = ['free', 'plus', 'pro', 'team', 'business', 'enterprise', 'edu'];
  const matchedKnownPlan = knownPlans.find((plan) => normalized === plan || normalized.includes(plan));
  if (matchedKnownPlan) {
    return matchedKnownPlan.charAt(0).toUpperCase() + matchedKnownPlan.slice(1);
  }

  if (!/(plan|tier|subscription)/i.test(normalized)) {
    return '';
  }

  return normalized
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}
