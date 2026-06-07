/** Typed popup DOM lookup helpers. */
/** Returns a required popup element by id. */
export function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing popup element: ${id}`);
  }
  return element;
}

/** Returns a required popup button by id. */
export function requireButton(id: string): HTMLButtonElement {
  const element = requireElement(id);
  if (!(element instanceof HTMLButtonElement)) {
    throw new Error(`Popup element is not a button: ${id}`);
  }
  return element;
}

/** Returns a required popup select by id. */
export function requireSelect(id: string): HTMLSelectElement {
  const element = requireElement(id);
  if (!(element instanceof HTMLSelectElement)) {
    throw new Error(`Popup element is not a select: ${id}`);
  }
  return element;
}

/** Returns a required popup text-like input by id. */
export function requireInput(id: string): HTMLInputElement {
  const element = requireElement(id);
  if (!(element instanceof HTMLInputElement)) {
    throw new Error(`Popup element is not an input: ${id}`);
  }
  return element;
}

/** Returns a required popup file input by id. */
export function requireFileInput(id: string): HTMLInputElement {
  const element = requireElement(id);
  if (!(element instanceof HTMLInputElement) || element.type !== 'file') {
    throw new Error(`Popup element is not a file input: ${id}`);
  }
  return element;
}
