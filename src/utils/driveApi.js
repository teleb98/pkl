/* Google Drive 폴더 탐색 공용 헬퍼 — 한 폴더의 하위 폴더/PDF 목록 조회.
   (기존 listDrivePDFs 는 "지정 폴더 PDF만" 조회하는 서재 동기화 전용이라 별도 유지) */

/** folderId 의 직계 자식(폴더/PDF)만 반환 (비재귀). folderId='root' 는 내 드라이브 최상위. */
export async function listDriveChildren(accessToken, folderId) {
  const q = `'${folderId}' in parents and trashed=false`;
  const fields = 'nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink)';
  let allFiles = [];
  let pageToken = null;

  do {
    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q', q);
    url.searchParams.set('fields', fields);
    url.searchParams.set('orderBy', 'folder,name');
    url.searchParams.set('pageSize', '200');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) throw new Error('auth-expired');
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `HTTP ${res.status}`);
    }
    const data = await res.json();
    allFiles = allFiles.concat(data.files || []);
    pageToken = data.nextPageToken || null;
  } while (pageToken);

  const folders = allFiles.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
  const pdfs = allFiles.filter(f =>
    f.mimeType !== 'application/vnd.google-apps.folder' &&
    (f.mimeType === 'application/pdf' || f.name?.toLowerCase().endsWith('.pdf'))
  );
  return { folders, pdfs };
}
