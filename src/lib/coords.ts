/**
 * Coordinate spaces — the ONLY place that converts between them.
 *
 * There are three spaces in this app. Mixing them up is the #1 bug in PDF editors,
 * so each one has its own branded type and the compiler refuses to mix them.
 *
 * 1. PDF user space (`PdfPoint`)
 *    Raw coordinates stored inside PDF objects. Unit: points (1/72 inch).
 *    Origin bottom-left of the MediaBox, y grows UP, page /Rotate not applied.
 *    We only meet this space when touching PDF objects directly.
 *
 * 2. Page space (`PagePoint`)
 *    What MuPDF hands us for pages, text and annotation rects. Unit: points.
 *    Origin top-left of the visible page, y grows DOWN, rotation and CropBox
 *    already applied. Almost all app logic works here.
 *
 * 3. Screen space (`ScreenPoint`)
 *    CSS pixels relative to the top-left of a rendered page element.
 *    Page space × zoom × (96 / 72).
 *
 * Conversion between 1 and 2 is a matrix the engine gives us per page
 * (`page.getTransform()` in MuPDF), applied with `applyMatrix`.
 */

// ---------- Branded types ----------

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

interface XY {
  readonly x: number;
  readonly y: number;
}
interface XYWH {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type PdfPoint = Brand<XY, 'pdf'>;
export type PagePoint = Brand<XY, 'page'>;
export type ScreenPoint = Brand<XY, 'screen'>;

export type PageRect = Brand<XYWH, 'page'>;
export type ScreenRect = Brand<XYWH, 'screen'>;

export const pdfPoint = (x: number, y: number) => ({ x, y }) as PdfPoint;
export const pagePoint = (x: number, y: number) => ({ x, y }) as PagePoint;
export const screenPoint = (x: number, y: number) => ({ x, y }) as ScreenPoint;
export const pageRect = (x: number, y: number, width: number, height: number) =>
  ({ x, y, width, height }) as PageRect;
export const screenRect = (x: number, y: number, width: number, height: number) =>
  ({ x, y, width, height }) as ScreenRect;

// ---------- Units ----------

/** Points per inch in PDF. */
export const POINTS_PER_INCH = 72;
/** CSS pixels per inch (fixed by the CSS spec, regardless of the physical screen). */
export const CSS_PX_PER_INCH = 96;
/** At zoom 1 (100%), one point is this many CSS pixels: a page shows at its real printed size. */
export const CSS_PX_PER_POINT = CSS_PX_PER_INCH / POINTS_PER_INCH;

export const pointsToMm = (pt: number) => (pt / POINTS_PER_INCH) * 25.4;
export const mmToPoints = (mm: number) => (mm / 25.4) * POINTS_PER_INCH;

// ---------- Page space <-> screen space ----------

/** CSS pixels per point at a given zoom (1 = 100%). */
export function cssScale(zoom: number): number {
  if (!(zoom > 0)) throw new RangeError(`zoom must be > 0, got ${zoom}`);
  return zoom * CSS_PX_PER_POINT;
}

export function pageToScreen(p: PagePoint, zoom: number): ScreenPoint {
  const s = cssScale(zoom);
  return screenPoint(p.x * s, p.y * s);
}

export function screenToPage(p: ScreenPoint, zoom: number): PagePoint {
  const s = cssScale(zoom);
  return pagePoint(p.x / s, p.y / s);
}

export function pageRectToScreen(r: PageRect, zoom: number): ScreenRect {
  const s = cssScale(zoom);
  return screenRect(r.x * s, r.y * s, r.width * s, r.height * s);
}

export function screenRectToPage(r: ScreenRect, zoom: number): PageRect {
  const s = cssScale(zoom);
  return pageRect(r.x / s, r.y / s, r.width / s, r.height / s);
}

/** Size in CSS pixels of a page that is `width × height` points. */
export function pageSizeOnScreen(size: { width: number; height: number }, zoom: number) {
  const s = cssScale(zoom);
  return { width: size.width * s, height: size.height * s };
}

// ---------- Render resolution ----------

/** Browsers cap canvas size; stay well below the smallest common limit. */
export const MAX_CANVAS_PIXELS = 16_777_216; // 4096 × 4096

/**
 * The scale (device pixels per point) to render a page at, so it is sharp on
 * high-DPI screens: zoom × 96/72 × devicePixelRatio.
 *
 * If the bitmap would exceed MAX_CANVAS_PIXELS, the scale is reduced to fit;
 * the result is then slightly soft until tiled rendering lands (Phase 3).
 */
export function renderScale(
  size: { width: number; height: number },
  zoom: number,
  devicePixelRatio: number,
): number {
  const ideal = cssScale(zoom) * Math.max(1, devicePixelRatio);
  const pixels = size.width * ideal * (size.height * ideal);
  if (pixels <= MAX_CANVAS_PIXELS) return ideal;
  return Math.sqrt(MAX_CANVAS_PIXELS / (size.width * size.height));
}

// ---------- Rects ----------

/** Rect from two corners in any order (e.g. a drag from bottom-right to top-left). */
export function rectFromPoints(a: PagePoint, b: PagePoint): PageRect {
  return pageRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/** MuPDF rects are [x0, y0, x1, y1]. */
export type MuRect = readonly [number, number, number, number];

export function fromMuRect([x0, y0, x1, y1]: MuRect): PageRect {
  return pageRect(x0, y0, x1 - x0, y1 - y0);
}

export function toMuRect(r: PageRect): MuRect {
  return [r.x, r.y, r.x + r.width, r.y + r.height];
}

export function rectContains(r: XYWH, p: XY): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}

export function rectsIntersect(a: XYWH, b: XYWH): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

// ---------- PDF user space <-> page space ----------

/** Affine matrix [a, b, c, d, e, f], the same layout PDF and MuPDF use. */
export type Matrix = readonly [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export function applyMatrix(m: Matrix, p: XY): XY {
  const [a, b, c, d, e, f] = m;
  return { x: p.x * a + p.y * c + e, y: p.x * b + p.y * d + f };
}

export function invertMatrix(m: Matrix): Matrix {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  if (det === 0) throw new Error('Matrix is not invertible');
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

/** PDF user space -> page space, given the page's transform from the engine. */
export function pdfToPage(p: PdfPoint, pageTransform: Matrix): PagePoint {
  const { x, y } = applyMatrix(pageTransform, p);
  return pagePoint(x, y);
}

/** Page space -> PDF user space, given the page's transform from the engine. */
export function pageToPdf(p: PagePoint, pageTransform: Matrix): PdfPoint {
  const { x, y } = applyMatrix(invertMatrix(pageTransform), p);
  return pdfPoint(x, y);
}

/**
 * The page transform for a simple page: MediaBox [0 0 w h] with a /Rotate.
 * Real pages should use the engine's transform; this exists for tests and as
 * documentation of what the transform does.
 */
export function simplePageTransform(width: number, height: number, rotate: 0 | 90 | 180 | 270): Matrix {
  switch (rotate) {
    case 0:
      return [1, 0, 0, -1, 0, height]; // flip y
    case 90:
      return [0, 1, 1, 0, 0, 0]; // swap axes
    case 180:
      return [-1, 0, 0, 1, width, 0]; // flip x
    case 270:
      return [0, -1, -1, 0, height, width];
  }
}
