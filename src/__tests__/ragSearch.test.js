import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../utils/bookVectorDb.js', () => ({ listBookVectors: vi.fn() }));
vi.mock('../utils/ragIndex.js', () => ({ queryBookIndex: vi.fn() }));
vi.mock('../utils/embeddings.js', () => ({ GEMINI_EMBED_MODEL: 'gemini-embed', LOCAL_EMBED_MODEL: 'local-embed' }));

import { listBookVectors } from '../utils/bookVectorDb.js';
import { queryBookIndex } from '../utils/ragIndex.js';
import { listIndexedBooks, semanticSearchAll } from '../utils/ragSearch.js';

beforeEach(() => vi.clearAllMocks());

describe('listIndexedBooks', () => {
  it('로컬 모델은 키 없이 usable, Gemini 모델은 키 있어야 usable', async () => {
    listBookVectors.mockResolvedValue([
      { bookId: 'a', chunkCount: 3, model: 'local-embed' },
      { bookId: 'b', chunkCount: 5, model: 'gemini-embed' },
    ]);
    const noKey = await listIndexedBooks();
    expect(noKey.find(x => x.bookId === 'a').usable).toBe(true);
    expect(noKey.find(x => x.bookId === 'b').usable).toBe(false);

    const withKey = await listIndexedBooks({ geminiKey: 'K' });
    expect(withKey.find(x => x.bookId === 'b').usable).toBe(true);
  });
});

describe('semanticSearchAll', () => {
  it('빈 질의면 인덱스 조회 없이 []', async () => {
    expect(await semanticSearchAll('   ')).toEqual([]);
    expect(queryBookIndex).not.toHaveBeenCalled();
  });

  it('인덱스된 책이 없으면 []', async () => {
    listBookVectors.mockResolvedValue([]);
    expect(await semanticSearchAll('질문')).toEqual([]);
  });

  it('여러 책 결과를 병합해 점수 내림차순 상위 total개 반환 + bookId 태깅', async () => {
    listBookVectors.mockResolvedValue([{ bookId: 'a', chunkCount: 2 }, { bookId: 'b', chunkCount: 2 }]);
    queryBookIndex.mockImplementation(async (bookId) =>
      bookId === 'a'
        ? [{ page: 1, text: 'A1', score: 0.9 }, { page: 2, text: 'A2', score: 0.4 }]
        : [{ page: 3, text: 'B1', score: 0.7 }],
    );
    const hits = await semanticSearchAll('질문', { total: 2 });
    expect(hits.map(h => h.text)).toEqual(['A1', 'B1']);      // 0.9 > 0.7 > 0.4(잘림)
    expect(hits[0]).toMatchObject({ bookId: 'a', page: 1, score: 0.9 });
    expect(hits[1]).toMatchObject({ bookId: 'b', page: 3 });
  });

  it('bookIds 를 주면 해당 책만 질의한다', async () => {
    listBookVectors.mockResolvedValue([{ bookId: 'a', chunkCount: 1 }, { bookId: 'b', chunkCount: 1 }]);
    queryBookIndex.mockResolvedValue([{ page: 1, text: 'x', score: 0.5 }]);
    await semanticSearchAll('질문', { bookIds: ['b'] });
    expect(queryBookIndex).toHaveBeenCalledTimes(1);
    expect(queryBookIndex).toHaveBeenCalledWith('b', '질문', expect.objectContaining({ topK: 3 }));
  });
});
