import { useState } from 'react';
import { useTheme } from '../context.jsx';
import { useGoogleAuth } from '../utils/useGoogleAuth.js';
import { syncWikiIndex, DEFAULT_VAULT_PATH } from '../utils/driveWiki.js';
import { getWikiConfig, saveWikiConfig, saveWikiIndex } from '../store.js';

/* ── 옵시디언 위키(cw_wiki) 연결 패널 — Drive의 Backups/cw_wiki 를 읽어(읽기 전용)
   서재의 지식과 교차연결할 위키 인덱스를 만든다. 사용자 볼트에 절대 쓰지 않는다. */
export function WikiConnectPanel({ lang }) {
  const { T, F } = useTheme();
  const ko = lang === 'ko';
  const [cfg, setCfg] = useState(getWikiConfig());
  const [status, setStatus] = useState('idle'); // idle | syncing | error
  const [error, setError] = useState('');

  async function runSync(token) {
    setStatus('syncing'); setError('');
    try {
      const res = await syncWikiIndex(token, { segments: DEFAULT_VAULT_PATH });
      saveWikiIndex(res.notes);
      setCfg(saveWikiConfig({
        connected: true, folderPath: DEFAULT_VAULT_PATH,
        lastSync: Date.now(), count: res.count, truncated: res.truncated,
      }));
      setStatus('idle');
    } catch (e) {
      setStatus('error');
      setError(
        e?.code === 'folder-not-found' ? (ko ? 'Backups/cw_wiki 폴더를 찾지 못했어요' : 'Backups/cw_wiki not found')
          : e?.code === 'auth-expired' ? (ko ? '드라이브 인증이 만료됐어요. 다시 연결해 주세요' : 'Drive auth expired')
            : (ko ? '동기화에 실패했어요' : 'Sync failed')
      );
    }
  }

  const connect = useGoogleAuth({
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    onSuccess: ({ access_token }) => runSync(access_token),
    onError: () => { setStatus('error'); setError(ko ? '드라이브 연결에 실패했어요' : 'Drive connect failed'); },
  });

  const syncing = status === 'syncing';
  const lastSync = cfg.lastSync ? new Date(cfg.lastSync).toLocaleString(ko ? 'ko-KR' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }) : null;

  return (
    <div style={{ background: T.accentSoft, borderRadius: 14, padding: '13px 15px', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: T.accentDeep, fontFamily: F.body }}>
          🔗 {ko ? '옵시디언 위키 연결' : 'Obsidian Wiki'} <span style={{ color: T.inkLight, fontWeight: 500 }}>· cw_wiki</span>
        </div>
        <button
          onClick={connect}
          disabled={syncing}
          style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 700, color: '#fff', background: syncing ? T.border : T.accent,
                   border: 'none', borderRadius: 9, padding: '7px 13px', cursor: syncing ? 'default' : 'pointer', fontFamily: F.body }}
        >
          {syncing ? (ko ? '동기화 중…' : 'Syncing…') : cfg.connected ? (ko ? '다시 동기화' : 'Re-sync') : (ko ? '드라이브로 연결' : 'Connect Drive')}
        </button>
      </div>
      <div style={{ marginTop: 8, fontSize: 11.5, color: T.inkMid, fontFamily: F.body, lineHeight: 1.5 }}>
        {status === 'error'
          ? <span style={{ color: '#C0392B' }}>⚠️ {error}</span>
          : cfg.connected
            ? <>📚 {ko ? `노트 ${cfg.count}개 연결됨` : `${cfg.count} notes linked`}{cfg.truncated ? (ko ? ' (일부)' : ' (partial)') : ''}{lastSync ? ` · ${lastSync}` : ''}</>
            : (ko ? 'Drive의 Backups/cw_wiki 를 읽어 책의 주제와 위키 노트를 이어줍니다. (읽기 전용)' : 'Reads Backups/cw_wiki from Drive to link book topics with your wiki notes. (read-only)')}
      </div>
    </div>
  );
}
