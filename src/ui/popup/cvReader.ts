import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { EXTENSION_PATHS, getExtensionUrl } from '../../shared/constants';
import { sanitizeCvText } from './formatters';

export const MAX_CV_TEXT_CHARS = 60_000;

GlobalWorkerOptions.workerSrc = getExtensionUrl(EXTENSION_PATHS.pdfWorker);

/** Reads supported CV files and returns extracted plain text. */
export async function extractCvText(file: File): Promise<string> {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith('.pdf') || file.type === 'application/pdf') {
    return extractTextFromPdfBuffer(await file.arrayBuffer());
  }

  throw new Error('Unsupported CV file type. Use PDF only.');
}

/** Extracts readable text from every PDF page using the bundled PDF.js worker. */
async function extractTextFromPdfBuffer(buffer: ArrayBuffer): Promise<string> {
  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
    useWorkerFetch: false
  });
  const pdf = await loadingTask.promise;
  try {
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(textContentToPlainText(content.items));
      page.cleanup();
    }
    return sanitizeCvText(pages.join('\n\n'));
  } finally {
    await pdf.destroy();
  }
}

/** Converts PDF.js text-content items into a plain-text approximation. */
function textContentToPlainText(items: unknown[]): string {
  let text = '';
  for (const item of items) {
    if (!item || typeof item !== 'object' || !('str' in item)) {
      continue;
    }

    const textItem = item as { str?: unknown; hasEOL?: unknown };
    const value = typeof textItem.str === 'string' ? textItem.str : '';
    if (value) {
      text += value;
    }
    text += textItem.hasEOL ? '\n' : ' ';
  }
  return text;
}
