import { useState, useEffect } from 'react';
import { useTheme } from '../context.jsx';
import { Icon } from '../components.jsx';
import { GoogleLogo } from '../screens/OnboardingFlow.jsx';
import { useGoogleAuth } from '../utils/useGoogleAuth.js';
import { listDriveChildren } from '../utils/driveApi.js';
import { addDriveBooks } from '../utils/driveBooks.js';
import { showToast } from '../utils/toast.js';

function fmtSize(bytes) {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)}MB` : `${Math.round(bytes / 1024)}KB`;
}

function tokenFromConfig(userConfig) {
  const t = userConfig?.driveAccessToken;
  const exp = userConfig?.driveTokenExpiresAt;
  if (!t) return null;
  if (exp && Date.now() > exp) return null;
  return t;
}

/* 실제 Google Drive 폴더를 탐색해 책(PDF) 또는 폴더 단위로 서재에 추가하는 플로우.
   기존 "책 추가"의 데모(가짜 스캔) 대신, 진짜 Drive API로 폴더/파일을 보여준다. */
export function DriveBookPicker({ lang, userConfig, onUpdateConfig, onClose, onDone }) {
  const { T, F } = useTheme();
  const ko = lang === 'ko';
  const rootLabel = ko ? '내 드라이브' : 'My Drive';

  const [stack, setStack] = useState([{ id: 'root', name: rootLabel }]);
  const [folders, setFolders] = useState([]);
  const [pdfs, setPdfs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [addingFolderId, setAddingFolderId] = useState(null);
  const [addedTotal, setAddedTotal] = useState(0);

  const load = async (folderId, tokenOverride) => {
    const token = tokenOverride || tokenFromConfig(userConfig);
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const { folders: fs, pdfs: ps } = await listDriveChildren(token, folderId);
      setFolders(fs);
      setPdfs(ps);
      setSelected(new Set());
    } catch (e) {
      if (e.message === 'auth-expired') {
        onUpdateConfig?.({ ...(userConfig || {}), driveAccessToken: null });
        setError(ko ? '연결이 만료됐습니다. 다시 연결해주세요.' : 'Connection expired. Please reconnect.');
      } else {
        setError(e.message || (ko ? '목록을 불러오지 못했습니다' : 'Failed to load list'));
      }
    }
    setLoading(false);
  };

  const connectDrive = useGoogleAuth({
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    hint: userConfig?.googleUser?.email || '',
    onSuccess: async ({ access_token, expires_in }) => {
      onUpdateConfig?.({
        ...(userConfig || {}),
        driveAccessToken: access_token,
        driveTokenExpiresAt: Date.now() + ((expires_in || 3600) * 1000),
      });
      await load('root', access_token);
    },
    onError: () => setError(ko ? 'Google 연결에 실패했습니다' : 'Failed to connect Google'),
  });

  useEffect(() => {
    const token = tokenFromConfig(userConfig);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 최초 목록 로드(의도됨)
    if (token) load('root', token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connected = !!tokenFromConfig(userConfig);

  const enterFolder = (folder) => {
    setStack(s => [...s, { id: folder.id, name: folder.name }]);
    load(folder.id);
  };

  const goToCrumb = (idx) => {
    setStack(s => s.slice(0, idx + 1));
    load(stack[idx].id);
  };

  const toggle = (id) => {
    setSelected(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const importFiles = (files) => {
    if (!files.length) return;
    const added = addDriveBooks(files);
    setAddedTotal(n => n + added.length);
    if (added.length > 0) {
      showToast(
        ko ? `✓ ${added.length}권 서재에 추가됨` : `✓ Added ${added.length} book(s) to library`,
        { type: 'success' }
      );
    } else {
      showToast(ko ? '이미 추가된 책입니다' : 'Already in your library', { type: 'info' });
    }
  };

  const addSelected = () => {
    const files = pdfs.filter(p => selected.has(p.id));
    importFiles(files);
    setSelected(new Set());
  };

  const addCurrentFolderAll = () => {
    importFiles(pdfs);
  };

  const addSubfolder = async (folder) => {
    const token = tokenFromConfig(userConfig);
    if (!token) return;
    setAddingFolderId(folder.id);
    try {
      const { pdfs: ps } = await listDriveChildren(token, folder.id);
      importFiles(ps);
    } catch (e) {
      showToast(ko ? `폴더 추가 실패: ${e.message}` : `Failed to add folder: ${e.message}`, { type: 'error' });
    }
    setAddingFolderId(null);
  };

  const atRoot = stack.length === 1;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* 상단: 뒤로가기(브레드크럼) + 완료 */}
      <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: `1px solid ${T.border}`, background: T.surface, flexShrink: 0 }}>
        <button
          onClick={() => (atRoot ? onClose() : goToCrumb(stack.length - 2))}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: T.inkMid, display: 'flex' }}
        >
          <Icon name={atRoot ? 'close' : 'back'} size={18} />
        </button>
        <div style={{ flex: 1, minWidth: 0, overflowX: 'auto', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
          {stack.map((s, i) => (
            <span key={s.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {i > 0 && <span style={{ color: T.inkFaint, fontSize: 11 }}>›</span>}
              <button
                onClick={() => goToCrumb(i)}
                disabled={i === stack.length - 1}
                style={{ background: 'none', border: 'none', padding: '2px 4px', cursor: i === stack.length - 1 ? 'default' : 'pointer', fontSize: 12.5, fontFamily: F.body, fontWeight: i === stack.length - 1 ? 700 : 500, color: i === stack.length - 1 ? T.ink : T.inkLight }}
              >
                {s.name}
              </button>
            </span>
          ))}
        </div>
        {addedTotal > 0 && (
          <button onClick={onDone} style={{ background: T.accent, color: '#FFF', border: 'none', borderRadius: 20, padding: '7px 14px', fontSize: 12.5, fontWeight: 700, fontFamily: F.body, cursor: 'pointer', flexShrink: 0 }}>
            {ko ? `완료 (${addedTotal})` : `Done (${addedTotal})`}
          </button>
        )}
      </div>

      {/* 본문 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px 90px' }}>
        {!connected ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '40px 20px', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: '#E8F0FE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <GoogleLogo size={28} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, fontFamily: F.display, marginBottom: 6 }}>
                {ko ? 'Google Drive에 연결하세요' : 'Connect your Google Drive'}
              </div>
              <div style={{ fontSize: 12.5, color: T.inkLight, fontFamily: F.body, lineHeight: 1.6, maxWidth: 260 }}>
                {ko ? '내 드라이브 폴더를 탐색해 원하는 책이나 폴더를 서재에 추가할 수 있어요.' : 'Browse your Drive folders and add the books or folders you want to your library.'}
              </div>
            </div>
            <button
              onClick={() => connectDrive()}
              style={{ padding: '11px 20px', borderRadius: 12, border: '1.5px solid #4285F4', background: T.surface, color: '#1A3F7B', fontSize: 13.5, fontWeight: 600, fontFamily: F.body, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <GoogleLogo size={16} /> {ko ? 'Drive 연결하기' : 'Connect Drive'}
            </button>
            {error && <div style={{ fontSize: 12, color: '#D93025', fontFamily: F.body }}>{error}</div>}
          </div>
        ) : loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '50px 0' }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', border: `3px solid ${T.border}`, borderTopColor: T.accent, animation: 'spin .8s linear infinite' }} />
            <span style={{ fontSize: 12.5, color: T.inkLight, fontFamily: F.body }}>{ko ? '불러오는 중…' : 'Loading…'}</span>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '32px 16px' }}>
            <div style={{ fontSize: 13, color: T.ink, fontFamily: F.body, marginBottom: 12 }}>{error}</div>
            <button onClick={() => load(stack[stack.length - 1].id)} style={{ fontSize: 12.5, color: T.accent, background: T.accentSoft, border: `1px solid ${T.accent}44`, borderRadius: 10, padding: '8px 16px', cursor: 'pointer', fontFamily: F.body, fontWeight: 600 }}>
              {ko ? '다시 시도' : 'Retry'}
            </button>
          </div>
        ) : folders.length === 0 && pdfs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 16px', color: T.inkLight, fontSize: 13, fontFamily: F.body }}>
            {ko ? '이 폴더는 비어 있습니다' : 'This folder is empty'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {/* 폴더 전체 추가 (현재 위치에 PDF가 있을 때만) */}
            {pdfs.length > 0 && (
              <button
                onClick={addCurrentFolderAll}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10, border: `1px dashed ${T.accent}66`, background: T.accentSoft, color: T.accentDeep || T.accent, fontSize: 12.5, fontWeight: 600, fontFamily: F.body, cursor: 'pointer', marginBottom: 4 }}
              >
                <Icon name="library" size={14} />
                {ko ? `이 폴더의 PDF 전체 추가 (${pdfs.length}개)` : `Add all PDFs in this folder (${pdfs.length})`}
              </button>
            )}

            {/* 폴더 목록 */}
            {folders.map(folder => (
              <div key={folder.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10, background: T.surface, border: `1px solid ${T.border}` }}>
                <button onClick={() => enterFolder(folder)} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 9, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
                  <span style={{ fontSize: 17, flexShrink: 0 }}>📁</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: T.ink, fontFamily: F.body, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folder.name}</span>
                  <Icon name="forward" size={13} color={T.inkFaint} />
                </button>
                <button
                  onClick={() => addSubfolder(folder)}
                  disabled={addingFolderId === folder.id}
                  title={ko ? '폴더째 추가' : 'Add whole folder'}
                  style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 8, border: `1px solid ${T.border}`, background: T.surfaceAlt, color: T.accent, cursor: addingFolderId === folder.id ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}
                >
                  {addingFolderId === folder.id ? '⏳' : '＋'}
                </button>
              </div>
            ))}

            {/* PDF 목록 (체크박스 선택) */}
            {pdfs.map(pdf => {
              const isSel = selected.has(pdf.id);
              return (
                <button
                  key={pdf.id}
                  onClick={() => toggle(pdf.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: isSel ? T.accentSoft : T.surface, border: `1.5px solid ${isSel ? T.accent : T.border}`, cursor: 'pointer', textAlign: 'left' }}
                >
                  <div style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${isSel ? T.accent : T.border}`, background: isSel ? T.accent : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {isSel && <Icon name="check" size={11} color="#FFF" stroke={3} />}
                  </div>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>📄</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: T.ink, fontFamily: F.body, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pdf.name}</span>
                  {pdf.size && <span style={{ fontSize: 10.5, color: T.inkLight, fontFamily: F.mono, flexShrink: 0 }}>{fmtSize(Number(pdf.size))}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 하단: 선택 추가 바 */}
      {connected && selected.size > 0 && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '12px 16px calc(env(safe-area-inset-bottom) + 12px)', background: T.surface, borderTop: `1px solid ${T.border}`, boxShadow: '0 -4px 20px rgba(0,0,0,.08)' }}>
          <button
            onClick={addSelected}
            style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none', background: T.accent, color: '#FFF', fontSize: 14, fontWeight: 700, fontFamily: F.body, cursor: 'pointer' }}
          >
            {ko ? `선택한 ${selected.size}권 추가` : `Add ${selected.size} selected`}
          </button>
        </div>
      )}
    </div>
  );
}
