import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithTheme } from './testUtils.jsx';

vi.mock('../utils/localBooks.js', () => ({
  addLocalBook: vi.fn(),
  addLocalBooksNative: vi.fn(),
  usesNativePicker: () => false,   // 웹 file input 경로
}));
vi.mock('../utils/useGoogleAuth.js', () => ({
  useGoogleAuth: ({ onSuccess }) => () => onSuccess({ access_token: 'tok' }),
}));
vi.mock('../utils/drivePdfUpload.js', async (orig) => ({
  ...(await orig()),
  uploadBooksToDrive: vi.fn(),
}));
vi.mock('../utils/driveLocalCopy.js', async (orig) => ({
  ...(await orig()),
  getDriveToken: vi.fn(() => null),
}));

import { AddBookFlow } from '../screens/AddBookFlow.jsx';
import { addLocalBook } from '../utils/localBooks.js';
import { uploadBooksToDrive } from '../utils/drivePdfUpload.js';
import { getDriveToken } from '../utils/driveLocalCopy.js';

beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });

function pickWebPdf(container) {
  const input = container.querySelector('input[type="file"]');
  const file = new File([new ArrayBuffer(8)], '나의책.pdf', { type: 'application/pdf' });
  fireEvent.change(input, { target: { files: [file] } });
}

describe('AddBookFlow — Drive 업로드 제안', () => {
  it('로컬 PDF 추가 후 업로드 제안이 뜨고, 업로드하면 완료 후 서재로', async () => {
    addLocalBook.mockResolvedValue({ id: 'b1', title: '나의책' });
    uploadBooksToDrive.mockResolvedValue({ done: 1, failed: 0, total: 1 });
    const onComplete = vi.fn();
    const { container } = renderWithTheme(
      <AddBookFlow lang="ko" onCancel={() => {}} onComplete={onComplete} userConfig={{}} onUpdateConfig={() => {}} />
    );

    pickWebPdf(container);
    // 제안 스텝
    expect(await screen.findByText(/1권을 서재에 추가했어요/)).toBeInTheDocument();
    expect(screen.getByText(/MyLibrary\/books/)).toBeInTheDocument();
    expect(screen.getByText(/《나의책》/)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/Google Drive에 업로드/));
    await waitFor(() => expect(uploadBooksToDrive).toHaveBeenCalledWith(
      'tok', [{ id: 'b1', title: '나의책' }], expect.any(Object),
    ));
    expect(await screen.findByText(/업로드 완료/)).toBeInTheDocument();
    expect(screen.getByText(/1권 업로드/)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/서재로 가기/));
    expect(onComplete).toHaveBeenCalledWith({ id: 'b1', title: '나의책' });
  });

  it('건너뛰기를 누르면 업로드 없이 바로 서재로', async () => {
    addLocalBook.mockResolvedValue({ id: 'b1', title: '나의책' });
    const onComplete = vi.fn();
    const { container } = renderWithTheme(
      <AddBookFlow lang="ko" onCancel={() => {}} onComplete={onComplete} userConfig={{}} onUpdateConfig={() => {}} />
    );

    pickWebPdf(container);
    fireEvent.click(await screen.findByText('건너뛰기'));
    expect(onComplete).toHaveBeenCalledWith({ id: 'b1', title: '나의책' });
    expect(uploadBooksToDrive).not.toHaveBeenCalled();
  });

  it('업로드가 실패해도 책은 추가돼 있고 서재로 갈 수 있다', async () => {
    addLocalBook.mockResolvedValue({ id: 'b1', title: '나의책' });
    uploadBooksToDrive.mockRejectedValue(new Error('boom'));
    const onComplete = vi.fn();
    const { container } = renderWithTheme(
      <AddBookFlow lang="ko" onCancel={() => {}} onComplete={onComplete} userConfig={{}} onUpdateConfig={() => {}} />
    );

    pickWebPdf(container);
    fireEvent.click(await screen.findByText(/Google Drive에 업로드/));
    expect(await screen.findByText(/업로드에 실패했어요/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/서재로 가기/));
    expect(onComplete).toHaveBeenCalled();
  });

  it('"항상 자동 업로드" 체크 후 업로드하면 autoUploadPdf 가 저장된다', async () => {
    addLocalBook.mockResolvedValue({ id: 'b1', title: '나의책' });
    uploadBooksToDrive.mockResolvedValue({ done: 1, failed: 0, total: 1 });
    const onUpdateConfig = vi.fn();
    const { container } = renderWithTheme(
      <AddBookFlow lang="ko" onCancel={() => {}} onComplete={() => {}} userConfig={{}} onUpdateConfig={onUpdateConfig} />
    );

    pickWebPdf(container);
    await screen.findByText(/1권을 서재에 추가했어요/);
    fireEvent.click(screen.getByLabelText ? screen.getByLabelText(/항상 자동/) : screen.getByText(/항상 자동/));
    fireEvent.click(screen.getByText(/Google Drive에 업로드/));

    await waitFor(() => expect(onUpdateConfig).toHaveBeenCalledWith(expect.objectContaining({ autoUploadPdf: true })));
  });
});

describe('AddBookFlow — 자동 업로드(설정 켜짐 + 토큰 있음)', () => {
  it('묻지 않고 조용히 업로드한 뒤 서재로 이동한다', async () => {
    addLocalBook.mockResolvedValue({ id: 'b1', title: '나의책' });
    getDriveToken.mockReturnValue('saved-tok');
    uploadBooksToDrive.mockResolvedValue({ done: 1, failed: 0, total: 1 });
    const onComplete = vi.fn();
    const { container } = renderWithTheme(
      <AddBookFlow lang="ko" onCancel={() => {}} onComplete={onComplete} userConfig={{ autoUploadPdf: true }} onUpdateConfig={() => {}} />
    );

    pickWebPdf(container);
    // 제안 화면 없이 바로 자동 업로드 화면
    expect(await screen.findByText(/자동 업로드 중|업로드 완료/)).toBeInTheDocument();
    expect(screen.queryByText('건너뛰기')).toBeNull();
    await waitFor(() => expect(uploadBooksToDrive).toHaveBeenCalledWith('saved-tok', [{ id: 'b1', title: '나의책' }]));
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith({ id: 'b1', title: '나의책' }), { timeout: 2000 });
  });

  it('설정은 켜져 있어도 토큰이 없으면 일반 제안 화면으로', async () => {
    addLocalBook.mockResolvedValue({ id: 'b1', title: '나의책' });
    getDriveToken.mockReturnValue(null);
    const { container } = renderWithTheme(
      <AddBookFlow lang="ko" onCancel={() => {}} onComplete={() => {}} userConfig={{ autoUploadPdf: true }} onUpdateConfig={() => {}} />
    );

    pickWebPdf(container);
    expect(await screen.findByText('건너뛰기')).toBeInTheDocument();
  });
});
