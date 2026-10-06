# Flicky do Jardim — Campanha de 10 fases

Jogo de plataforma 2D em tela fixa, inspirado em *Flicky*: você controla um
passarinho que coleta os filhotes espalhados pelas plataformas, forma a fila e
leva-os até a porta no chão — enquanto evita os gatos de patrulha. Campanha
completa de **10 fases**, objetos arremessáveis, pontuação acumulada, bônus de
tempo e recorde salvo no navegador.

Feito com **HTML5 + CSS + JavaScript puros** (Canvas 2D), sem bibliotecas e
**sem arquivos de asset externos**: as sprites são desenhadas por código e os
sons são sintetizados com a Web Audio API. Funciona em **computador e celular**
(página estática, sem instalação de aplicativo).

## Como rodar (computador)

O jogo precisa ser servido por um servidor HTTP local (por causa do carregamento
dos arquivos `js/*.js` via `<script>`).

### Opção 1 — Python (geralmente já instalado)

```bash
cd jogo-flicky
python -m http.server 8000
```

Depois abra <http://localhost:8000> no navegador.

> Se o `python` abrir a Microsoft Store, tente `python -m http.server 8000`,
> `py -m http.server 8000` ou use uma das opções abaixo.

### Opção 2 — Node.js

```bash
cd jogo-flicky
npx serve .
```

Ou, se tiver o `http-server` instalado:

```bash
npx http-server -p 8000 .
```

### Opção 3 — VS Code

Abra a pasta e use **Go Live** (extensão Live Server) ou clique com o botão
direito em `index.html` → *Open with Live Server*.

> Abrir o `index.html` direto com `file://` também funciona na maioria dos
> navegadores, mas o servidor local é o modo recomendado.

## Como jogar no celular (Wi‑Fi local)

1. **Suba o servidor no computador** ligado à mesma rede Wi‑Fi do celular:

   ```bash
   cd jogo-flicky
   python -m http.server 8000
   ```

   O `python -m http.server` já aceita conexões de fora por padrão.

2. **Descubra o IP do computador:**
   - Windows: `ipconfig` → IPv4 do adaptador Wi‑Fi (ex.: `192.168.0.15`)
   - macOS/Linux: `ip addr` ou `ifconfig` (ex.: `192.168.0.15`)

3. **No celular**, abra no navegador (mesma rede Wi‑Fi):

   ```
   http://192.168.0.15:8000
   ```

Observações:

- Se aparecer bloqueio, **libere a porta 8000** na firewall do computador
  (firewall pede permissão na primeira execução — permita na rede privada).
- O acesso é **HTTP na rede local** — não é preciso HTTPS nem internet.
- Para usar o Node: `npx http-server -p 8000 -a 0.0.0.0 .`
- Testado-alvo de layout: **iPhone 13** (Safari) e Android (Chrome), em
  retrato e paisagem.

## Controles

| Ação | Teclado | Toque (celular/tablet) |
| --- | --- | --- |
| Mover | ← → ou A / D | ◀ ▶ **lado a lado** (esquerda, polegar esquerdo) |
| Pular | Espaço, W ou ↑ | ▲ **lado a lado com ➤** (direita, polegar direito) |
| Arremessar objeto | X ou J | ➤ laranja **lado a lado com ▲** (direita, polegar direito) |
| Pausar / retomar | Esc ou P | Botão ⏸ no HUD (ou "Continuar") |
| Ligar/desligar som | M | Botão de som no HUD (ícone) |
| Tela cheia | — | Botão ⛶ no HUD (só se o navegador suportar) |
| Iniciar (menu) | Enter ou Espaço | Botão **Jogar** |

- **Multitoque:** cada botão acompanha o próprio dedo — dá para andar + pular
  ou andar + arremessar ao mesmo tempo; soltar ou cancelar o toque encerra
  exatamente aquele comando.
- No teclado, soltar uma tecla mantém a ação enquanto outro dispositivo
  (toque) ainda estiver pressionando — entrada unificada por ações.
- No toque, a movimentação continua enquanto o botão estiver pressionado.
- Perder o foco da janela/aba, trocar de aplicativo ou pausar **limpa todos os
  comandos** (nada fica "pendurado" ao voltar).
- O layout é responsivo em **retrato** (painel compacto no topo, arena ocupando
  a largura toda, controles logo abaixo) e em **paisagem** (faixa fina no topo,
  arena central e pares de controles junto aos polegares). Em **ambas** as
  orientações os pares ficam **lado a lado** — ◀ ▶ à esquerda, ➤ ▲ à direita —
  nunca empilhados, e a arena é calculada como a maior que couber no espaço
  visível. O jogo nunca cobre personagens, plataformas ou a porta com os
  controles, respeita notch e barra de gestos (`env(safe-area-inset-*)`) e não
  trava a orientação nem exige tela cheia.
- **Girar o celular recalcula o layout sem reiniciar a partida** (fase, pontos,
  vidas e posições permanecem).

## Regras

- **Filhotes:** encostar em um filhote faz ele seguir você. A fila segue o
  **histórico exato do seu percurso** — ninguém atrapassa, teletransporta ou
  atravessa plataforma.
- **Dispersão:** se um gato atingir a fila, solta o filhote atingido **e todos
  os atrás dele**. Os da frente continuam seguindo. Filhotes soltos podem ser
  recolhidos de novo.
- **Porta:** ao tocar a porta com a fila, todos entram e valem **100 pontos por
  filhote + 50 bônus por cada filhote extra da mesma viagem**
  (3 juntos = 400 pontos). Dá para fazer várias viagens — a fase só termina
  quando `Resgatados: N/N` chega ao total.
- **Objetos arremessáveis:** encoste para carregar **um objeto por vez** e
  pressione X/J (ou ➤) para lançá-lo na direção do olhar. Acertar um gato vale
  **100 pontos** (uma única vez por acerto) e deixa o gato **atordoado** por
  ~2,5 s: fora de ação, ele desaparece e **reaparece num ponto seguro** da
  patrulha, longe do jogador. Um objeto que erra pousa e pode ser recolhido.
- **Vidas:** a campanha começa com 3 vidas. Ao ser atingido, você perde 1 vida e
  reaparece num ponto seguro com 2 segundos de invulnerabilidade (pisca).
  Filhotes já **entregues permanecem resgatados**; os que estavam seguindo vão
  para pontos seguros alcançáveis. Vidas e pontuação **são preservadas entre
  fases**.
- **Bônus de tempo:** ao concluir cada fase, ganhe
  `max(0, 120 − segundos_inteiros) × 10` pontos.
- **Recorde:** salvo no `localStorage` e exibido no HUD e nas telas finais.
  A preferência de som também é persistida (`flicky.som`).
- **Telas:** menu inicial, pausa, "Fase concluída" (com botão **Próxima fase**
  nas fases 1–9), Game Over (com **Nova campanha**) e **Vitória** — que só
  aparece após concluir a **fase 10**, com pontuação total, recorde e
  **Jogar novamente**.
- **Pausa:** Esc, P, botão ⏸ ou ao perder o foco/trocar de aplicativo (física,
  inimigos e cronômetro congelam; ao voltar a tela de pausa aguarda você).
- A física usa **passo de tempo fixo** (120 Hz) independente da taxa de quadros,
  com um único laço `requestAnimationFrame` e limites de tempo após
  interrupções — mesma velocidade dos personagens em qualquer aparelho.
- O Canvas usa `devicePixelRatio` com **teto configurável** (`DPR_CAP = 2` em
  `js/game.js`) e suavização desligada — pixel art nítida sem gastar demais.
- O áudio só começa após a primeira interação e é **suspenso/retomado** ao
  trocar de aplicativo; falha de áudio nunca interrompe a partida.

## A campanha

Cada fase tem layout, paleta, cenário, filhotes, gatos e objetos próprios.
Todas as plataformas, filhotes e a porta são alcançáveis com a física real
(validado por teste), e a arena inteira fica sempre visível (sem rolagem).

| Fase | Cenário | Filhotes | Gatos | Característica |
| --- | --- | --- | --- | --- |
| 1 | Jardim inicial | 6 | 2 | Layout original preservado (fase de aprendizado) |
| 2 | Vila colorida | 7 | 2 | Plataformas mais espaçadas |
| 3 | Bosque | 8 | 3 | Rotas alternativas de coleta (3 torres + ponte) |
| 4 | Telhados da vila | 8 | 3 | Mais mudanças de altura (4 níveis) |
| 5 | Parque ao entardecer | 9 | 3 | Rotas que cruzam patrulhas |
| 6 | Armazém | 9 | 4 | Plataformas organizadas em corredores |
| 7 | Fábrica | 10 | 4 | Mais decisões de percurso (3 rotas + conexões) |
| 8 | Cidade noturna | 10 | 4 | Patrulhas um pouco mais rápidas |
| 9 | Torre dos pássaros | 11 | 5 | Percurso vertical mais elaborado |
| 10 | Jardim da grande fuga | 12 | 5 | Combinação dos desafios anteriores |

- **Dificuldade progressiva:** a velocidade dos gatos cresce por fase
  (multiplicador 1,0 → 1,3, com limite que preserva o tempo de reação) e a
  distância de perseguição também aumenta gradualmente.
- **Cenários:** 10 temas com céu, chão, plataformas, porta e decoração próprios,
  todos gerados por código e pré-renderizados com cache.
- **Efeitos e áudio:** partículas na entrega, acerto e conclusão de fase; sons
  de salto, coleta, entrega, arremesso, acerto, dano, respingo de gato e
  transição de fase (botão de mudo no HUD).

## Estrutura

```
jogo-flicky/
├── index.html            # Markup (HUD, canvas, controles de toque, overlays)
├── style.css             # Layout responsivo retrato/paisagem, áreas seguras, pixel art
├── js/
│   ├── sprites.js        # Sprites geradas por código (passarinho, filhote, gato, noz, ícones)
│   ├── audio.js          # Sons sintetizados (Web Audio) + suspend/resume + mudo
│   ├── levels.js         # DADOS das 10 fases (plataformas, filhotes, gatos, objetos, porta…)
│   ├── level.js          # Carregador central de fases + cenários temáticos (cache)
│   └── game.js           # Física, fila/histórico, gatos, arremesso, estados, HUD,
│                         #   entrada unificada (teclado+toque), resize/DPR, laço rAF
├── PLANO_IMPLEMENTACAO.md# Plano da adaptação mobile (9 etapas)
├── README.md             # Este arquivo
└── tests/                # Testes (opcional, requer Node.js)
    ├── headless.js       # Suíte headless (450 asserções)
    ├── render.js         # Renderizador software → PNGs em tests/out/
    ├── layout-preview.js # Capturas reais do layout (Chrome/Edge headless)
    ├── measure.js        # Medição numérica do layout antes × depois
    └── out/              # Frames de inspeção e capturas de layout geradas
```

## Testes (opcional)

Os testes rodam no **Node.js** e não são necessários para jogar.

```bash
# Regressão de lógica/física/regras + mobile (450 asserções)
node tests/headless.js

# Gerar frames de inspeção em tests/out/*.png
node tests/render.js

# Capturas reais do layout (vertical/paisagem/desktop) via Chrome/Edge headless
node tests/layout-preview.js

# Medição numérica do layout (arena, painel, botões, pares lado a lado)
node tests/measure.js DEPOIS
```

A suíte cobre, entre outros: menu/inicialização, física e salto, laço principal
com timestamps, coleta e fila por histórico, dispersão ao ser atingido por gato,
perda de vida com invulnerabilidade e recuperação em pontos seguros,
objetos arremessáveis (coleta, 1 por vez, +100 por acerto, atordoamento e
ressurgimento do gato), entregas parciais (400+400), bônus de tempo,
transição entre fases preservando pontos/vidas e limpando entidades,
**progressão automática da fase 1 até a 10** com validação de cada layout,
vitória somente após a fase 10, Game Over, nova campanha, recorde no
`localStorage`, pausa por Esc/P/foco — e a camada mobile: **entrada unificada
teclado+toque por origem, multitoque (andar+saltar, andar+arremessar),
`pointerup`/`pointercancel` interrompendo comandos, pausa por botão, pausa ao
ocultar a aba aguardando o jogador, resize/rotação preservando a partida, teto
de `devicePixelRatio`, persistência do som, instruções adaptadas ao toque,
matemática de layout (**escala `min(larguraDisp/480, alturaDisp/270)`,
disposição automática cantos×faixa inferior pela maior arena, trilhas laterais
que acomodam o par inteiro, rotação sem comandos presos**) e verificações
estáticas de marcação/estilo (controles fora da arena, viewport, áreas seguras,
alvos 48px, botões 56–68px, `.pad` sempre `row`+`nowrap` e a remoção da regra
que empilhava os botões)**.

## Navegadores

Testado-alvo: **Safari no iPhone** e **Chrome no Android**, além de navegadores
desktop modernos (Chrome, Edge, Firefox) — todos com Canvas 2D e Web Audio.
O áudio só começa após a primeira interação (clique/toque/tecla), conforme
exigem os navegadores. A tela cheia aparece somente quando a API existe, e o
jogo funciona normalmente sem ela.
