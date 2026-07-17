import { describe, it, expect, beforeEach } from 'vitest';
import { readRbSession, clearRbCookie, hubLoginUrl, hubLogoutUrl } from '../utils/rarebookSso.js';

// www(IdP) 발급 토큰과 동일하게 base64url(payload) 로 구성 (readRbSession 은 검증 없이 payload 만 디코드)
function b64url(obj) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(obj))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function makeToken(payload) {
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.sig`;
}
const future = () => Math.floor(Date.now() / 1000) + 3600;
const past = () => Math.floor(Date.now() / 1000) - 3600;

beforeEach(() => {
  document.cookie = 'rb_session=; Path=/; Max-Age=0';
});

describe('readRbSession', () => {
  it('쿠키가 없으면 null', () => {
    expect(readRbSession()).toBeNull();
  });

  it('유효한 토큰이면 사용자 정보를 반환한다 (한글 이름 포함)', () => {
    document.cookie = 'rb_session=' + makeToken({
      provider: 'google', provider_id: '123', email: 'a@b.com', name: '홍길동', exp: future(),
    });
    expect(readRbSession()).toEqual({
      provider: 'google', providerId: '123', email: 'a@b.com', name: '홍길동',
    });
  });

  it('만료된 토큰이면 null', () => {
    document.cookie = 'rb_session=' + makeToken({
      provider: 'google', provider_id: '1', exp: past(),
    });
    expect(readRbSession()).toBeNull();
  });

  it('형식이 잘못된 토큰(3분할 아님)이면 null', () => {
    document.cookie = 'rb_session=not-a-jwt';
    expect(readRbSession()).toBeNull();
  });

  it('payload 가 유효한 JSON 이 아니면 null', () => {
    document.cookie = 'rb_session=aaa.bbb.ccc';
    expect(readRbSession()).toBeNull();
  });

  it('exp 가 없으면 만료 검사 없이 통과한다', () => {
    document.cookie = 'rb_session=' + makeToken({ provider: 'kakao', provider_id: '9', name: '김' });
    expect(readRbSession()?.provider).toBe('kakao');
  });
});

describe('hub URL 헬퍼', () => {
  it('hubLoginUrl 은 next 를 인코딩해 허브 로그인으로 향한다', () => {
    const url = hubLoginUrl('https://cooking.rarebook.co.kr/x?y=1');
    expect(url).toBe(
      'https://rarebook.co.kr/member/login?next=' +
      encodeURIComponent('https://cooking.rarebook.co.kr/x?y=1'),
    );
  });

  it('hubLogoutUrl 은 허브 로그아웃으로 향한다', () => {
    expect(hubLogoutUrl('https://pkl.rarebook.co.kr/')).toBe(
      'https://rarebook.co.kr/member/logout?next=' +
      encodeURIComponent('https://pkl.rarebook.co.kr/'),
    );
  });
});

describe('clearRbCookie', () => {
  it('호스트 쿠키를 제거해 readRbSession 이 null 이 된다', () => {
    document.cookie = 'rb_session=' + makeToken({ provider: 'google', provider_id: '1', exp: future() });
    expect(readRbSession()).not.toBeNull();
    clearRbCookie();
    expect(readRbSession()).toBeNull();
  });
});
