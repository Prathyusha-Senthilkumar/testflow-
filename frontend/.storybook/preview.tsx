import type { Decorator, Preview } from '@storybook/nextjs-vite'
import { useEffect, type ReactNode } from 'react'
import { ThemeProvider } from 'next-themes'
import { Toaster } from '../src/components/ui/sonner'
import { TooltipProvider } from '../src/components/ui/tooltip'
import '../src/app/globals.css'

/**
 * Applies the toolbar theme as `data-theme` on <html>, exactly like the app
 * (next-themes, attribute="data-theme"), so every token resolves the same way.
 */
function ThemeRoot({ theme, children }: { theme: string; children: ReactNode }) {
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    document.documentElement.style.colorScheme = theme
  }, [theme])
  return <>{children}</>
}

const withTheme: Decorator = (Story, context) => {
  const theme = (context.globals.theme as string) || 'light'
  return (
    <ThemeRoot theme={theme}>
    <ThemeProvider attribute="data-theme" forcedTheme={theme} enableSystem={false}>
      <TooltipProvider delayDuration={200}>
        <div className="min-h-full bg-background font-sans text-sm text-foreground">
          <Story />
        </div>
        <Toaster position="bottom-right" />
      </TooltipProvider>
    </ThemeProvider>
    </ThemeRoot>
  )
}

const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'Colour theme',
      toolbar: {
        title: 'Theme',
        icon: 'mirror',
        items: [
          { value: 'light', title: 'Light', icon: 'sun' },
          { value: 'dark', title: 'Dark', icon: 'moon' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: 'dark' },
  decorators: [withTheme],
  parameters: {
    nextjs: { appDirectory: true },
    backgrounds: { disable: true },
    controls: {
      matchers: {
       color: /(background|color)$/i,
       date: /Date$/i,
      },
    },

    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: 'todo'
    }
  },
};

export default preview;
