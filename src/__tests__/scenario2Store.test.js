import { describe, it, expect, beforeEach } from 'vitest';
import {
  getFlashcards, saveFlashcards, addFlashcard, deleteFlashcard, markFlashcard,
  getVocabulary, saveVocabulary, addVocabularyEntry, deleteVocabularyEntry,
} from '../store.js';

beforeEach(() => localStorage.clear());

/* ── getFlashcards ───────────────────────────────────────── */
describe('getFlashcards', () => {
  it('returns empty array when no flashcards', () => {
    expect(getFlashcards('b1')).toEqual([]);
  });

  it('returns saved flashcards array', () => {
    const cards = [{ id: '1', q: '질문', a: '답변', known: false }];
    localStorage.setItem('pkl_flashcards_b1', JSON.stringify(cards));
    expect(getFlashcards('b1')).toEqual(cards);
  });

  it('returns empty array on invalid JSON', () => {
    localStorage.setItem('pkl_flashcards_b1', 'broken{');
    expect(getFlashcards('b1')).toEqual([]);
  });

  it('is isolated per book', () => {
    addFlashcard('bookA', { q: 'Q-A', a: 'A-A' });
    expect(getFlashcards('bookB')).toEqual([]);
    expect(getFlashcards('bookA')).toHaveLength(1);
  });
});

/* ── addFlashcard ────────────────────────────────────────── */
describe('addFlashcard', () => {
  it('adds a single flashcard with q/a fields', () => {
    const cards = addFlashcard('b1', { q: '질문1', a: '답변1' });
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ q: '질문1', a: '답변1', known: false });
  });

  it('appends to existing flashcards (does not overwrite)', () => {
    addFlashcard('b1', { q: 'Q1', a: 'A1' });
    addFlashcard('b1', { q: 'Q2', a: 'A2' });
    addFlashcard('b1', { q: 'Q3', a: 'A3' });
    expect(getFlashcards('b1')).toHaveLength(3);
  });

  it('generates a unique id for each card', () => {
    const c1 = addFlashcard('b1', { q: 'A', a: 'a' });
    const c2 = addFlashcard('b1', { q: 'B', a: 'b' });
    expect(c1[0].id).not.toBe(c2[1].id);
  });

  it('initializes known: false', () => {
    const cards = addFlashcard('b1', { q: 'Q', a: 'A' });
    expect(cards[0].known).toBe(false);
  });

  it('sets createdAt timestamp', () => {
    const cards = addFlashcard('b1', { q: 'Q', a: 'A' });
    expect(typeof cards[0].createdAt).toBe('number');
    expect(cards[0].createdAt).toBeGreaterThan(0);
  });
});

/* ── deleteFlashcard ─────────────────────────────────────── */
describe('deleteFlashcard', () => {
  it('removes specified flashcard', () => {
    const initial = addFlashcard('b1', { q: 'Q1', a: 'A1' });
    addFlashcard('b1', { q: 'Q2', a: 'A2' });
    const after = deleteFlashcard('b1', initial[0].id);
    expect(after).toHaveLength(1);
    expect(after[0].q).toBe('Q2');
  });

  it('does nothing when id does not exist', () => {
    addFlashcard('b1', { q: 'Q', a: 'A' });
    const after = deleteFlashcard('b1', 'nonexistent-id');
    expect(after).toHaveLength(1);
  });

  it('returns empty array after removing last card', () => {
    const cards = addFlashcard('b1', { q: 'Q', a: 'A' });
    const after = deleteFlashcard('b1', cards[0].id);
    expect(after).toEqual([]);
  });
});

/* ── markFlashcard ───────────────────────────────────────── */
describe('markFlashcard', () => {
  it('sets known: true on specified card', () => {
    const initial = addFlashcard('b1', { q: 'Q', a: 'A' });
    const after = markFlashcard('b1', initial[0].id, true);
    expect(after[0].known).toBe(true);
  });

  it('sets known: false to reset learning', () => {
    const initial = addFlashcard('b1', { q: 'Q', a: 'A' });
    markFlashcard('b1', initial[0].id, true);
    const after = markFlashcard('b1', initial[0].id, false);
    expect(after[0].known).toBe(false);
  });

  it('only affects target card; others unchanged', () => {
    const c1 = addFlashcard('b1', { q: 'Q1', a: 'A1' });
    const c2 = addFlashcard('b1', { q: 'Q2', a: 'A2' });
    markFlashcard('b1', c1[0].id, true);
    const cards = getFlashcards('b1');
    expect(cards.find(c => c.id === c1[0].id).known).toBe(true);
    expect(cards.find(c => c.id === c2[1].id).known).toBe(false);
  });

  it('preserves q/a fields when marking', () => {
    const initial = addFlashcard('b1', { q: 'Q', a: 'A' });
    const after = markFlashcard('b1', initial[0].id, true);
    expect(after[0]).toMatchObject({ q: 'Q', a: 'A', known: true });
  });
});

/* ── saveFlashcards ──────────────────────────────────────── */
describe('saveFlashcards', () => {
  it('persists a complete array of cards', () => {
    const cards = [
      { id: '1', q: 'Q1', a: 'A1', known: false },
      { id: '2', q: 'Q2', a: 'A2', known: true },
    ];
    saveFlashcards('b1', cards);
    expect(getFlashcards('b1')).toEqual(cards);
  });

  it('overwrites previous save', () => {
    saveFlashcards('b1', [{ id: '1', q: 'Old', a: 'old', known: false }]);
    saveFlashcards('b1', [{ id: '2', q: 'New', a: 'new', known: true }]);
    expect(getFlashcards('b1')[0].q).toBe('New');
  });

  it('saving empty array clears cards', () => {
    addFlashcard('b1', { q: 'Q', a: 'A' });
    saveFlashcards('b1', []);
    expect(getFlashcards('b1')).toEqual([]);
  });
});

/* ── getVocabulary ───────────────────────────────────────── */
describe('getVocabulary', () => {
  it('returns empty array initially', () => {
    expect(getVocabulary()).toEqual([]);
  });

  it('returns saved vocabulary list', () => {
    localStorage.setItem('pkl_vocabulary', JSON.stringify([{ word: 'test' }]));
    expect(getVocabulary()).toEqual([{ word: 'test' }]);
  });

  it('returns empty array on invalid JSON', () => {
    localStorage.setItem('pkl_vocabulary', 'broken-json{');
    expect(getVocabulary()).toEqual([]);
  });
});

/* ── addVocabularyEntry ──────────────────────────────────── */
describe('addVocabularyEntry', () => {
  it('adds a new word to vocabulary', () => {
    const entries = addVocabularyEntry({ word: 'ephemeral', definition: '일시적인', bookId: 'b1', bookTitle: '책1' });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ word: 'ephemeral', definition: '일시적인' });
  });

  it('prepends new word to existing list (latest first)', () => {
    addVocabularyEntry({ word: 'first', definition: '첫째' });
    addVocabularyEntry({ word: 'second', definition: '둘째' });
    const entries = getVocabulary();
    expect(entries[0].word).toBe('second');
    expect(entries[1].word).toBe('first');
  });

  it('does NOT add duplicate words (case-insensitive)', () => {
    addVocabularyEntry({ word: 'Hello', definition: '인사' });
    const entries = addVocabularyEntry({ word: 'hello', definition: '다른 정의' });
    expect(entries).toHaveLength(1);
    expect(entries[0].definition).toBe('인사'); // first one wins
  });

  it('stores bookId and bookTitle if provided', () => {
    const entries = addVocabularyEntry({ word: 'word', definition: 'def', bookId: 'b1', bookTitle: '내 책' });
    expect(entries[0]).toMatchObject({ bookId: 'b1', bookTitle: '내 책' });
  });

  it('handles missing bookId/bookTitle with empty strings', () => {
    const entries = addVocabularyEntry({ word: 'word', definition: 'def' });
    expect(entries[0]).toMatchObject({ bookId: '', bookTitle: '' });
  });

  it('generates unique id for each entry', () => {
    const e1 = addVocabularyEntry({ word: 'one', definition: 'd1' });
    const e2 = addVocabularyEntry({ word: 'two', definition: 'd2' });
    expect(e1[0].id).not.toBe(e2[0].id);
  });

  it('sets createdAt timestamp', () => {
    const entries = addVocabularyEntry({ word: 'word', definition: 'def' });
    expect(typeof entries[0].createdAt).toBe('number');
  });
});

/* ── deleteVocabularyEntry ───────────────────────────────── */
describe('deleteVocabularyEntry', () => {
  it('removes specified entry', () => {
    addVocabularyEntry({ word: 'one', definition: '1' });
    const before = addVocabularyEntry({ word: 'two', definition: '2' });
    const after = deleteVocabularyEntry(before[0].id);
    expect(after).toHaveLength(1);
    expect(after[0].word).toBe('one');
  });

  it('does nothing when id does not exist', () => {
    addVocabularyEntry({ word: 'word', definition: 'def' });
    const after = deleteVocabularyEntry('nonexistent');
    expect(after).toHaveLength(1);
  });

  it('returns empty array after removing last entry', () => {
    const entries = addVocabularyEntry({ word: 'word', definition: 'def' });
    const after = deleteVocabularyEntry(entries[0].id);
    expect(after).toEqual([]);
  });
});

/* ── round-trip 시나리오 ────────────────────────────────── */
describe('round-trip — full flashcard learning flow', () => {
  it('add → mark known → mark unknown → delete', () => {
    const c1 = addFlashcard('b1', { q: 'Q1', a: 'A1' });
    expect(c1[0].known).toBe(false);

    markFlashcard('b1', c1[0].id, true);
    expect(getFlashcards('b1')[0].known).toBe(true);

    markFlashcard('b1', c1[0].id, false);
    expect(getFlashcards('b1')[0].known).toBe(false);

    deleteFlashcard('b1', c1[0].id);
    expect(getFlashcards('b1')).toEqual([]);
  });

  it('학습 시나리오: 5장 추가 → 3장 학습 완료', () => {
    for (let i = 1; i <= 5; i++) addFlashcard('b1', { q: `Q${i}`, a: `A${i}` });

    const cards = getFlashcards('b1');
    markFlashcard('b1', cards[0].id, true);
    markFlashcard('b1', cards[1].id, true);
    markFlashcard('b1', cards[2].id, true);

    const updated = getFlashcards('b1');
    const knownCount = updated.filter(c => c.known).length;
    expect(knownCount).toBe(3);
    expect(updated).toHaveLength(5);
  });
});
