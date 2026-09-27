import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const SHOTS_DIR = 'screenshots';

async function openLab(page: Page, query = ''): Promise<void> {
  await page.goto(`/${query}`);
  await page.waitForFunction(() => window.__labReady === true, undefined, { timeout: 60_000 });
  // Deixa a câmera assentar e o fade da tela de carregamento terminar.
  await page.waitForTimeout(900);
}

/** Espera as animações do experimento (montada ↔ explodida leva 0,8 s). */
async function settle(page: Page): Promise<void> {
  await page.waitForTimeout(1400);
}

test.beforeAll(async () => {
  await mkdir(SHOTS_DIR, { recursive: true });
});

test('vista padrão', async ({ page }, testInfo) => {
  await openLab(page);
  await expect(page.locator('#loading')).toBeHidden();
  await page.screenshot({ path: `${SHOTS_DIR}/${testInfo.project.name}-01-default.png` });
});

test('objetiva de perto', async ({ page }, testInfo) => {
  await openLab(page, '?shot=lens-three-quarter');
  await page.screenshot({ path: `${SHOTS_DIR}/${testInfo.project.name}-02-lens.png` });
});

test('objetiva explodida', async ({ page }, testInfo) => {
  await openLab(page, '?shot=lens-three-quarter&lens=exploded');
  await settle(page);
  await page.screenshot({ path: `${SHOTS_DIR}/${testInfo.project.name}-03-exploded.png` });
});

test('diafragma em f/16', async ({ page }, testInfo) => {
  // Montada, a íris fica atrás do elemento frontal — como numa lente real.
  // A captura é no modo explodido e no mesmo enquadramento da captura 03,
  // para a comparação f/2 x f/16 ser direta.
  await openLab(page, '?shot=lens-three-quarter&lens=exploded&f=16');
  await settle(page);
  await page.screenshot({ path: `${SHOTS_DIR}/${testInfo.project.name}-04-f16.png` });
});

test('foco no fundo', async ({ page }, testInfo) => {
  await openLab(page, '?shot=lens-profile&focus=2000');
  await settle(page);
  await page.screenshot({ path: `${SHOTS_DIR}/${testInfo.project.name}-05-focus-background.png` });
});
