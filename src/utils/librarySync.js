/* 컬렉션(책장 분류)·단어장을 Drive에 동기화 — 진행률 동기화(progressSync.js)와
   같은 PKL 폴더에 별도 파일(library-data.json)로 저장한다. 지금까지 두 데이터는
   순수 localStorage 뿐이라 기기 변경·재설치 시 그냥 사라졌다.

   병합 전략: 개별 항목마다 정밀한 updatedAt 추적이 없는 데이터라, 안전한
  "합집합(union)" 방식을 쓴다 — 어느 쪽도 잃지 않는 것을 last-write-wins 보다
   우선한다. 컬렉션은 같은 id 면 bookIds 를 합치고(추가만 반영, 삭제는 전파 안 됨),
   단어장은 같은 단어(대소문자 무시) 중복을 제거한다. */
import { getCollections, saveCollections, getVocabulary, saveVocabulary } from '../store.js';
import { findOrCreateFolder } from './driveBackup.js';
import { downloadDriveJson, uploadDriveJson } from './driveJsonSync.js';

const LIBRARY_FILE = 'library-data.json';

export function unionCollections(local, remote) {
  const map = new Map();
  for (const c of remote || []) map.set(c.id, c);
  for (const c of local || []) {
    const existing = map.get(c.id);
    if (!existing) { map.set(c.id, c); continue; }
    const bookIds = [...new Set([...(existing.bookIds || []), ...(c.bookIds || [])])];
    map.set(c.id, { ...existing, ...c, bookIds });
  }
  return [...map.values()];
}

export function unionVocabulary(local, remote) {
  const map = new Map();
  for (const e of remote || []) map.set(e.id, e);
  for (const e of local || []) map.set(e.id, e);
  const seenWords = new Set();
  const out = [];
  for (const e of map.values()) {
    const key = (e.word || '').toLowerCase();
    if (seenWords.has(key)) continue;
    seenWords.add(key);
    out.push(e);
  }
  return out;
}

/**
 * 컬렉션·단어장을 Drive와 동기화(합집합 병합) — 로컬에 즉시 반영 + 병합본 업로드.
 * @returns {{collections:number, vocabulary:number}}
 */
export async function syncLibraryDataWithDrive(token) {
  if (!token) throw new Error('no-token');
  const folderId = await findOrCreateFolder(token, 'PKL');
  const remote = await downloadDriveJson(token, folderId, LIBRARY_FILE);

  const mergedCollections = unionCollections(getCollections(), remote.collections);
  const mergedVocab = unionVocabulary(getVocabulary(), remote.vocabulary);
  saveCollections(mergedCollections);
  saveVocabulary(mergedVocab);

  await uploadDriveJson(token, folderId, LIBRARY_FILE, { collections: mergedCollections, vocabulary: mergedVocab });
  return { collections: mergedCollections.length, vocabulary: mergedVocab.length };
}
