import React from 'react';
import { Moon, SunMedium } from 'lucide-react';

import { useTheme } from './theme-provider';
import { Button } from './ui/button';

export function ThemeToggle(): React.JSX.Element {
  const { resolvedTheme, toggleTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <Button
      className="shrink-0 rounded-2xl border-white/10 bg-white/70 text-slate-700 shadow-lg shadow-slate-200/40 backdrop-blur hover:bg-white dark:bg-white/5 dark:text-slate-100 dark:shadow-none dark:hover:bg-white/10"
      onClick={toggleTheme}
      size="icon"
      type="button"
      variant="outline"
    >
      {isDark ? <SunMedium /> : <Moon />}
      <span className="sr-only">
        {isDark
          ? '\u5207\u6362\u5230\u6d45\u8272\u4e3b\u9898'
          : '\u5207\u6362\u5230\u6df1\u8272\u4e3b\u9898'}
      </span>
    </Button>
  );
}
