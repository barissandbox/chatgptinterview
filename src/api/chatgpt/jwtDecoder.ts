/** JWT claim helpers used by ChatGPT auth and account scoping. */
import { asRecord } from '../../shared/records';

/** Reads a nested string claim from a JWT payload without validating the signature. */
export function readJwtClaim(token: string | undefined, path: string[]): string | null {
  if (!token || !Array.isArray(path)) {
    return null;
  }

  const parts = token.split('.');
  if (parts.length < 2) {
    return null;
  }

  try {
    const tokenPayloadPart = parts[1];
    if (!tokenPayloadPart) {
      return null;
    }

    const payload = JSON.parse(atob(
      tokenPayloadPart
        .replace(/-/g, '+')
        .replace(/_/g, '/')
        .padEnd(Math.ceil(tokenPayloadPart.length / 4) * 4, '=')
    )) as Record<string, unknown>;

    let current: unknown = payload;
    for (const key of path) {
      current = asRecord(current)[key];
      if (current == null) {
        return null;
      }
    }
    return typeof current === 'string' ? current : null;
  } catch {
    return null;
  }
}
