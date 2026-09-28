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

test('vale e objetiva', async ({ page }, testInfo) => {
  await openLab(page, '?shot=overview');
  await page.screenshot({ path: `${SHOTS_DIR}/${testInfo.project.name}-06-overview.png` });
});

test('diorama de perto', async ({ page }, testInfo) => {
  await openLab(page, '?shot=valley');
  await page.screenshot({ path: `${SHOTS_DIR}/${testInfo.project.name}-07-valley.png` });
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

test('caminho da luz, foco no meio', async ({ page }, testInfo) => {
  await openLab(page, '?shot=optical-path&focus=600');
  await page.screenshot({ path: `${SHOTS_DIR}/${testInfo.project.name}-08-rays-600.png` });
});

test('caminho da luz, foco no primeiro plano', async ({ page }, testInfo) => {
  await openLab(page, '?shot=optical-path&focus=370');
  await page.screenshot({ path: `${SHOTS_DIR}/${testInfo.project.name}-09-rays-370.png` });
});

test('plano da imagem com os anéis de confusão', async ({ page }, testInfo) => {
  await openLab(page, '?shot=plate&focus=600');
  await page.screenshot({ path: `${SHOTS_DIR}/${testInfo.project.name}-10-plate.png` });
});

test('foco no fundo', async ({ page }, testInfo) => {
  // No pico a linha de corte fica isolada, longe do bosque: é a captura que
  // mostra se a faixa acende onde a física manda.
  await openLab(page, '?shot=optical-path&focus=2000');
  await page.screenshot({ path: `${SHOTS_DIR}/${testInfo.project.name}-05-focus-background.png` });
});
