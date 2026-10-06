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

---

## 8. Correção do layout mobile — arena pequena e espaços vazios (iteração 2)

### 8.1 Causa encontrada (inspeção do CSS e do cálculo do Canvas)

No iPhone (retrato, 390×844) a arena estava **corretamente na largura total**, mas
centralizada dentro de uma **linha de grid com altura livre** — daí a percepção de
"arena pequena com grandes vazios acima e abaixo", somada a um painel alto:

| Origem | Efeito |
| --- | --- |
| `#mid { grid-template-rows: minmax(0, 1fr) }` — a linha da arena recebe **todo** o espaço vertical | ~600px de linha para uma arena de ~208px |
| `#mid { align-content: center; align-items: center }` — **centralização vertical em área grande** | ~170px de vazio **acima** e ~170px **abaixo** da arena |
| `#hud` com 5 caixas + rótulo "Vidas" + caixa "Recorde" + 3 botões de 48px, bordas e paddings grandes | painel quebra em **3 linhas** (~100px) |
| `#hint` — linha **permanente de instruções** abaixo dos controles | +14px e ruído visual |
| Escala da arena só via fórmulas CSS (`100cqh`) sem cálculo explícito de `min(larguraDisp/480, alturaDisp/270)` | sem controle fino do que é disponível após painel/controles/áreas seguras |
| Sem seleção automática de disposição em paisagem (regras amarradas a `@media (orientation)`) | controles laterais sempre, mesmo quando abaixo daria arena maior |

A física, o Canvas lógico 480×270 e o `devicePixelRatio` com teto já estavam
corretos — o problema era **distribuição de espaço e chrome de interface**.

### 8.2 Tarefas

- [x] **Cálculo de escala no JS**: `computeLayout(availW, availH, ctrl, gap, landscape)`
  com `escala = Math.min(larguraDisponível / 480, alturaDisponível / 270)`, medido no
  `#mid` (área **já líquida** de painel, controles, `dvh` e `env(safe-area-inset-*)`).
  Tamanho **visual** (px no `#stage`) separado da **resolução interna** (backbuffer do
  canvas = tamanhoVisual × dpr com `DPR_CAP`, suavização desligada, sem teto inteiro).
- [x] **Retrato**: empilhar sem vazios entre elementos — `grid-template-rows: auto auto`
  e `align-content: start` no modo toque (HUD colado na arena, controles logo abaixo);
  vazio residual apenas **no fim**, com dica discreta “Vire o celular para jogar com a
  tela maior”. No desktop mantém-se a centralização atual (layout preservado).
- [x] **Paisagem com disposição automática**: classe `#mid.mid-sides` (controles em
  trilhas laterais) escolhida pelo **maior** arena; se “controles abaixo” render
  maior (janela estreita/alta), usa essa disposição automaticamente.
- [x] **HUD compacto**: sem caixa “Recorde” (recorde fica no menu/pausa), sem rótulo
  “Vidas”, bordas/padding/gaps reduzidos, botões de pausa/som **44×44** mínimos —
  alvo de 1–2 linhas curtas com pontuação, vidas, fase e resgatados.
- [x] **Sem linha permanente de instruções**: `#hint` no toque exibe só a dica de
  rotação (oculto em paisagem); instruções de controle ficam no **menu e na pausa**.
- [x] **Painel dos overlays sempre dentro da arena** (defeito revelado pelas
  capturas): `.panel` vira coluna flex com `max-height: 100%` — **título e botões
  ficam fixos** e só o texto rola; antes, o menu (≈330px) era maior que a arena
  (≈208px) e `#stage { overflow: hidden }` cortava o título e o botão. Tipografia
  do painel compacta no toque. Sem overflow, o desktop renderiza igual.
- [x] **Botões de ação entre 56 e 72px** conforme o espaço (`clamp`), containers de
  controle sem margens/paddings extras.
- [x] **Sem comandos presos**: `clearInput()` ao girar (`orientationchange`) e quando
  a disposição muda; redimensionar/girar **não** reinicia fase nem altera posições.
- [x] Barras do Safari: `100dvh` com fallback, `env(safe-area-inset-*)` e
  `window.visualViewport.resize` recalculam o layout.
- [x] Validação: matemática `computeLayout` (retrato/paisagem/janela estreita/desktop),
  aplicação no DOM com retângulos simulados, preservação da partida, capturas de
  layout vertical e horizontal (`tests/layout-preview.js` → `tests/out/`).

### 8.3 Critérios de conclusão

- Retrato iPhone 13: HUD ≤2 linhas, arena na largura total (≈370×208 CSS), controles
  encostados na arena, **zero vazio entre elementos**, dica de rotação discreta.
- Menu/pausa inteiros nas duas orientações: título e botão sempre visíveis dentro
  da arena (texto rola quando não cabe).
- Paisagem iPhone 13: arena = maior retângulo possível (controles laterais 56–72px);
  disposição inferior escolhida automaticamente quando maior.
- Girar/redimensionar preserva fase, pontos, vidas e posições; nenhum comando preso.
- Desktop: layout e controles como estavam. Suíte completa verde + capturas geradas.

---

## 9. Controles lado a lado nas DUAS orientações + maior arena (iteração 3)

> Exigências desta iteração: (a) ◀ ▶ e ➤ ▲ sempre **lado a lado**, em retrato e
> em paisagem; (b) **ampliar a arena** removendo só o que é desnecessário;
> (c) paisagem com faixa fina no topo, arena ao centro e controles compactos —
> comparando "cantos inferiores × faixa inferior" e usando a de **maior arena**;
> (d) preservar fases, física, pontuação e progresso.

### 9.1 Causas encontradas (inspeção antes de mexer)

**Por que os botões de movimento ficaram um em cima do outro**

| Origem | Efeito |
| --- | --- |
| `#mid.mid-sides .pad { flex-direction: column; align-self: end; }` | Única regra que empilhava. A disposição `mid-sides` é **automática em paisagem** (escolhida por dar a maior arena) → ◀ sobre ▶ e ➤ sobre ▲ com um dedo em cima do outro |
| `.pad { display: flex; }` sem `flex-direction`/`flex-wrap` explícitos | lado a lado só por herança implícita — nada garantia a linha nem impedia futuras regras de quebra |

Em **retrato** os pares já eram linha (`L/R OK` na medição); o defeito aparecia
em **paisagem** — que é justamente onde a dica manda girar o celular.

**O que limitava o tamanho da arena**

| Limite | Onde | Perda |
| --- | --- | --- |
| Margem lateral do `body` (`padding: 6px`) | `style.css` | 12px de largura em **retrato** (378 de 390) |
| Moldura de 4px/lado do `#stage` | `style.css` + `STAGE_BORDER = 8` | 8px em cada eixo nas duas orientações |
| `gap` do `body` (6px) + `--gap` (8px) | `style.css` | 10px de altura em **paisagem** (altura é o fator limitante lá: 16:9 em tela de ~2,2:1) |
| HUD `width: max-content` centralado, 2 linhas, botões de 48px | `style.css` | sobras laterais + altura extra em paisagem |
| `computeLayout` cobrando das trilhas laterais **1 botão** (`2·ctrl`) enquanto o par agora tem **2** | `js/game.js` | sem corrigir, a arena invadiria os botões |
| Retrato: **largura** é o fator limitante | — | o cenário é 16:9 e já ocupava quase toda a largura; os ~450px de vazio vertical **não** podem virar arena sem distorcer/cortar (a isso a orientação manda reconhecer + dica de rotação, não "prometer" ganho) |

### 9.2 Tarefas

- [x] **Sem regra que empilhe**: `.pad { flex-direction: row; flex-wrap: nowrap; align-items: center; gap: var(--pair) }`;
  removido o `flex-direction: column` de `#mid.mid-sides .pad` (mantido só
  `align-self: end`, para o par ficar encostado na base, junto ao polegar).
  Teste estático: `/.pad { … flex-direction: row }/`, `flex-wrap: nowrap` e
  `!/#mid.mid-sides .pad { … flex-direction/`.
- [x] **Pares entre 56 e 68px CSS**: `--btn: clamp(56px, 16vw, 68px)` (retrato) e
  `clamp(56px, 13vh, 68px)` (paisagem); folga fixa de **6px** entre os dois
  botões do par (`--pair`) e **4px** entre arena e controles (`--gap`).
- [x] **HUD vira faixa de topo**: `width: 100%` (sem sobras laterais), `padding: 2px 4px`,
  `gap: 4px`, botões de ação 44×44 → **faixa de 52px em uma linha** em paisagem;
  em retrato continua em 2 linhas (78px) porque os textos exigidos
  ("Pontos", "Fase", "Resgatados", vidas, ⏸/som/tela cheia) não cabem em 378px.
- [x] **Sem margem lateral**: `body { padding: 4px 0 }` → a arena em retrato usa
  a **largura inteira da viewport** (390 de 390). Áreas seguras continuam via
  `env(safe-area-inset-*)` (só topo/base/laterais do notch).
- [x] **Moldura fina no toque**: `border-width: 2px` (4px no desktop, como estava)
  → `STAGE_BORDER_TOUCH = 4` no JS, mantendo `aspect-ratio`/proporção exatas.
- [x] **Custo real das trilhas laterais**: `computeLayout` agora desconta
  `2 × (2·ctrl + pair) + 2·gap` por lado — o par **inteiro** lado a lado cabe na
  trilha e nada cobre a arena (asserção `2·trilha + 2·gap + w + moldura ≤ largura`).
- [x] **Comparação exigida**: em paisagem o JS calcula as duas disposições
  ("cantos inferiores" × "faixa inferior") e escolhe a de **maior arena**;
  nenhuma delas empilha. Em retrato só existe a faixa inferior.
- [x] **Dica de rotação discreta** permanece em retrato (`#hint`, 9–11px, escura)
  e some em paisagem; nenhuma promessa de ganho vertical quando a largura é o limite.
- [x] **Redimensionamento**: `resize`/`orientationchange`/`visualViewport.resize`
  + `100dvh` recalculam a escala; `clearInput()` na troca de disposição — fase,
  pontos, vidas e posições intactos. Backbuffer continua `visual × dpr` com
  `DPR_CAP` e `imageSmoothingEnabled = false` (pixel art nítido).
- [x] **Validação**: `tests/measure.js` ganhou métricas do overlay (caixa do
  painel × arena e quanto o texto rola).

### 9.3 Medição antes × depois (mesmo aparelho/viewport simulado, Chrome headless)

| Cenário | Arena antes | Arena depois | Escala | Pares |
| --- | --- | --- | --- | --- |
| Retrato 390×844 (iPhone 13) | 378×216 | **390×221** | 0,79 → **0,81** | lado a lado → lado a lado |
| Retrato 390×650 (barras abertas) | 378×216 | **390×221** | 0,79 → **0,81** | OK |
| Retrato 360×640 (referência) | 348×199 | **360×204** | 0,73 → **0,75** | OK |
| **Paisagem 844×390 (iPhone 13)** | 559×318 | **576×326** | 1,16 → **1,20** | **EMPILHADO → lado a lado** |
| Paisagem 844×330 (barras abertas) | 452×258 | **470×266** | 0,94 → **0,98** | **EMPILHADO → lado a lado** |
| Paisagem 740×360 (janela estreita) | 506×288 | 496×281 | 1,05 → 1,03 | **EMPILHADO → lado a lado** |
| Desktop 1280×720 | 1112×629 | **1126×637** | 2,32 → **2,35** | OK |

Leitura honesta dos números:

- **Retrato**: ganho de 12px de largura (margem lateral removida) → +5px de altura
  da arena. Como a largura é o fator limitante, **é o máximo possível** sem
  esticar/cortar o cenário; o vazio vertical restante é irrelevante para a arena.
- **Paisagem 844×390**: +17px de largura e +8px de altura (margem lateral, gap,
  moldura e HUD mais fino) — em paisagem o limite é a **altura**.
- **Paisagem 844×330 (barras do navegador abertas)**: a altura útil cai 60px, mas
  a faixa de topo mais fina (72 → 64px de cromo) e a moldura fina devolvem
  altura à arena: 452×258 → **470×266** mesmo com as barras ocupando espaço.
- **Paisagem 740×360**: −10px de largura. As trilhas laterais agora acomodam o par
  **inteiro** (2 botões + folga = 118px cada, eram 64px) e manter os botões lado
  a lado em ambas as orientações é exigência desta iteração; mesmo assim a
  disposição **cantos** continua sendo a maior para essa janela (faixa inferior
  daria só 412×232).
- **Desktop**: ganho de 14px (sem margem lateral); HUD, controles, hint e
  moldura de 4px intactos.

### 9.4 Critérios de conclusão

- ◀ ▶ e ➤ ▲ lado a lado em **retrato e paisagem** (`L/R OK · Ação OK` nas 7
  medições), `flex-direction: row` + `flex-wrap: nowrap` e nenhuma regra que
  empilhe (asserções estáticas).
- Botões 56–68px CSS, folga de 6px entre eles, alvos ≥48px; multitoque
  (andar+saltar, andar+arremessar) e `pointerup`/`pointercancel` encerrando o
  comando — as mesmas asserções seguem verdes.
- Arena = maior `min(larguraDisp/480, alturaDisp/270)` que couber; proporção 16/9
  em todas as escalas; controles e HUD **fora** da arena (nenhuma interseção).
- Girar/redimensionar preserva fase, pontos, vidas, posições e fila; nenhum
  comando preso na troca de disposição.
- Suíte completa: **450 asserções, 0 falhas**; capturas de retrato, paisagem e
  desktop regeneradas em `tests/out/`.
