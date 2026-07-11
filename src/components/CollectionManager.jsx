import { useState, useEffect } from 'react';
import { useTheme } from '../context.jsx';
import {
  getCollections, createCollection, renameCollection, deleteCollection,
  addBookToCollection, removeBookFromCollection, getCollectionsByBook,
} from '../store.js';

const EMOJI_OPTIONS = ['📚', '📖', '🧠', '💡', '🎯', '🌱', '🔬', '🎨', '⭐', '🔥', '☕', '🌙'];

/* ── 모달 1: 책 ↔ 컬렉션 토글 (BookDetailSheet에서 사용) ── */
export function BookCollectionPicker({ book, lang = 'ko', onClose, onChange }) {
  const { T, F } = useTheme();
  const ko = lang === 'ko';
  const [collections, setCollections] = useState(() => getCollections());
  const [newName, setNewName] = useState('');
  const [newEmoji, setNewEmoji] = useState('📚');

  if (!book) return null;
  const isIn = (c) => c.bookIds.includes(book.id);

  const toggle = (c) => {
    const next = isIn(c)
      ? removeBookFromCollection(c.id, book.id)
      : addBookToCollection(c.id, book.id);
    setCollections(next);
    onChange?.(next);
  };
  const create = () => {
    if (!newName.trim()) return;
    const next = createCollection({ name: newName, emoji: newEmoji });
    // 새 컬렉션에 즉시 책 추가
    const created = next[next.length - 1];
    const updated = addBookToCollection(created.id, book.id);
    setCollections(updated);
    setNewName('');
    onChange?.(updated);
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: '#0009', zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: T.surface, borderRadius: 18, maxWidth: 480, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ padding: '18px 22px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 16, color: T.ink, fontFamily: F.body }}>
            🗂️ {ko ? '컬렉션 선택' : 'Choose collections'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: T.inkLight }}>×</button>
        </div>

        <div style={{ padding: 18 }}>
          <div style={{ fontSize: 11, color: T.inkLight, marginBottom: 8, fontFamily: F.body }}>
            《{book.title}》
          </div>

          {collections.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: T.inkFaint, fontSize: 12, fontFamily: F.body }}>
              {ko ? '아직 컬렉션이 없어요. 아래에서 만들어보세요.' : 'No collections yet. Create one below.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
              {collections.map(c => (
                <button
                  key={c.id}
                  onClick={() => toggle(c)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: `1px solid ${isIn(c) ? T.accent : T.border}`, background: isIn(c) ? T.accentSoft : 'transparent', cursor: 'pointer', fontFamily: F.body, fontSize: 13, color: T.ink, textAlign: 'left' }}
                >
                  <span style={{ fontSize: 18 }}>{c.emoji}</span>
                  <span style={{ flex: 1 }}>{c.name}</span>
                  <span style={{ fontSize: 10, color: T.inkFaint }}>{c.bookIds.length}{ko ? '권' : ''}</span>
                  {isIn(c) && <span style={{ color: T.accent, fontWeight: 700 }}>✓</span>}
                </button>
              ))}
            </div>
          )}

          {/* 새 컬렉션 생성 */}
          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 14 }}>
            <div style={{ fontSize: 11, color: T.inkMid, marginBottom: 8, fontFamily: F.body }}>
              {ko ? '새 컬렉션 만들기' : 'Create new'}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {EMOJI_OPTIONS.map(em => (
                <button
                  key={em}
                  onClick={() => setNewEmoji(em)}
                  style={{ width: 32, height: 32, borderRadius: 8, border: newEmoji === em ? `2px solid ${T.accent}` : `1px solid ${T.border}`, background: 'transparent', cursor: 'pointer', fontSize: 16 }}
                >{em}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && create()}
                placeholder={ko ? '컬렉션 이름 (예: 철학)' : 'Collection name'}
                style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 13, fontFamily: F.body, background: T.surfaceAlt, color: T.ink }}
              />
              <button
                onClick={create}
                disabled={!newName.trim()}
                style={{ padding: '9px 14px', borderRadius: 8, border: 'none', background: T.accent, color: '#FFF', fontSize: 13, fontWeight: 600, cursor: newName.trim() ? 'pointer' : 'not-allowed', opacity: newName.trim() ? 1 : 0.5, fontFamily: F.body }}
              >
                {ko ? '추가' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── 모달 2: 컬렉션 전체 관리 (이름 변경/삭제) ── */
export function CollectionManager({ lang = 'ko', onClose, onChange }) {
  const { T, F } = useTheme();
  const ko = lang === 'ko';
  const [collections, setCollections] = useState(() => getCollections());
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editEmoji, setEditEmoji] = useState('📚');

  const refresh = () => {
    const next = getCollections();
    setCollections(next);
    onChange?.(next);
  };

  const startEdit = (c) => { setEditingId(c.id); setEditName(c.name); setEditEmoji(c.emoji); };
  const saveEdit = () => {
    if (!editName.trim()) { setEditingId(null); return; }
    renameCollection(editingId, { name: editName, emoji: editEmoji });
    setEditingId(null);
    refresh();
  };
  const remove = (id) => {
    if (!confirm(ko ? '이 컬렉션을 삭제할까요? (책은 보존됩니다)' : 'Delete this collection? (Books remain)')) return;
    deleteCollection(id);
    refresh();
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: '#0009', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: T.surface, borderRadius: 18, maxWidth: 520, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ padding: '18px 22px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 16, color: T.ink, fontFamily: F.body }}>
            🗂️ {ko ? '컬렉션 관리' : 'Manage Collections'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: T.inkLight }}>×</button>
        </div>

        <div style={{ padding: 18 }}>
          {collections.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: T.inkFaint, fontSize: 12, fontFamily: F.body }}>
              {ko ? '컬렉션이 없습니다. 책 상세에서 컬렉션을 만들어보세요.' : 'No collections yet.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {collections.map(c => (
                <div key={c.id} style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${T.border}`, background: T.surfaceAlt }}>
                  {editingId === c.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {EMOJI_OPTIONS.map(em => (
                          <button key={em} onClick={() => setEditEmoji(em)} style={{ width: 28, height: 28, borderRadius: 6, border: editEmoji === em ? `2px solid ${T.accent}` : `1px solid ${T.border}`, background: 'transparent', cursor: 'pointer', fontSize: 14 }}>{em}</button>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                          autoFocus
                          style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 13, background: T.surface, color: T.ink, fontFamily: F.body }}
                        />
                        <button onClick={saveEdit} style={{ padding: '7px 12px', borderRadius: 8, border: 'none', background: T.accent, color: '#FFF', fontSize: 12, cursor: 'pointer', fontFamily: F.body }}>{ko ? '저장' : 'Save'}</button>
                        <button onClick={() => setEditingId(null)} style={{ padding: '7px 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: 'transparent', color: T.inkLight, fontSize: 12, cursor: 'pointer', fontFamily: F.body }}>{ko ? '취소' : 'Cancel'}</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 20 }}>{c.emoji}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, color: T.ink, fontFamily: F.body, fontWeight: 600 }}>{c.name}</div>
                        <div style={{ fontSize: 10, color: T.inkFaint, fontFamily: F.body }}>{c.bookIds.length}{ko ? '권' : ' books'}</div>
                      </div>
                      <button onClick={() => startEdit(c)} title={ko ? '편집' : 'Edit'} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: 4, color: T.inkLight }}>✏️</button>
                      <button onClick={() => remove(c.id)} title={ko ? '삭제' : 'Delete'} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: 4, color: T.inkLight }}>🗑️</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
