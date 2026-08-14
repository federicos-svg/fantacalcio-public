import { configDefaults, defineConfig } from "vitest/config";

// Minimal, additive config: Vitest previously ran with zero config (its own
// defaults). The one thing it needs to be told explicitly, now that
// TEST-HARNESS-01 adds Playwright: `e2e/` belongs to Playwright
// (playwright.config.ts) only. Without this exclusion Vitest's default
// `*.spec.ts` glob also picks up the Playwright spec and fails trying to
// run `test.describe()` outside the Playwright runner. Does not affect
// `vite build`/`vite preview` — those resolve `vite.config.*`, not this
// file.
// `.claude/worktrees/**`: i worker temporanei delegati dall'Executive (Team
// Charter §Struttura) lavorano in git worktree annidati dentro il repo. La
// glob di default di Vitest parte dalla root ed è ricorsiva (vitest 2.1.9
// globba con `dot: true`, quindi attraversa anche `.claude/**`); `e2e/**`
// sopra è relativa alla root e non copre i sottoalberi, quindi senza questa
// esclusione un worker in volo raddoppia la suite della sessione che lo ha
// delegato (misurato: 3075 -> 6206 test) e la fa fallire — la sua `e2e/`
// finisce sotto il runner Vitest invece che sotto Playwright. Il worker
// resta comunque coperto: dentro il suo worktree la root è il worktree.
// tsconfig.json (`include` a lista fissa) e playwright.config.ts
// (`testDir: "./e2e"`) non hanno il problema e non vanno toccati.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "e2e/**", ".claude/worktrees/**"],
  },
});
