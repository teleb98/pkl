import { render } from '@testing-library/react';
import { ThemeContext } from '../context.jsx';
import { THEMES, TYPE_PAIRS } from '../data.js';

const T = THEMES.ember;
const F = TYPE_PAIRS.lora;

export function renderWithTheme(ui) {
  return render(
    <ThemeContext.Provider value={{ T, F }}>
      {ui}
    </ThemeContext.Provider>
  );
}
