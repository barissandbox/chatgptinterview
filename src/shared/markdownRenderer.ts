/** Small markdown helpers for assistant responses. */

/** Renders a constrained markdown subset using DOM nodes instead of raw HTML. */
export function renderMarkdown(container: HTMLElement, markdown: string): void {
  container.innerHTML = '';
  const text = markdown.trim();
  if (!text) {
    return;
  }

  const blocks = text.split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split('\n');
    if (lines.every((line) => /^\s*[-*]\s+/.test(line))) {
      const list = document.createElement('ul');
      for (const line of lines) {
        const item = document.createElement('li');
        appendInlineMarkdown(item, line.replace(/^\s*[-*]\s+/, ''));
        list.appendChild(item);
      }
      container.appendChild(list);
      continue;
    }

    if (lines.every((line) => /^\s*\d+[.)]\s+/.test(line))) {
      const list = document.createElement('ol');
      for (const line of lines) {
        const item = document.createElement('li');
        appendInlineMarkdown(item, line.replace(/^\s*\d+[.)]\s+/, ''));
        list.appendChild(item);
      }
      container.appendChild(list);
      continue;
    }

    const heading = block.match(/^\s{0,3}(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1]?.length === 1 ? 'h3' : 'h4';
      const element = document.createElement(level);
      appendInlineMarkdown(element, heading[2] || '');
      container.appendChild(element);
      continue;
    }

    const paragraph = document.createElement('p');
    appendInlineMarkdown(paragraph, block.replace(/\n/g, '\n'));
    container.appendChild(paragraph);
  }
}

/** Appends inline code and emphasis tokens while preserving text-node escaping. */
function appendInlineMarkdown(parent: HTMLElement, text: string): void {
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index || 0;
    if (index > cursor) {
      parent.appendChild(document.createTextNode(text.slice(cursor, index)));
    }

    const token = match[0];
    const element = document.createElement(token.startsWith('`') ? 'code' : 'strong');
    element.textContent = token.startsWith('`')
      ? token.slice(1, -1)
      : token.replace(/^\*\*?|\*\*?$/g, '');
    parent.appendChild(element);
    cursor = index + token.length;
  }

  if (cursor < text.length) {
    parent.appendChild(document.createTextNode(text.slice(cursor)));
  }
}
