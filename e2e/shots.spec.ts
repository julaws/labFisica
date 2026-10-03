import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const SHOTS_DIR = 'screenshots';

async function openLab(page: Page, query = ''): Promise<void> {
  await page.goto(`/${query}`);
  await page.waitForFunction(() => window.__labReady === true, undefined, { timeout: 60_000 });
  // Deixa a câmera assentar e o fade da tela de carregamento terminar.
  await page.waitForTimeout(900);
}

/**
 * O painel pode começar recolhido: sempre no celular (gaveta) e, no desktop,
 * na bancada da lente. Abre se estiver fechado.
 */
async function openControls(page: Page): Promise<void> {
  const handle = page.getByRole('button', { name: 'Controles' });
  if ((await handle.isVisible()) && (await handle.getAttribute('aria-expanded')) === 'false') {
    await handle.click();
    await page.waitForTimeout(300);
  }
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
  // A lente abre explodida; esta captura é a da lente montada.
  await openLab(page, '?shot=lens-three-quarter&lens=assembled');
  await settle(page);
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

test('imagem no sensor, foco no meio', async ({ page }, testInfo) => {
  await openLab(page, '?shot=sensor&focus=600');
  await settle(page);
  await page.screenshot({ path: `${SHOTS_DIR}/${testInfo.project.name}-11-sensor-600.png` });
});

test('imagem no sensor em f/16', async ({ page }, testInfo) => {
  await openLab(page, '?shot=sensor&focus=600&f=16');
  await settle(page);
  await page.screenshot({ path: `${SHOTS_DIR}/${testInfo.project.name}-12-sensor-f16.png` });
});

test('console com miniaturas', async ({ page }, testInfo) => {
  await openLab(page, '?shot=console&focus=600');
  // As miniaturas renderizam uma por quadro: dá tempo às cinco.
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS_DIR}/${testInfo.project.name}-13-console.png` });
});

test('critério 2: o HUD mostra a zona nítida calculada pelo motor', async ({ page }) => {
  await openLab(page, '?focus=600&f=2');
  await expect(page.locator('.chip[data-id="zone"] .chip__value')).toHaveText('1,9 cm');
  await expect(page.locator('.chip[data-id="aperture"] .chip__value')).toHaveText('f/2');

  await openLab(page, '?focus=370&f=2');
  await expect(page.locator('.chip[data-id="zone"] .chip__value')).toHaveText('0,7 cm');
  await expect(page.locator('.hud__sentence')).toContainText('Só o pinheiro está no plano');
});

test('critério 5: em f/16 a zona nítida cresce', async ({ page }) => {
  await openLab(page, '?focus=600&f=16');
  await expect(page.locator('.chip[data-id="zone"] .chip__value')).toHaveText('15,5 cm');
  await expect(page.locator('.hud__sentence')).toContainText('Em f/16 o cone de luz afina');
});

test('modal de ajuda', async ({ page }, testInfo) => {
  await openLab(page, '?focus=600');
  await openControls(page);
  await page.getByRole('button', { name: 'Ajuda' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sobre as escalas' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS_DIR}/${testInfo.project.name}-14-modal.png` });
});

test('ajustes finos no celular', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'no desktop todos os controles ficam à vista');
  await openLab(page, '?focus=600');
  // A gaveta começa recolhida: só a alça aparece.
  await expect(page.getByText('Distância')).toBeHidden();
  await page.screenshot({ path: `${SHOTS_DIR}/${testInfo.project.name}-19-drawer-closed.png` });
  await openControls(page);
  await expect(page.getByText('Distância')).toBeVisible();
  // Stops completos e círculo admissível ficam atrás de "Mais ajustes".
  await expect(page.getByText('Stops completos')).toBeHidden();
  await page.getByRole('button', { name: 'Mais ajustes' }).click();
  await expect(page.getByText('Stops completos')).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS_DIR}/${testInfo.project.name}-15-drawer.png` });
});

test('troca de objetiva', async ({ page }, testInfo) => {
  await openLab(page, '?shot=optical-path&focus=600');
  await openControls(page);
  // Convergente simples: forma imagem, mas a aberração aparece na frase.
  await page.getByRole('radio', { name: 'Convergente' }).click();
  await expect(page.locator('.hud__sentence')).toContainText('aberração esférica');
  await expect(page.locator('.chip[data-id="zone"] .chip__value')).toHaveText('1,9 cm');
  await settle(page);
  await page.screenshot({ path: `${SHOTS_DIR}/${testInfo.project.name}-16-converging.png` });
  // Divergente: não há imagem real, nem foco, nem zona nítida.
  await page.getByRole('radio', { name: 'Divergente' }).click();
  await expect(page.locator('.hud__sentence')).toContainText('Lente divergente');
  await expect(page.locator('.chip[data-id="zone"] .chip__value')).toHaveText('—');
  await settle(page);
  await page.screenshot({ path: `${SHOTS_DIR}/${testInfo.project.name}-17-diverging.png` });
});

test('seleção de raios', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'no celular as caixas ficam em "Mais ajustes"');
  await openLab(page, '?shot=optical-path&focus=600');
  await openControls(page);
  // Abre só com o pinheiro marcado e a lente explodida.
  await expect(page.getByRole('checkbox', { name: 'Pinheiro' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Cabana' })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Pico' })).not.toBeChecked();
  await expect(page.getByRole('radio', { name: 'Explodida' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('checkbox', { name: 'Cabana' }).check();
  await page.getByRole('checkbox', { name: 'Pinheiro' }).uncheck();
  await expect(page.getByRole('checkbox', { name: 'Pinheiro' })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Cabana' })).toBeChecked();
  await settle(page);
  await page.screenshot({ path: `${SHOTS_DIR}/${testInfo.project.name}-18-rays-cabin-only.png` });
});

test('foco no fundo', async ({ page }, testInfo) => {
  // No pico a linha de corte fica isolada, longe do bosque: é a captura que
  // mostra se a faixa acende onde a física manda.
  await openLab(page, '?shot=optical-path&focus=2000');
  await page.screenshot({ path: `${SHOTS_DIR}/${testInfo.project.name}-05-focus-background.png` });
});

// --- Orçamento de desempenho (SPEC §8) -------------------------------------
// Contadores do renderer não dependem da GPU: dá para verificá-los mesmo no
// SwiftShader do Playwright. Os limites são os da SPEC.
test('orçamento: menos de 250 draw calls e 1,5 milhão de triângulos', async ({ page }) => {
  await openLab(page, '?focus=600');
  const frame = await page.evaluate(() => window.__lab ?? null);
  expect(frame).not.toBeNull();
  // Registra os números no relatório: o orçamento é para acompanhar, não só
  // para passar ou falhar.
  console.info(`orçamento: ${frame!.drawCalls} draw calls, ${frame!.triangles} triângulos`);
  expect(frame!.drawCalls).toBeLessThan(250);
  expect(frame!.triangles).toBeLessThan(1_500_000);
});

// --- Dupla fenda, na segunda bancada (ADR 0008 e 0009) ----------------------
test('dupla fenda: franjas, detectores e fenda tampada', async ({ page }, testInfo) => {
  await openLab(page, '#/double-slit');
  // Os números vêm do motor: λ de de Broglie a 50 kV e λL/d a 1,40 m.
  await expect(page.locator('.chip[data-id="wavelength"] .chip__value')).toHaveText('5,36 pm');
  await expect(page.locator('.chip[data-id="spacing"] .chip__value')).toHaveText('0,94 µm');
  await expect(page.locator('.chip[data-id="pattern"] .chip__value')).toHaveText('Ondulatório');
  await expect(page.locator('.hud__sentence')).toContainText('19 franjas');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS_DIR}/${testInfo.project.name}-20-double-slit.png` });

  await openControls(page);
  await page.getByRole('radio', { name: 'Ligados', exact: true }).click();
  await expect(page.locator('.chip[data-id="pattern"] .chip__value')).toHaveText('Corpuscular');
  await expect(page.locator('.hud__sentence')).toContainText('duas faixas');
  await page.getByRole('radio', { name: 'Só o padrão' }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS_DIR}/${testInfo.project.name}-21-detectors-on.png` });

  await page.getByRole('checkbox', { name: 'Esquerda' }).uncheck();
  await expect(page.locator('.chip[data-id="pattern"] .chip__value')).toHaveText('Fenda única');
  await expect(page.locator('.hud__sentence')).toContainText('Só a fenda direita aberta');
});

test('troca de bancada pelo seletor e pelas setas', async ({ page }) => {
  await openLab(page);
  await expect(page.locator('.chip[data-id="zone"]')).toHaveCount(1);
  await page.getByRole('tab', { name: 'Dupla fenda' }).click();
  await expect(page).toHaveURL(/#\/double-slit$/);
  await expect(page.locator('.chip[data-id="pattern"]')).toHaveCount(1);
  // Os chips da lente saem com ela.
  await expect(page.locator('.chip[data-id="zone"]')).toHaveCount(0);
  await expect(page).toHaveTitle(/dupla fenda/i);

  await page.keyboard.press('ArrowLeft');
  // A troca espera o voo em andamento e pré-desenha a bancada de destino; no
  // SwiftShader dos testes esse desenho leva segundos (numa GPU, milissegundos).
  await expect(page).toHaveURL(/#\/lens-focus$/, { timeout: 60_000 });
  await expect(page.locator('.chip[data-id="zone"]')).toHaveCount(1);
  await expect(page.locator('.chip[data-id="pattern"]')).toHaveCount(0);
});

test('orçamento da dupla fenda', async ({ page }) => {
  await openLab(page, '#/double-slit');
  await page.waitForTimeout(500);
  const frame = await page.evaluate(() => window.__lab ?? null);
  expect(frame).not.toBeNull();
  console.info(`orçamento (dupla fenda): ${frame!.drawCalls} draw calls, ${frame!.triangles} triângulos`);
  expect(frame!.drawCalls).toBeLessThan(250);
  expect(frame!.triangles).toBeLessThan(1_500_000);
});

// --- Força magnética, na terceira bancada (ADR 0010) ------------------------
test('força magnética: círculo, hélice e campo paralelo', async ({ page }, testInfo) => {
  await openLab(page, '#/magnetic-force');
  // A 250 V e 0,5 mT, o elétron mais rápido gira num círculo de 10,7 cm.
  await expect(page.locator('.chip[data-id="field"] .chip__value')).toHaveText('0,50 mT');
  await expect(page.locator('.chip[data-id="radius"] .chip__value')).toHaveText('10,7 cm');
  await expect(page.locator('.chip[data-id="path"] .chip__value')).toHaveText('Círculo');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS_DIR}/${testInfo.project.name}-22-magnetic.png` });

  // Bobinas a 20°: o campo faz 70° com o feixe e o círculo vira hélice.
  await page.keyboard.press('2');
  await expect(page.locator('.chip[data-id="path"] .chip__value')).toHaveText('Hélice');
  await expect(page.locator('.hud__sentence')).toContainText('uma hélice');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS_DIR}/${testInfo.project.name}-23-magnetic-helix.png` });

  await page.keyboard.press('3');
  await expect(page.locator('.chip[data-id="path"] .chip__value')).toHaveText('Reta');
  await expect(page.locator('.hud__sentence')).toContainText('v × B = 0');
});

test('orçamento da força magnética', async ({ page }) => {
  await openLab(page, '#/magnetic-force');
  await page.waitForTimeout(500);
  const frame = await page.evaluate(() => window.__lab ?? null);
  expect(frame).not.toBeNull();
  console.info(`orçamento (força magnética): ${frame!.drawCalls} draw calls, ${frame!.triangles} triângulos`);
  expect(frame!.drawCalls).toBeLessThan(250);
  expect(frame!.triangles).toBeLessThan(1_500_000);
});

// --- Resoluções da SPEC §9 que o projeto celular/desktop não cobre -----------
for (const [name, width, height] of [
  ['tablet', 768, 1024],
  ['fullhd', 1920, 1080],
] as const) {
  test.describe(`layout ${width}×${height}`, () => {
    test.use({ viewport: { width, height } });

    test(`HUD e painel não se sobrepõem em ${name}`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'basta um projeto para cada resolução');
      await openLab(page, '?focus=600');

      const hud = await page.locator('.hud').boundingBox();
      const panel = await page.locator('.control-panel').boundingBox();
      expect(hud).not.toBeNull();
      expect(panel).not.toBeNull();

      const overlaps =
        hud!.x < panel!.x + panel!.width &&
        panel!.x < hud!.x + hud!.width &&
        hud!.y < panel!.y + panel!.height &&
        panel!.y < hud!.y + hud!.height;
      expect(overlaps).toBe(false);

      await page.screenshot({ path: `${SHOTS_DIR}/${name}-01-default.png` });
    });
  });
}

// --- Imagem de compartilhamento (SPEC §12, F8) ------------------------------
test.describe('imagem OG', () => {
  test.use({ viewport: { width: 1200, height: 630 } });

  test('gera public/og.png', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'uma imagem basta');
    await openLab(page, '?focus=600');
    // Sem o painel de controles: no cartão de compartilhamento ele só polui.
    await page.addStyleTag({ content: '.control-panel, .labels { display: none !important; }' });
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'public/og.png' });
  });
});
