import * as mupdf from 'mupdf';

/**
 * Builds small PDFs in memory for tests, so the repo doesn't need binary fixtures
 * for the basics. Each page prints its label ("Page 1", or a custom prefix) so
 * tests can check page order by extracting text.
 */
export function makePdf(
  pageCount: number,
  options: { prefix?: string; width?: number; height?: number; password?: string } = {},
): Uint8Array {
  const { prefix = 'Page', width = 595, height = 842 } = options;
  const doc = new mupdf.PDFDocument();
  const font = doc.addSimpleFont(new mupdf.Font('Helvetica'));
  for (let i = 0; i < pageCount; i++) {
    const label = `${prefix} ${i + 1}`;
    const contents = `BT /F1 24 Tf 72 ${height - 96} Td (${label}) Tj ET`;
    const page = doc.addPage([0, 0, width, height], 0, { Font: { F1: font } }, contents);
    doc.insertPage(-1, page);
  }
  const opts = options.password
    ? `encrypt=aes-256,user-password=${options.password},owner-password=${options.password}-owner`
    : 'compress=yes';
  const buffer = doc.saveToBuffer(opts);
  const bytes = new Uint8Array(buffer.asUint8Array());
  buffer.destroy();
  doc.destroy();
  return bytes;
}

/** Text of every page, in order — the simplest way to assert page order. */
export function pageTexts(bytes: Uint8Array): string[] {
  const doc = mupdf.Document.openDocument(bytes, 'application/pdf');
  const out: string[] = [];
  for (let i = 0; i < doc.countPages(); i++) {
    const page = doc.loadPage(i);
    const text = page.toStructuredText('preserve-whitespace').asText().trim();
    out.push(text);
    page.destroy();
  }
  doc.destroy();
  return out;
}
