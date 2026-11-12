import { describe, expect, it } from 'vitest';
import { baseName, withPdfExtension } from './api.ts';

describe('baseName', () => {
  it('handles Windows and POSIX paths', () => {
    expect(baseName('C:\\Users\\akki\\Documents\\report.pdf')).toBe('report.pdf');
    expect(baseName('/home/akki/report.pdf')).toBe('report.pdf');
    expect(baseName('report.pdf')).toBe('report.pdf');
  });
});

describe('withPdfExtension', () => {
  it('adds .pdf only when missing', () => {
    expect(withPdfExtension('report')).toBe('report.pdf');
    expect(withPdfExtension('report.pdf')).toBe('report.pdf');
    expect(withPdfExtension('REPORT.PDF')).toBe('REPORT.PDF');
    expect(withPdfExtension('report.v2')).toBe('report.v2.pdf');
  });
});
