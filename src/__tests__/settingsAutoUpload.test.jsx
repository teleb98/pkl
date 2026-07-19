import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithTheme } from './testUtils.jsx';
import { SettingsPanel } from '../App.jsx';

const SETTINGS = { dark: false, theme: 'ember', type: 'lora', lang: 'ko' };

beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });

function renderPanel(userConfig, onUpdateConfig = vi.fn()) {
  return renderWithTheme(
    <SettingsPanel settings={SETTINGS} setSettings={() => {}} onClose={() => {}} userConfig={userConfig} onUpdateConfig={onUpdateConfig} />
  );
}

describe('SettingsPanel — PDF 자동 업로드 토글', () => {
  it('Google 계정 미연결이면 토글이 보이지 않는다', () => {
    renderPanel({});
    expect(screen.queryByText(/Drive에 자동 업로드/)).toBeNull();
    expect(screen.getByText('Google 계정 연결')).toBeInTheDocument();
  });

  it('연결돼 있으면 토글이 보이고, 꺼진 상태로 시작한다', () => {
    renderPanel({ googleUser: { name: 'CW', email: 'cw@example.com' } });
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox.checked).toBe(false);
  });

  it('토글을 켜면 onUpdateConfig 에 autoUploadPdf:true 로 반영된다', () => {
    const onUpdateConfig = vi.fn();
    renderPanel({ googleUser: { name: 'CW', email: 'cw@example.com' } }, onUpdateConfig);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onUpdateConfig).toHaveBeenCalledWith(expect.objectContaining({ autoUploadPdf: true, googleUser: expect.any(Object) }));
  });

  it('이미 켜져 있으면 체크된 상태로 렌더된다', () => {
    renderPanel({ googleUser: { name: 'CW' }, autoUploadPdf: true });
    expect(screen.getByRole('checkbox').checked).toBe(true);
  });
});
