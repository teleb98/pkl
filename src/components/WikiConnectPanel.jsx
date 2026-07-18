import { useState } from 'react';
import { useTheme } from '../context.jsx';
import { useGoogleAuth } from '../utils/useGoogleAuth.js';
import { syncWikiIndex, DEFAULT_VAULT_PATH } from '../utils/driveWiki.js';
import { buildWikiVectors } from '../utils/wikiVector.js';
import { exportKnowledgeToVault, WRITE_SCOPE } from '../utils/wikiExport.js';
import { GEMINI_EMBED_MODEL } from '../utils/embeddings.js';
import { getWikiConfig, saveWikiConfig, saveWikiIndex, getWikiIndex } from '../store.js';

/* ── 옵시디언 위키(cw_wiki) 연결 패널
   - 가져오기(읽기 전용): Drive의 Backups/cw_wiki 를 읽어 위키 인덱스 생성 + 시맨틱
     벡터 색인(Gemini 키 있으면 Gemini, 없으면 로컬 임베딩)
   - 내보내기(쓰기): 볼트의 rarebook/ 하위 폴더에만 책 노트를 쓴다(펜스 병합·멱등).
     기존 폴더에 써야 해서 전체 drive 스코프가 필요 — 내보내기 때만 요청. */
export function WikiConnectPanel({ lang, apiKeys }) {
  const { T, F } = useTheme();
  const ko = lang === 'ko';
  const [cfg, setCfg] = useState(getWikiConfig());
  const [status, setStatus] = useState('idle'); // idle | syncing | exporting | error
  const [error, setError] = useState('');
  const [exportMsg, setExportMsg] = useState('');
  const [vectorizing, setVectorizing] = useState(false);

  async function runSync(token) {
    setStatus('syncing'); setError('');
    try {
      const res = await syncWikiIndex(token, { segments: DEFAULT_VAULT_PATH });
      saveWikiIndex(res.notes);
      // 연결을 먼저 확정 — "동기화 중"이 임베딩을 기다리다 멈추지 않게 한다
      setCfg(saveWikiConfig({
        connected: true, folderPath: DEFAULT_VAULT_PATH,
        lastSync: Date.now(), count: res.count, truncated: res.truncated,
      }));
      setStatus('idle');
      // 의미 색인(임베딩)은 백그라운드 — 느리거나 실패해도 연결·토큰 검색은 정상
      setVectorizing(true);
      buildWikiVectors(res.notes, { geminiKey: apiKeys?.gemini })
        .then(v => setCfg(saveWikiConfig({ vectorModel: v.model })))
        .catch(() => {})
        .finally(() => setVectorizing(false));
    } catch (e) {
      setStatus('error');
      setError(
        e?.code === 'folder-not-found' ? (ko ? 'Backups/cw_wiki 폴더를 찾지 못했어요' : 'Backups/cw_wiki not found')
          : e?.code === 'auth-expired' ? (ko ? '드라이브 인증이 만료됐어요. 다시 연결해 주세요' : 'Drive auth expired')
            : (ko ? '동기화에 실패했어요' : 'Sync failed')
      );
    }
  }

  async function runExport(token) {
    setStatus('exporting'); setError(''); setExportMsg('');
    try {
      const res = await exportKnowledgeToVault(token, {
        onProgress: (i, total) => setExportMsg(ko ? `내보내는 중… ${i}/${total}` : `Exporting… ${i}/${total}`),
      });
      setExportMsg(ko
        ? `✅ ${res.total}권 내보냄 (새 노트 ${res.created} · 갱신 ${res.updated}) → cw_wiki/rarebook/`
        : `✅ Exported ${res.total} (new ${res.created} · updated ${res.updated}) → cw_wiki/rarebook/`);
      setStatus('idle');
    } catch (e) {
      setStatus('error');
      setError(e?.code === 'folder-not-found'
        ? (ko ? 'Backups/cw_wiki 폴더를 찾지 못했어요' : 'Backups/cw_wiki not found')
        : (ko ? '내보내기에 실패했어요' : 'Export failed'));
    }
  }

  async function upgradeEmbeddings() {
    if (!apiKeys?.gemini) return;
    setStatus('syncing'); setError(''); setExportMsg('');
    try {
      const model = (await buildWikiVectors(getWikiIndex(), { geminiKey: apiKeys.gemini })).model;
      setCfg(saveWikiConfig({ vectorModel: model }));
      setStatus('idle');
    } catch {
      setStatus('error'); setError(ko ? '임베딩 업그레이드에 실패했어요' : 'Embedding upgrade failed');
    }
  }

  const connect = useGoogleAuth({
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    onSuccess: ({ access_token }) => runSync(access_token),
    onError: () => { setStatus('error'); setError(ko ? '드라이브 연결에 실패했어요' : 'Drive connect failed'); },
  });

  const connectForExport = useGoogleAuth({
    scope: WRITE_SCOPE,
    onSuccess: ({ access_token }) => runExport(access_token),
    onError: () => { setStatus('error'); setError(ko ? '드라이브 연결에 실패했어요' : 'Drive connect failed'); },
  });

  const busy = status === 'syncing' || status === 'exporting';
  const lastSync = cfg.lastSync ? new Date(cfg.lastSync).toLocaleString(ko ? 'ko-KR' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }) : null;

  const btnStyle = (primary) => ({
    flexShrink: 0, fontSize: 11.5, fontWeight: 700, fontFamily: F.body, borderRadius: 9, padding: '7px 13px',
    cursor: busy ? 'default' : 'pointer',
    color: primary ? '#fff' : T.accent,
    background: busy ? T.border : primary ? T.accent : T.surface,
    border: primary ? 'none' : `1px solid ${T.accent}55`,
  });

  return (
    <div style={{ background: T.accentSoft, borderRadius: 14, padding: '13px 15px', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: T.accentDeep, fontFamily: F.body }}>
          🔗 {ko ? '옵시디언 위키 연결' : 'Obsidian Wiki'} <span style={{ color: T.inkLight, fontWeight: 500 }}>· cw_wiki</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {cfg.connected && (
            <button onClick={connectForExport} disabled={busy} style={btnStyle(false)}>
              {status === 'exporting' ? (ko ? '내보내는 중…' : 'Exporting…') : (ko ? '볼트로 내보내기' : 'Export to vault')}
            </button>
          )}
          <button onClick={connect} disabled={busy} style={btnStyle(true)}>
            {status === 'syncing' ? (ko ? '동기화 중…' : 'Syncing…') : cfg.connected ? (ko ? '다시 동기화' : 'Re-sync') : (ko ? '드라이브로 연결' : 'Connect Drive')}
          </button>
        </div>
      </div>
      <div style={{ marginTop: 8, fontSize: 11.5, color: T.inkMid, fontFamily: F.body, lineHeight: 1.5 }}>
        {status === 'error'
          ? <span style={{ color: '#C0392B' }}>⚠️ {error}</span>
          : exportMsg
            ? exportMsg
            : cfg.connected
              ? <>📚 {ko ? `노트 ${cfg.count}개 연결됨` : `${cfg.count} notes linked`}{cfg.truncated ? (ko ? ' (일부)' : ' (partial)') : ''}{lastSync ? ` · ${lastSync}` : ''}</>
              : (ko ? 'Drive의 Backups/cw_wiki 를 읽어 책의 주제·AI 대화와 위키를 이어줍니다. (가져오기는 읽기 전용)' : 'Reads Backups/cw_wiki from Drive to link your wiki with book topics and AI chat. (import is read-only)')}
      </div>

      {cfg.connected && vectorizing && status !== 'error' && (
        <div style={{ marginTop: 7, fontSize: 10.5, color: T.inkLight, fontFamily: F.body }}>🔎 {ko ? '의미 색인 만드는 중…' : 'Building semantic index…'}</div>
      )}

      {cfg.connected && cfg.vectorModel && !vectorizing && status !== 'error' && (
        <div style={{ marginTop: 7, display: 'flex', alignItems: 'center', gap: 8, fontSize: 10.5, color: T.inkLight, fontFamily: F.body }}>
          <span>{ko ? '의미 검색' : 'Semantic'}: <b style={{ color: cfg.vectorModel === GEMINI_EMBED_MODEL ? T.accent : T.inkMid }}>{cfg.vectorModel === GEMINI_EMBED_MODEL ? 'Gemini' : (ko ? '로컬' : 'Local')}</b></span>
          {cfg.vectorModel !== GEMINI_EMBED_MODEL && apiKeys?.gemini && (
            <button onClick={upgradeEmbeddings} disabled={busy} style={{ fontSize: 10.5, fontWeight: 700, color: T.accent, background: 'transparent', border: `1px solid ${T.accent}55`, borderRadius: 7, padding: '3px 9px', cursor: busy ? 'default' : 'pointer', fontFamily: F.body }}>
              {ko ? 'Gemini로 향상' : 'Upgrade to Gemini'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
