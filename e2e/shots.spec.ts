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
  await expect(page.getByRole('heading', { name: 'Sobre os tamanhos' })).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('pegadora de luz');
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
  // No desktop, pela aba; no celular só a bancada atual aparece, e a seta leva
  // à próxima.
  const tab = page.getByRole('tab', { name: 'Dupla fenda' });
  if (await tab.isVisible()) await tab.click();
  else await page.getByRole('button', { name: 'Próximo experimento' }).click();
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

// --- Tunelamento, na quarta bancada (ADR 0011) -----------------------------
test('tunelamento: transmissão, largura e muro abaixo da energia', async ({ page }, testInfo) => {
  await openLab(page, '#/tunneling');
  // E = 1 eV, V₀ = 2 eV, a = 0,4 nm: T exato de 6,42%, I = 10 nA · T.
  await expect(page.locator('.chip[data-id="transmission"] .chip__value')).toHaveText('6,42%');
  await expect(page.locator('.chip[data-id="current"] .chip__value')).toHaveText('642,38 pA');
  await expect(page.locator('.hud__sentence')).toContainText('nenhum passaria');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS_DIR}/${testInfo.project.name}-24-tunneling.png` });

  // Muro 0,1 nm mais largo: a transmissão cai exponencialmente.
  await page.keyboard.press(']');
  await page.keyboard.press(']');
  await expect(page.locator('.chip[data-id="width"] .chip__value')).toHaveText('0,50 nm');
  await expect(page.locator('.chip[data-id="transmission"] .chip__value')).toHaveText('2,35%');

  // Muro abaixo da energia do elétron: classicamente todos passariam.
  for (let i = 0; i < 13; i += 1) await page.keyboard.press('Comma');
  await expect(page.locator('.chip[data-id="height"] .chip__value')).toHaveText('0,70 eV');
  await expect(page.locator('.hud__sentence')).toContainText('todos passariam');
});

test('selo: visualizações e Instagram no canto', async ({ page }, testInfo) => {
  // O contador é um serviço externo: aqui ele responde um número fixo.
  await page.route('https://abacus.jasoncameron.dev/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"value":1234}' }),
  );
  await openLab(page, '#/magnetic-force');
  const badge = page.locator('.site-badge');
  await expect(badge).toBeVisible();
  // Só o olho e o número; o nome fica no rótulo acessível.
  await expect(badge.locator('.site-badge__views')).toHaveText('1.234');
  await expect(badge.locator('.site-badge__views')).toHaveAttribute('aria-label', 'Visualizações da página: 1.234');
  const link = page.getByRole('link', { name: 'Instagram de @juliophisico' });
  await expect(link).toHaveText('');
  await expect(link).toHaveAttribute('href', 'https://www.instagram.com/juliophisico/');
  await expect(link).toHaveAttribute('target', '_blank');
  if (testInfo.project.name !== 'mobile') {
    // Ao lado da navegação, sem encostar nela.
    const pad = await page.locator('.nav-pad').boundingBox();
    const box = await badge.boundingBox();
    expect(pad && box && box.x + box.width <= pad.x).toBe(true);
  }
  await page.screenshot({ path: `${SHOTS_DIR}/${testInfo.project.name}-41-site-badge.png` });
});

test('retratos: o quadro sai da parede e volta', async ({ page }, testInfo) => {
  await openLab(page, '#/double-slit');
  const mobile = testInfo.project.name === 'mobile';
  // Paul Dirac: na vista padrão da dupla fenda, fora do HUD e do painel.
  type Centers = ({ x: number; y: number } | null)[];
  const centers = await page.evaluate(
    (): Centers => (window as unknown as { __labPortraits?: () => Centers }).__labPortraits?.() ?? [],
  );
  const center = centers[5];
  expect(center).toBeTruthy();
  // No celular o topo do quadro fica sob o HUD: toca a metade de baixo.
  if (mobile) await page.touchscreen.tap(center!.x, center!.y + 30);
  else await page.mouse.click(center!.x, center!.y);
  const viewer = page.getByRole('dialog', { name: 'Paul Dirac' });
  await expect(viewer).toBeVisible();
  // Só a biografia e o crédito da foto.
  await expect(viewer).toContainText('pósitron');
  await expect(viewer).toContainText('Foto: Fundação Nobel');
  await expect(viewer).not.toContainText('Nas bancadas');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS_DIR}/${testInfo.project.name}-42-portrait.png` });
  await page.getByRole('button', { name: 'Devolver o quadro à parede' }).click();
  await expect(viewer).toBeHidden();
});

test('música: começa no primeiro gesto, troca de faixa e silencia', async ({ page }) => {
  await openLab(page, '#/tunneling');
  const music = page.getByRole('group', { name: 'Música' });
  await expect(music).toBeVisible();
  await expect(music.getByRole('slider', { name: 'Volume da música' })).toHaveValue('10');
  const title = page.locator('.music__title span');
  await expect(title).toHaveText('Bach · Ária na Corda Sol');
  await music.getByRole('button', { name: 'Próxima música' }).click();
  await expect(title).toHaveText('Beethoven · Sonata ao Luar, 1º mov.');
  await music.getByRole('button', { name: 'Música anterior' }).click();
  await music.getByRole('button', { name: 'Música anterior' }).click();
  // Volta ao fim da lista: a sequência é um laço.
  await expect(title).toHaveText('Mozart · Sonata K. 333, Andante');
  const mute = music.getByRole('button', { name: 'Silenciar a música' });
  await mute.click();
  await expect(music.getByRole('button', { name: 'Ligar o som da música' })).toHaveAttribute('aria-pressed', 'true');
});

test('alta qualidade: começa desligada, liga e volta desligada na próxima visita', async ({ page }, testInfo) => {
  await openLab(page, '#/double-slit');
  const toggle = page.locator('.quality-toggle');
  await expect(toggle).toBeVisible();
  // Toda visita começa no modo leve.
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  const light = await page.evaluate(() => window.__lab?.drawCalls ?? 0);
  await page.screenshot({ path: `${SHOTS_DIR}/${testInfo.project.name}-43-lightweight.png` });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle).toBeEnabled({ timeout: 30_000 });
  await page.waitForTimeout(800);
  const high = await page.evaluate(() => window.__lab?.drawCalls ?? 0);
  // Com sombras e bloom, há mais chamadas de desenho.
  expect(high).toBeGreaterThan(light);
  await page.reload();
  await page.waitForFunction(() => window.__labReady === true, undefined, { timeout: 60_000 });
  await expect(page.locator('.quality-toggle')).toHaveAttribute('aria-pressed', 'false');
});

test.describe('navegador em inglês', () => {
  test.use({ locale: 'en-US' });

  test('o laboratório abre em inglês', async ({ page }) => {
    await openLab(page, '#/tunneling');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('button', { name: /High quality/ })).toBeVisible();
  });
});

test('orçamento do tunelamento', async ({ page }) => {
  await openLab(page, '#/tunneling');
  await page.waitForTimeout(500);
  const frame = await page.evaluate(() => window.__lab ?? null);
  expect(frame).not.toBeNull();
  console.info(`orçamento (tunelamento): ${frame!.drawCalls} draw calls, ${frame!.triangles} triângulos`);
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

test('vídeo explicativo: a TV abre o vídeo e cala a música', async ({ page }, testInfo) => {
  await openLab(page);
  // Um gesto antes, para a música de fundo começar.
  await page.mouse.click(5, 450);
  await page.keyboard.press('v');
  const viewer = page.getByRole('dialog', { name: 'Planka e as Lentes' });
  await expect(viewer).toBeVisible();
  await expect(page.locator('.music')).toHaveClass(/music--suspended/);
  await expect(page.locator('.music__title span')).toHaveText('Pausada durante o vídeo');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS_DIR}/${testInfo.project.name}-44-video.png` });
  await page.getByRole('button', { name: 'Fechar o vídeo' }).click();
  await expect(viewer).toBeHidden();
  await expect(page.locator('.music')).not.toHaveClass(/music--suspended/);
});

test('vídeo explicativo: TV na bancada', async ({ page }, testInfo) => {
  await openLab(page, '?shot=overview');
  await page.screenshot({ path: `${SHOTS_DIR}/${testInfo.project.name}-45-video-tv.png` });
});

test('vídeo explicativo da dupla fenda: tecla B', async ({ page }, testInfo) => {
  await openLab(page, '#/double-slit');
  await page.mouse.click(5, 450);
  await page.keyboard.press('b');
  const viewer = page.getByRole('dialog', { name: 'Planka e a Dupla Fenda' });
  await expect(viewer).toBeVisible();
  await expect(page.locator('.music')).toHaveClass(/music--suspended/);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS_DIR}/${testInfo.project.name}-46-video-fenda.png` });
  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS_DIR}/${testInfo.project.name}-47-tv-fenda.png` });
});

test('vídeo explicativo da força magnética: tecla V', async ({ page }, testInfo) => {
  await openLab(page, '#/magnetic-force');
  await page.mouse.click(5, 450);
  await page.keyboard.press('v');
  const viewer = page.getByRole('dialog', { name: 'Planka e a Força Magnética' });
  await expect(viewer).toBeVisible();
  await expect(page.locator('.music')).toHaveClass(/music--suspended/);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS_DIR}/${testInfo.project.name}-48-video-magnetismo.png` });
  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS_DIR}/${testInfo.project.name}-49-tv-magnetismo.png` });
});

test('vídeo explicativo do tunelamento: tecla V', async ({ page }, testInfo) => {
  await openLab(page, '#/tunneling');
  await page.mouse.click(5, 450);
  await page.keyboard.press('v');
  const viewer = page.getByRole('dialog', { name: 'Planka e o Tunelamento' });
  await expect(viewer).toBeVisible();
  await expect(page.locator('.music')).toHaveClass(/music--suspended/);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS_DIR}/${testInfo.project.name}-50-video-tunelamento.png` });
  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS_DIR}/${testInfo.project.name}-51-tv-tunelamento.png` });
});

// --- Buraco negro, na quinta bancada (ADR 0017) ------------------------------
test('buraco negro: sombra, anel de Einstein e visão didática', async ({ page }, testInfo) => {
  await openLab(page, '#/black-hole');
  // 10 M☉: horizonte 2GM/c² = 29,5 km; telescópio a 500 km (33,9 M): sombra
  // de 8,56° e anel de Einstein exato de 22,2°.
  await expect(page.locator('.chip[data-id="mass"] .chip__value')).toHaveText('10 M☉');
  await expect(page.locator('.chip[data-id="horizon"] .chip__value')).toHaveText('29,5 km');
  await expect(page.locator('.chip[data-id="shadow"] .chip__value')).toHaveText('8,56°');
  await expect(page.locator('.chip[data-id="ring"] .chip__value')).toHaveText('22,2°');
  await expect(page.locator('.hud__sentence')).toContainText('duas imagens');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS_DIR}/${testInfo.project.name}-52-black-hole.png` });

  // Estrela alinhada, disco desligado, telescópio mais longe: o anel aparece.
  await page.keyboard.press('x');
  await page.keyboard.press('o');
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('Equal');
  await expect(page.locator('.hud__sentence')).toContainText('anel de Einstein');
  await expect(page.locator('.chip[data-id="shadow"] .chip__value')).toHaveText('2,92°');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS_DIR}/${testInfo.project.name}-53-black-hole-ring.png` });

  // Visão didática: horizonte, esfera de fótons e raio crítico.
  await page.keyboard.press('v');
  await expect(page.locator('.label', { hasText: 'Esfera de fótons' })).toHaveCount(1);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SHOTS_DIR}/${testInfo.project.name}-54-black-hole-didactic.png` });
});

test('orçamento do buraco negro', async ({ page }) => {
  await openLab(page, '#/black-hole');
  await page.waitForTimeout(500);
  const frame = await page.evaluate(() => window.__lab ?? null);
  expect(frame).not.toBeNull();
  console.info(`orçamento (buraco negro): ${frame!.drawCalls} draw calls, ${frame!.triangles} triângulos`);
  expect(frame!.drawCalls).toBeLessThan(250);
  expect(frame!.triangles).toBeLessThan(1_500_000);
});

// --- Figuras de Chladni, na sexta bancada (ADR 0018) --------------------------
test('chladni: ressonância, entre modos e placa redonda', async ({ page }, testInfo) => {
  await openLab(page, '#/chladni');
  // Placa de aço de 24 cm e 0,8 mm: o modo (1, 4) ressoa em 17 × 33,2 Hz.
  await expect(page.locator('.chip[data-id="frequency"] .chip__value')).toHaveText('564,7 Hz');
  await expect(page.locator('.chip[data-id="mode"] .chip__value')).toHaveText('(1, 4)');
  await expect(page.locator('.chip[data-id="resonance"] .chip__value')).toHaveText('100%');
  await expect(page.locator('.hud__sentence')).toContainText('Ressonância');
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${SHOTS_DIR}/${testInfo.project.name}-55-chladni.png` });

  // 2% acima: fora da ressonância, nenhum modo domina.
  await page.keyboard.press('Equal');
  await expect(page.locator('.chip[data-id="mode"] .chip__value')).toHaveText('—');
  await expect(page.locator('.hud__sentence')).toContainText('Entre ressonâncias');

  // Placa redonda, próximo modo pelo atalho.
  await page.keyboard.press('f');
  await page.keyboard.press('BracketRight');
  await expect(page.locator('.hud__sentence')).toContainText('Ressonância');
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${SHOTS_DIR}/${testInfo.project.name}-56-chladni-round.png` });

  // Som: começa mudo; ligado, cala a música de fundo; desligado, ela volta.
  await expect(page.locator('.music--suspended')).toHaveCount(0);
  await page.keyboard.press('m');
  await expect(page.locator('.music--suspended')).toHaveCount(1);
  await page.keyboard.press('m');
  await expect(page.locator('.music--suspended')).toHaveCount(0);
});

test('orçamento da bancada de Chladni', async ({ page }) => {
  await openLab(page, '#/chladni');
  await page.waitForTimeout(500);
  const frame = await page.evaluate(() => window.__lab ?? null);
  expect(frame).not.toBeNull();
  console.info(`orçamento (Chladni): ${frame!.drawCalls} draw calls, ${frame!.triangles} triângulos`);
  expect(frame!.drawCalls).toBeLessThan(250);
  expect(frame!.triangles).toBeLessThan(1_500_000);
});

// --- Batimentos, na sétima bancada (ADR 0019) --------------------------------
test('batimentos: |f₁ − f₂|, quinta do piano e som', async ({ page }, testInfo) => {
  await openLab(page, '#/beats');
  // 440 Hz e 442 Hz: duas batidas por segundo.
  await expect(page.locator('.chip[data-id="f1"] .chip__value')).toHaveText('440,00 Hz');
  await expect(page.locator('.chip[data-id="f2"] .chip__value')).toHaveText('442,00 Hz');
  await expect(page.locator('.chip[data-id="beat"] .chip__value')).toHaveText('2,00 Hz');
  await expect(page.locator('.chip[data-id="period"] .chip__value')).toHaveText('0,50 s');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS_DIR}/${testInfo.project.name}-57-beats.png` });

  // Desafinação zerada: uníssono, sem batimento.
  await page.keyboard.press('0');
  await expect(page.locator('.chip[data-id="beat"] .chip__value')).toHaveText('0,00 Hz');
  await expect(page.locator('.hud__sentence')).toContainText('Uníssono');

  // A quinta temperada bate entre harmônicos: 3·220 − 2·329,628 = 0,745 Hz.
  await openControls(page);
  await page.getByRole('button', { name: 'Quinta do piano' }).click();
  await expect(page.locator('.chip[data-id="beat"] .chip__value')).toHaveText('0,74 Hz');
  await expect(page.locator('.hud__sentence')).toContainText('harmônico 3');

  // Som: ligado, cala a música de fundo.
  await page.keyboard.press('m');
  await expect(page.locator('.music--suspended')).toHaveCount(1);
  await page.keyboard.press('m');
  await expect(page.locator('.music--suspended')).toHaveCount(0);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS_DIR}/${testInfo.project.name}-58-beats-fifth.png` });
});

test('orçamento da bancada dos batimentos', async ({ page }) => {
  await openLab(page, '#/beats');
  await page.waitForTimeout(500);
  const frame = await page.evaluate(() => window.__lab ?? null);
  expect(frame).not.toBeNull();
  console.info(`orçamento (batimentos): ${frame!.drawCalls} draw calls, ${frame!.triangles} triângulos`);
  expect(frame!.drawCalls).toBeLessThan(250);
  expect(frame!.triangles).toBeLessThan(1_500_000);
});

// --- Foguete, na oitava bancada (ADR 0020) -----------------------------------
test('foguete: Tsiolkovsky, perdas e lançamento', async ({ page }, testInfo) => {
  await openLab(page, '#/rocket');
  // 131 t, dois estágios, Isp 320 s: Δv ideal 10,73 km/s; com gravidade e ar,
  // 7,90 km/s no fim das queimas (perdas de 2,79 e 0,04 km/s).
  await expect(page.locator('.chip[data-id="ideal"] .chip__value')).toHaveText('10,73 km/s');
  await expect(page.locator('.chip[data-id="reached"] .chip__value')).toHaveText('7,90 km/s');
  await expect(page.locator('.chip[data-id="ratio"] .chip__value')).toHaveText('37,4');
  await expect(page.locator('.hud__sentence')).toContainText('2,79 km/s');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS_DIR}/${testInfo.project.name}-59-rocket.png` });

  // Sem gravidade nem ar, o voo integrado é exatamente Tsiolkovsky.
  await page.keyboard.press('g');
  await page.keyboard.press('h');
  await expect(page.locator('.chip[data-id="reached"] .chip__value')).toHaveText('10,73 km/s');
  await expect(page.locator('.hud__sentence')).toContainText('exatamente o que Tsiolkovsky prevê');

  // Lançamento: a altitude sobe.
  await page.keyboard.press('g');
  await page.keyboard.press('h');
  await page.keyboard.press('l');
  await expect(page.locator('.chip[data-id="altitude"] .chip__value')).not.toHaveText('0 m', { timeout: 30_000 });
  await page.waitForTimeout(8000);
  await page.screenshot({ path: `${SHOTS_DIR}/${testInfo.project.name}-60-rocket-flight.png` });
});

test('orçamento da bancada do foguete', async ({ page }) => {
  await openLab(page, '#/rocket');
  await page.waitForTimeout(500);
  const frame = await page.evaluate(() => window.__lab ?? null);
  expect(frame).not.toBeNull();
  console.info(`orçamento (foguete): ${frame!.drawCalls} draw calls, ${frame!.triangles} triângulos`);
  expect(frame!.drawCalls).toBeLessThan(250);
  expect(frame!.triangles).toBeLessThan(1_500_000);
});

test('vídeo explicativo do buraco negro: tecla B', async ({ page }, testInfo) => {
  await openLab(page, '#/black-hole');
  await page.mouse.click(5, 450);
  await page.keyboard.press('b');
  const viewer = page.getByRole('dialog', { name: 'Planka e o Buraco Negro' });
  await expect(viewer).toBeVisible();
  await expect(page.locator('.music')).toHaveClass(/music--suspended/);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS_DIR}/${testInfo.project.name}-61-video-buraconegro.png` });
  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS_DIR}/${testInfo.project.name}-62-tv-buraconegro.png` });
});
