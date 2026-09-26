import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const SHOTS_DIR = 'screenshots';

async function openLab(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => window.__labReady === true, undefined, { timeout: 60_000 });
  // Deixa a câmera assentar e o fade da tela de carregamento terminar.
  await page.waitForTimeout(900);
}

test.beforeAll(async () => {
  await mkdir(SHOTS_DIR, { recursive: true });
});

test('vista padrão', async ({ page }, testInfo) => {
  await openLab(page);
  await expect(page.locator('#loading')).toBeHidden();
  await page.screenshot({ path: `${SHOTS_DIR}/${testInfo.project.name}-01-default.png` });
});

// TODO(F3–F7): acrescentar as capturas restantes da SPEC §7 conforme as fases entregarem
// os estados correspondentes: 02-exploded (tecla X), 03-f16 (tecla F), 04-focus-background
// (tecla 3) e a variação de celular, que já roda pelo projeto "mobile" do playwright.config.
