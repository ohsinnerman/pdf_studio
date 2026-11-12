import { describe, expect, it } from 'vitest';
import {
  CSS_PX_PER_POINT,
  MAX_CANVAS_PIXELS,
  fromMuRect,
  invertMatrix,
  applyMatrix,
  mmToPoints,
  pagePoint,
  pageRect,
  pageRectToScreen,
  pageToPdf,
  pageToScreen,
  pdfPoint,
  pdfToPage,
  pointsToMm,
  rectContains,
  rectFromPoints,
  rectsIntersect,
  renderScale,
  screenPoint,
  screenToPage,
  simplePageTransform,
  toMuRect,
} from './coords.ts';

const A4 = { width: 595.276, height: 841.89 };

describe('units', () => {
  it('shows a page at printed size at 100% zoom', () => {
    expect(CSS_PX_PER_POINT).toBeCloseTo(4 / 3);
  });
  it('converts A4 width to 210 mm', () => {
    expect(pointsToMm(A4.width)).toBeCloseTo(210, 1);
    expect(mmToPoints(297)).toBeCloseTo(A4.height, 1);
  });
});

describe('page <-> screen', () => {
  it('round-trips points at any zoom', () => {
    for (const zoom of [0.25, 1, 1.5, 4]) {
      const p = pagePoint(123.4, 567.8);
      const back = screenToPage(pageToScreen(p, zoom), zoom);
      expect(back.x).toBeCloseTo(p.x);
      expect(back.y).toBeCloseTo(p.y);
    }
  });
  it('scales by zoom × 4/3', () => {
    expect(pageToScreen(pagePoint(72, 72), 2)).toEqual(screenPoint(192, 192));
  });
  it('scales rects', () => {
    expect(pageRectToScreen(pageRect(0, 0, 72, 36), 1)).toEqual({ x: 0, y: 0, width: 96, height: 48 });
  });
  it('rejects non-positive zoom', () => {
    expect(() => pageToScreen(pagePoint(1, 1), 0)).toThrow(RangeError);
  });
});

describe('renderScale', () => {
  it('multiplies by devicePixelRatio for sharp output', () => {
    expect(renderScale(A4, 1, 1.5)).toBeCloseTo(CSS_PX_PER_POINT * 1.5);
  });
  it('never renders below 1 device pixel per CSS pixel', () => {
    expect(renderScale(A4, 1, 0.5)).toBeCloseTo(CSS_PX_PER_POINT);
  });
  it('caps huge renders below the canvas limit', () => {
    const s = renderScale(A4, 8, 2);
    expect(A4.width * s * (A4.height * s)).toBeLessThanOrEqual(MAX_CANVAS_PIXELS + 1);
  });
});

describe('rects', () => {
  it('builds a rect from corners in any order', () => {
    expect(rectFromPoints(pagePoint(10, 50), pagePoint(2, 5))).toEqual({ x: 2, y: 5, width: 8, height: 45 });
  });
  it('round-trips MuPDF rects', () => {
    const r = pageRect(1, 2, 3, 4);
    expect(fromMuRect(toMuRect(r))).toEqual(r);
  });
  it('tests containment and intersection', () => {
    const r = pageRect(0, 0, 10, 10);
    expect(rectContains(r, { x: 5, y: 5 })).toBe(true);
    expect(rectContains(r, { x: 11, y: 5 })).toBe(false);
    expect(rectsIntersect(r, pageRect(9, 9, 5, 5))).toBe(true);
    expect(rectsIntersect(r, pageRect(10, 10, 5, 5))).toBe(false);
  });
});

describe('PDF user space <-> page space', () => {
  const { width: w, height: h } = A4;

  it('inverts matrices', () => {
    const m = simplePageTransform(w, h, 90);
    const p = applyMatrix(invertMatrix(m), applyMatrix(m, { x: 12, y: 34 }));
    expect(p.x).toBeCloseTo(12);
    expect(p.y).toBeCloseTo(34);
  });

  it('flips y on an unrotated page: PDF bottom-left is page bottom-left', () => {
    const t = simplePageTransform(w, h, 0);
    expect(pdfToPage(pdfPoint(0, 0), t)).toEqual({ x: 0, y: h });
    expect(pdfToPage(pdfPoint(0, h), t)).toEqual({ x: 0, y: 0 });
  });

  it.each([0, 90, 180, 270] as const)('round-trips at rotation %i', (rot) => {
    const t = simplePageTransform(w, h, rot);
    const p = pagePoint(100, 200);
    const back = pdfToPage(pageToPdf(p, t), t);
    expect(back.x).toBeCloseTo(p.x);
    expect(back.y).toBeCloseTo(p.y);
  });

  it('maps all four MediaBox corners onto the rotated page box', () => {
    for (const rot of [0, 90, 180, 270] as const) {
      const t = simplePageTransform(w, h, rot);
      const [pw, ph] = rot % 180 === 0 ? [w, h] : [h, w];
      for (const corner of [pdfPoint(0, 0), pdfPoint(w, 0), pdfPoint(0, h), pdfPoint(w, h)]) {
        const p = pdfToPage(corner, t);
        expect(p.x).toBeGreaterThanOrEqual(-1e-9);
        expect(p.y).toBeGreaterThanOrEqual(-1e-9);
        expect(p.x).toBeLessThanOrEqual(pw + 1e-9);
        expect(p.y).toBeLessThanOrEqual(ph + 1e-9);
      }
    }
  });
});
