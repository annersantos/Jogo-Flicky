# Plano de Implementação — Adaptação para Navegador de Celular

> Jogo: **Flicky do Jardim** — campanha de 10 fases já existente.
> Objetivo: adaptar o jogo (que já funciona no desktop) para navegador de celular,
> com controles por toque, interface responsiva e boa fluidez — **preservando fases,
> progressão, pontuação, vidas, inimigos e sistema de resgate**.
> Alterações feitas na raiz do projeto, sem criar uma versão separada.

## Skills aplicadas

| Skill | Arquivos lidos | Aplicação neste plano |
| --- | --- | --- |
| `game-development` | `SKILL.md` + sub-skills `mobile-games`, `web-games` | Abstração de entrada em **AÇÕES** (não teclas crus), passo de tempo fixo, pausa quando oculto, áudio exige interação, alvo de toque ≥44px, feedback visual, suporte a retrato/paisagem, não forçar orientação, sem controls desktop genéricos no mobile |
| `frontend-design` | `SKILL.md` + `ux-psychology.md` (obrigatório) | **Fitts**: botões ≥48px perto dos polegares; **Von Restorff**: arremesso com cor distinta; **feedback ≤400ms** ao pressionar; sem dependência de `hover`; hierarquia HUD → arena → controles |
| `app-builder` | `SKILL.md` + `feature-building.md` | Análise do projeto existente → plano → alterações integradas na estrutura atual → testes → documentação; nada de segunda cópia do projeto |

Todas as skills solicitadas estavam disponíveis.

---

## 1. Análise do Canvas, layout e sistema de entrada existentes

### O que existe hoje (verificado no código)

**Canvas/renderização (`js/game.js`, `js/level.js`)**
- Resolução lógica fixa 480×270 (`LEVEL.W/H`); `canvas.width/height` fixados em 480×270 no `boot()`.
- O cenário é pré-renderizado uma vez em canvas offscreen 480×270 com **cache por fase** (`LEVEL.buildScenery`) e desenhado a cada quadro com `drawImage(scenery, 0, 0)`.
- CSS estica o canvas com `width/height: 100%` + `image-rendering: pixelated` — **não há tratamento de `devicePixelRatio`** nem limite configurável; `imageSmoothingEnabled = false` é definido **uma única vez** no boot (um redimensionamento de canvas zera esse estado).
- Laço: **um único** `requestAnimationFrame` (guarda `booted`), passo fixo `STEP = 1/120` com acumulador, clamp `dt > 0.25`, `last/acc` zerados ao retomar da pausa.
- Sem `resize`/`orientationchange` — o canvas só é dimensionado no boot.

**Layout (`index.html`, `style.css`)**
- Estrutura em coluna: `#hud` → `#stage` (canvas + **controles de toque dentro da arena**) → `#hint`.
- Os botões de toque são `position: absolute` **dentro de `#stage`** → os dedos **cobrem personagens/plataformas** (fundo da arena).
- Viewport: `maximum-scale=1, user-scalable=no` → **bloqueia zoom global** (contra a exigência de ampliar textos das instruções).
- `touch-action: none` no `html/body` → bloqueia também gestos dentro dos painéis de instrução (interseção de ancestrais).
- Áreas seguras: apenas `padding` com `env(safe-area-inset-*)` no `body`; sem distinção vertical/horizontal de layout (retrato usa o mesmo fluxo de paisagem).
- Controles de pausa só por teclado (Esc/P) — **não há botão de pausa** para toque; som tem botão (`#btnMute`), sem persistência da preferência.

**Entrada (`js/game.js`)**
- Teclado e toque escrevem nos **mesmos campos** de `input`, mas **sem rastreio por origem**: soltar o toque zera a ação mesmo que a tecla continue pressionada (e vice-versa) → entrada não verdadeiramente unificada.
- Ponteiros já usam `setPointerCapture`, mas **sem mapa `pointerId → ação`** (dois dedos no mesmo botão ou deslizamentos não são acompanhados individualmente) e sem estado visual `.pressed` confiável (depende de `:active`).
- `clearInput()` é chamado em pausa/mudança de fase, mas **não limpa as origens** dos botões.
- Áudio (`js/audio.js`): `init()` na primeira interação e `resume()` em `play()`; **sem `suspend()` na visibilidade**; preferência de som **não persiste** em `localStorage`.

### Lacunas mapeadas para as seções 2–6

| # | Exigência | Situação atual | Trabalho necessário |
| --- | --- | --- | --- |
| 2 | Entrada unificada por ações | Parcial (campos comuns, sem origens) | Sistema de ações com origens `kbd`/`ptr` |
| 3 | Multitoque individual + captura | Parcial (captura sim, mapa não) | Mapa `pointerId→ação`, refcount, `.pressed` |
| 4 | Retrato/paisagem separando controles da arena | Não (controles dentro da arena) | Novo `#mid` em grade, controles fora |
| 5 | Foco/pausa/rotação/áudio | Foco✓, rotação✗, áudio parcial | `pagehide`, rotação sem reinício, `SFX.suspend/resume`, persistir som |
| 6 | Renderização/desempenho com DPR | Sem DPR, sem resize | `resizeCanvas()` com `DPR_CAP`, transform, sem realocações por quadro |
| 7 | Validação e documentação | Suíte da campanha (357) | Novas seções de teste mobile + README |

---

## 2. Unificação dos comandos de teclado e toque

**Tarefas**
- [x] Criar `setAction(nome, origem, pressionado)` com mapa de origens por ação (`{kbd, ptr}`) e valor final `input[nome] = kbd || ptr`.
- [x] Transição `false → true` dispara o evento de borda: `jumpQueued` (um salto por pressionamento) e `throwQueued` (um arremesso por pressionamento; auto-repeat do teclado não re-enfileira).
- [x] Teclado e botões de toque passam a chamar `setAction` — mesma camada de ações para os dois dispositivos (teclas crus não tocam mais em `input` diretamente).
- [x] Ações ignoradas quando `state !== 'play'` (exceto pausa/menu), para nenhum comando “pendurar” entre estados.
- [x] `clearInput()` também zera todas as origens e remove a classe visual `.pressed` — chamado em **pausa, perda de foco, ocultar aba e mudança de fase**.

**Critério de conclusão**
- Segurar esquerda no teclado **e** no toque, soltar um → a ação continua ativa enquanto a outra origem persistir; soltar as duas → para.
- Suíte existente (357 asserções) segue verde, pois `input` continua sendo o mesmo objeto mutável exposto em `Flicky.input`.

---

## 3. Implementação dos controles com multitoque

**Tarefas**
- [x] 4 botões: esquerda/direita (polegar esquerdo), arremesso/salto (polegar direito) — IDs `btnLeft/btnRight/btnThrow/btnJump` preservados.
- [x] `pointerdown` registra `pointerIds[ação] = pointerId` (um dedo por ação, acompanhamento individual), chama `setPointerCapture` (evita comando preso ao sair do botão).
- [x] `pointerup`, `pointercancel` e `lostpointercapture` liberam **apenas** aquele ponteiro e reavaliam a ação.
- [x] Resposta visual `.pressed` (cor + deslocamento) enquanto pressionado — independente de `:hover`.
- [x] Área de toque ≥ **48×48px CSS** (`min-width/min-height` + `clamp` maior quando há espaço).
- [x] Botões de **pausa** (`#btnPause`) e **tela cheia** (`#btnFull`, exibido só se a API existir) no HUD, junto do som (`#btnMute`) — todos com `aria-label`.
- [x] Texto do menu/pausa adaptado quando o aparelho tem entrada por toque (detecção por `matchMedia`/`maxTouchPoints` com guarda para testes headless).

**Critério de conclusão**
- Andar + pular simultâneos e andar + arremessar simultâneos via toque (2 dedos) verificados em teste.
- `pointerup`/`pointercancel` interrompe o comando; tocar na arena (canvas) não dispara ações.

---

## 4. Adaptação dos layouts vertical e horizontal

**Tarefas**
- [x] Viewport: manter `width=device-width, initial-scale=1, viewport-fit=cover` e **remover** `maximum-scale/user-scalable=no` (zoom global liberado).
- [x] Nova estrutura: `#hud` → `#mid` (grade com `#stage` + `.pad-left` + `.pad-right`) → `#hint`. Controles **fora da arena**.
- [x] **Retrato**: grade `"stage stage" / "padl padr"` → informações no topo, arena no centro, controles abaixo, cantos dos polegares.
- [x] **Paisagem**: grade `"padl stage padr"` → usa a largura, controles em trilhas laterais reservadas.
- [x] Arena com proporção 16/9 preservada (`aspect-ratio` + largura `min(…)` em unidades de contêiner `cqw/cqh`, com `@supports` de fallback) — **sem esticar nem cortar**, fase inteira visível.
- [x] Largura de referência 360px CSS: tudo dimensionado em `clamp()/vw/vh` validados para 360×640.
- [x] `env(safe-area-inset-*)` em HUD, palco e controles (notch/barra de gestos).
- [x] Altura com barra do navegador: `100dvh` (com suporte `dvh`) + listener de `visualViewport.resize` → recalcula sem reiniciar a partida.
- [x] Girar o aparelho: `resize`/`orientationchange` apenas redimensionam o canvas — **nenhum estado do jogo muda** (fase, pontos, vidas, posições intactos).
- [x] `touch-action: none` no canvas e nos botões de ação; painel de instruções com `manipulation` (pinch-zoom liberado); sem seleção de texto, arraste de imagem e menu de toque prolongado no jogo.

**Critério de conclusão**
- Em 360×640 e 390×844 (retrato) e 844×390 (paisagem): HUD legível, arena inteira visível e sem distorção, botões ≥48px fora da arena, nada cortado (verificação estática de CSS + inspeção; aparelho real na seção 7).

---

## 5. Tratamento de foco, pausa, rotação e áudio

**Tarefas**
- [x] `blur` da janela, `visibilitychange` (aba oculta/troca de app) e `pagehide` → **pausar** e mostrar a tela de pausa; ao retornar aguardar “Continuar” (sem retomar sozinho).
- [x] Ao pausar: `clearInput()` (teclado + toque + `.pressed`) → nenhum comando preso na volta.
- [x] Rotação/orientação: só re-layout (`resizeCanvas`), partida intacta; **sem** bloqueio de orientação nem dependência de tela cheia.
- [x] Áudio: `SFX.init()` somente após gesto do usuário (Jogar/botões/tecla); `SFX.suspend()` ao ocultar e `SFX.resume()` ao voltar; preferência `flicky.som` persistida em `localStorage`; `play()` com `try/catch` — falha de áudio nunca impede a partida.
- [x] Botão de tela cheia só aparece se `requestFullscreen` existir (detecção de recurso; jogo funciona sem ela).

**Critério de conclusão**
- Teste headless: ocultar aba → estado `pause` + overlay Pausa visível; voltar → continua pausado até clicar “Continuar”; `SFX.suspend/resume` não lançam erro sem `AudioContext`; toggle de som grava `flicky.som`.

---

## 6. Ajustes de renderização e desempenho

**Tarefas**
- [x] `resizeCanvas()`: tamanho de exibição via `getBoundingClientRect()` × `devicePixelRatio` **limitado por `DPR_CAP` (2, constante configurável)**; backbuffer só muda quando o cálculo muda (sem trabalho por quadro).
- [x] Escala aplicada com `ctx.setTransform(backing/480, …)` (com guarda `typeof` para o rasterizador dos testes) + `imageSmoothingEnabled = false` reafirmado **a cada resize e a cada quadro** (estado do contexto zera em resize).
- [x] `render()` imediatamente após redimensionar → a cena nunca fica permanentemente apagada e **nenhum estado de partida é tocado**.
- [x] Um único laço rAF (`booted`), um único conjunto de listeners, listeners extras (`resize`, `orientationchange`, `visualViewport`, `pagehide`) com guarda de reexecução.
- [x] Intervalos longos contidos: clamp de `dt` (0,25s), limite de 40 passos por quadro, `last/acc` zerados no retomar; pausa impede acúmulo ao voltar de interrupção.
- [x] Sem mudanças em `SPEED`, `GRAV`, `JUMP_V`, `STEP` nem na lógica das fases — mesma velocidade e mesmo comportamento.
- [x] Alocações por quadro mantidas baixas (cenário em cache, sem criação de objetos novos no `render()`).

**Critério de conclusão**
- Teste: `Flicky.resize()` com `devicePixelRatio = 3` → backbuffer ≤ `480 × DPR_CAP` (teto respeitado); estado (fase/pontos/vidas/posição) idêntico antes e depois; suíte completa verde.

---

## 7. Validação e atualização da documentação

**Tarefas**
- [x] `node --check` em todos os JS.
- [x] `tests/headless.js`: manter as 357 asserções da campanha e **adicionar** seções mobile:
  andar+saltar e andar+arremessar simultâneos por toque; `pointerup`/`pointercancel` interrompendo;
  origem dupla teclado+toque; `clearInput` em pausa/fase; botão de pausa; pausa ao ocultar a aba
  com retorno aguardando “Continuar”; resize/rotação preservando a partida; teto de DPR;
  persistência do som; textos do menu com instruções de toque.
- [x] `tests/render.js`: continua gerando frames (inclui verificação de que o resize não apaga a cena).
- [x] `README.md`: controles mobile (tabela), instruções de abrir pelo celular e **servidor na rede local** (mesmo Wi‑Fi, IP local, porta, aviso de firewall/HTTPS).
- [x] Relatório final: arquivos alterados, como executar/acessar pelo celular, verificações feitas × pendentes em aparelho real.

**Critério de conclusão**
- `node tests/headless.js` → 0 falhas; `node tests/render.js` → frames gerados; README com seção mobile.
- **Pendente em aparelho real (não automatizável aqui):** toque multi-dedo real, fluidez em aparelho (iPhone 13/Android), comportamento da barra do Safari, notch/áreas seguras, gyro/orientação e áudio real.
