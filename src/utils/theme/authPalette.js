// Sign-in / sign-up / password-reset screens used hard-coded black text and a
// white card, which only worked while the window behind them was light. They now
// follow the system light/dark setting like the rest of the app.
export const authPalette = isDark =>
    isDark
        ? {
              text: '#FFFFFF',
              muted: '#BDBDBD',
              card: '#1C1C1C',
              cardBorder: 'rgba(255,255,255,0.12)',
              tabRow: '#2A2A2A',
              tabActive: '#3A3A3A',
              tabText: '#D0D0D0',
              line: 'rgba(255,255,255,0.18)',
              socialBg: '#262626',
              socialText: '#FFFFFF',
              inputBg: 'rgba(255,255,255,0.08)',
              inputText: '#FFFFFF',
              placeholder: '#A0A0A0',
              switchOff: '#555555',
          }
        : {
              text: '#000000',
              muted: '#444444',
              card: '#FFFFFF',
              cardBorder: '#16151640',
              tabRow: '#E0E0E0',
              tabActive: '#FFFFFF',
              tabText: '#333333',
              line: '#DDDDDD',
              socialBg: '#FFFFFF',
              socialText: '#000000',
              inputBg: 'rgba(85, 85, 85, 0.12)',
              inputText: '#000000',
              placeholder: '#706C6C',
              switchOff: '#CCCCCC',
          };
