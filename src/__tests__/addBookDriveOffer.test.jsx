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

import { AddBookFlow } from '../screens/AddBookFlow.jsx';
import { addLocalBook } from '../utils/localBooks.js';
import { uploadBooksToDrive } from '../utils/drivePdfUpload.js';

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
});
