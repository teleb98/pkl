import { render } from '@testing-library/react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { ThemeContext } from '../context.jsx';
import { THEMES, TYPE_PAIRS } from '../data.js';

const T = THEMES.ember;
const F = TYPE_PAIRS.lora;

// 실제 앱(main.jsx)과 동일하게 GoogleOAuthProvider 로 감싼다 — GIS 훅(useGoogleAuth)을
// 쓰는 컴포넌트가 provider 없이 렌더될 때 throw 하는 것을 방지.
export function renderWithTheme(ui) {
  return render(
    <GoogleOAuthProvider clientId="test-client-id">
      <ThemeContext.Provider value={{ T, F }}>
        {ui}
      </ThemeContext.Provider>
    </GoogleOAuthProvider>
  );
}
