export async function downloadPdfFromDrive(fileId, accessToken) {
  if (!fileId) throw new Error('Missing fileId');

  try {
    let response;

    if (accessToken) {
      // API 토큰이 있으면 먼저 시도
      response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (response.status === 401 || response.status === 403) {
        throw new Error('auth');
      }

      if (response.ok) {
        return await response.arrayBuffer();
      }
    }

    // API 실패하면 공개 공유 URL 시도
    response = await fetch(
      `https://drive.google.com/uc?id=${fileId}&export=download`
    );

    if (!response.ok) {
      throw new Error(`Cannot download file (HTTP ${response.status})`);
    }

    return await response.arrayBuffer();
  } catch (e) {
    if (e.message === 'auth') throw e;
    throw new Error(e.message || 'network error');
  }
}
