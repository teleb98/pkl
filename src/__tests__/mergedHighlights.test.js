import { describe, it, expect, beforeEach } from 'vitest';

/* ────────────────────────────────────────────────────────────────
   PDF 형광펜 주석(pkl_annot_<bookId>, 좌표 기반)이 텍스트 선택 하이라이트
   (pkl_highlights)와 별개 저장소라 검색·내보내기·AI·백업 어디에도 노출되지
   않던 문제 — getAllHighlightsByBook/getAllHighlightsMerged 로 통합 조회.
   ─────────────────────────────────────────────────────────────── */

import {
  addHighlight, addPdfAnnotation,
  getAllHighlightsByBook, getAllPdfAnnotations, getAllHighlightsMerged,
} from '../store.js';

beforeEach(() => {
  localStorage.clear();
});

describe('getAllHighlightsByBook', () => {
  it('텍스트 하이라이트 + PDF 형광펜을 함께 반환', () => {
    addHighlight({ bookId: 'b1', text: '텍스트 선택 하이라이트', page: 3 });
    addPdfAnnotation({ bookId: 'b1', pageNum: 5, rects: [{ x: 0, y: 0, w: 10, h: 10 }], text: '형광펜으로 그은 부분' });

    const merged = getAllHighlightsByBook('b1');
    expect(merged).toHaveLength(2);
    expect(merged.some(h => h.text === '텍스트 선택 하이라이트')).toBe(true);
    expect(merged.some(h => h.text === '형광펜으로 그은 부분')).toBe(true);
  });

  it('PDF 형광펜은 pageNum → page 로 매핑되고 isPdfAnnotation 플래그가 붙는다', () => {
    addPdfAnnotation({ bookId: 'b1', pageNum: 7, rects: [], color: '#FFD54F', text: '발췌' });
    const [h] = getAllHighlightsByBook('b1');
    expect(h.page).toBe(7);
    expect(h.color).toBe('#FFD54F');
    expect(h.isPdfAnnotation).toBe(true);
    expect(h.id).toMatch(/^annot-/);
  });

  it('텍스트 없는 형광펜은 안내 placeholder 로 대체(빈 문자열 노출 방지)', () => {
    addPdfAnnotation({ bookId: 'b1', pageNum: 1, rects: [] }); // text 기본값 ''
    const [h] = getAllHighlightsByBook('b1');
    expect(h.text).toBe('(PDF 형광펜 — 텍스트 없음)');
  });

  it('다른 책의 항목은 섞이지 않음', () => {
    addHighlight({ bookId: 'b1', text: 'A책 하이라이트' });
    addPdfAnnotation({ bookId: 'b2', pageNum: 1, rects: [], text: 'B책 형광펜' });
    expect(getAllHighlightsByBook('b1')).toHaveLength(1);
    expect(getAllHighlightsByBook('b2')).toHaveLength(1);
  });

  it('둘 다 없으면 빈 배열', () => {
    expect(getAllHighlightsByBook('empty-book')).toEqual([]);
  });
});

describe('getAllPdfAnnotations — 전체 책의 형광펜', () => {
  it('여러 책에 흩어진 pkl_annot_* 키를 모두 수집', () => {
    addPdfAnnotation({ bookId: 'b1', pageNum: 1, rects: [], text: 'x' });
    addPdfAnnotation({ bookId: 'b2', pageNum: 2, rects: [], text: 'y' });
    addPdfAnnotation({ bookId: 'b2', pageNum: 3, rects: [], text: 'z' });
    const all = getAllPdfAnnotations();
    expect(all).toHaveLength(3);
  });

  it('관련 없는 localStorage 키는 무시', () => {
    localStorage.setItem('pkl_book_index', '[]');
    localStorage.setItem('unrelated_key', 'not json{{{');
    addPdfAnnotation({ bookId: 'b1', pageNum: 1, rects: [], text: 'x' });
    expect(getAllPdfAnnotations()).toHaveLength(1);
  });

  it('손상된 주석 JSON 이 있어도 크래시 없이 나머지는 반환', () => {
    localStorage.setItem('pkl_annot_broken', 'not-json{{{');
    addPdfAnnotation({ bookId: 'b1', pageNum: 1, rects: [], text: '정상' });
    expect(() => getAllPdfAnnotations()).not.toThrow();
    expect(getAllPdfAnnotations().some(a => a.text === '정상')).toBe(true);
  });
});

describe('getAllHighlightsMerged — 검색 화면용 전체 통합', () => {
  it('모든 책의 텍스트 하이라이트 + PDF 형광펜을 하나로 합침', () => {
    addHighlight({ bookId: 'b1', text: 'HL1' });
    addHighlight({ bookId: 'b2', text: 'HL2' });
    addPdfAnnotation({ bookId: 'b1', pageNum: 1, rects: [], text: 'ANNOT1' });
    const merged = getAllHighlightsMerged();
    expect(merged).toHaveLength(3);
    expect(merged.map(h => h.text).sort()).toEqual(['ANNOT1', 'HL1', 'HL2']);
  });
});
