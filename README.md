# Flicky do Jardim — Campanha de 10 fases

Jogo de plataforma 2D em tela fixa, inspirado em *Flicky*: você controla um
passarinho que coleta os filhotes espalhados pelas plataformas, forma a fila e
leva-os até a porta no chão — enquanto evita os gatos de patrulha. Agora com
**campanha completa de 10 fases**, objetos arremessáveis, pontuação acumulada,
bônus de tempo e recorde salvo no navegador.

Feito com **HTML5 + CSS + JavaScript puros** (Canvas 2D), sem bibliotecas e
**sem arquivos de asset externos**: as sprites são desenhadas por código e os
sons são sintetizados com a Web Audio API.

## Como rodar

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

## Controles

| Ação | Teclado | Toque (celular/tablet) |
| --- | --- | --- |
| Mover | ← → ou A / D | Botões ◀ ▶ (canto inferior esquerdo) |
| Pular | Espaço, W ou ↑ | Botão ▲ (canto inferior direito) |
| Arremessar objeto | X ou J | Botão ➤ (canto inferior direito, laranja) |
| Pausar / retomar | Esc ou P | — |
| Ligar/desligar som | M | Botão de som no HUD |
| Iniciar (menu) | Enter ou Espaço | Botão **Jogar** |

- O salto é de altura variável: segure a tecla para pular mais alto.
- No toque, é possível mover, pular e lançar ao mesmo tempo (os botões são
  independentes, com múltiplos toques simultâneos). A página não rola, não
  seleciona texto e não dá zoom durante a partida.
- Perder o foco da janela/aba pausa o jogo e **limpa os comandos pressionados**.
- O layout é responsivo em retrato e paisagem: a arena inteira (480×270, 16:9)
  fica sempre visível, respeitando as áreas seguras da tela.

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
- **Telas:** menu inicial, pausa, "Fase concluída" (com botão **Próxima fase**
  nas fases 1–9), Game Over (com **Nova campanha**) e **Vitória** — que só
  aparece após concluir a **fase 10**, com pontuação total, recorde e
  **Jogar novamente**.
- **Pausa:** Esc, P ou ao perder o foco da janela/aba (física, inimigos e
  cronômetro congelam).
- A física usa **passo de tempo fixo** (120 Hz), independente da taxa de quadros
  da tela.

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
- **Cenários:** 10 temas com céu, chão, plataformas, porta e decoração próprios
  (jardim, vila, bosque, telhados ao pôr do sol, parque no crepúsculo,
  armazém, fábrica, cidade noturna, torre e jardim festivo), todos gerados por
  código e pré-renderizados com cache.
- **Efeitos e áudio:** partículas na entrega, acerto e conclusão de fase; sons
  de salto, coleta, entrega, arremesso, acerto, dano, respingo de gato e
  transição de fase (botão de mudo no HUD; o áudio só começa após a primeira
  interação).

## Estrutura

```
jogo-flicky/
├── index.html            # Markup (HUD, canvas, controles de toque, overlays)
├── style.css             # Layout responsivo e estética pixelada
├── js/
│   ├── sprites.js        # Sprites geradas por código (passarinho, filhote, gato, noz, ícones)
│   ├── audio.js          # Sons sintetizados (Web Audio) + botão de mudo
│   ├── levels.js         # DADOS das 10 fases (plataformas, filhotes, gatos, objetos, porta…)
│   ├── level.js          # Carregador central de fases + cenários temáticos (cache)
│   └── game.js           # Física, fila/histórico, gatos, arremesso, estados, HUD, loop
├── PLANO_IMPLEMENTACAO.md# Plano de implementação da campanha (9 etapas)
├── README.md             # Este arquivo
└── tests/                # Testes (opcional, requer Node.js)
    ├── headless.js       # Suíte headless (357 asserções)
    ├── render.js         # Renderizador software → PNGs em tests/out/
    └── out/              # Frames de inspeção gerados
```

## Testes (opcional)

Os testes rodam no **Node.js** e não são necessários para jogar.

```bash
# Regressão de lógica/física/regras (357 asserções)
node tests/headless.js

# Gerar frames de inspeção em tests/out/*.png
node tests/render.js
```

A suíte cobre, entre outros: menu/inicialização, física e salto, laço principal
com timestamps, coleta e fila por histórico, dispersão ao ser atingido por gato,
perda de vida com invulnerabilidade e recuperação em pontos seguros,
objetos arremessáveis (coleta, 1 por vez, +100 por acerto, atordoamento e
ressurgimento do gato), entregas parciais (400+400), bônus de tempo,
transição entre fases preservando pontos/vidas e limpando entidades,
**progressão automática da fase 1 até a 10** com validação de cada layout
(contagens da tabela, alcance por BFS, superfícies válidas), vitória somente
após a fase 10, Game Over, nova campanha, recorde no `localStorage`,
pausa por Esc/P/foco limpando comandos e controles de toque simultâneos.

## Navegadores

Testado em navegadores modernos com suporte a Canvas 2D e Web Audio
(Chrome, Edge, Firefox, Safari). O áudio só começa após a primeira interação
com o usuário (clique/tecla), conforme exigem os navegadores.
