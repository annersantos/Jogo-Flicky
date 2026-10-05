# Plano de Implementação — "Flicky do Jardim" (Campanha de 10 fases)

Jogo de plataforma arcade 2D (Canvas 2D, HTML5 + CSS + JavaScript puro), tela fixa,
arena inteira sempre visível. Este plano cobre a ** expansão de 1 fase para uma
campanha de 10 fases completas**, preservando a fase 1 e todas as mecânicas que já
funcionam (física de passo fixo, fila por histórico de percurso, dispersão, vidas,
pausa, áudio sintetizado, controles de toque).

---

## 1. Análise da estrutura atual e das skills disponíveis

### Skills localizadas e lidas

| Skill | Arquivo | Aplicação nesta tarefa |
| --- | --- | --- |
| `game-development` | `.agents/skills/game-development/SKILL.md` | Roteou para os sub-skills usados abaixo. |
| `game-development/2d-games` | `2d-games/SKILL.md` | Passo de tempo fixo, colisão simplificada/AABB, plataformas one-way, coyote time, jump buffer, salto variável, animação 8–24 FPS, squash/stretch leve. |
| `game-development/game-design` | `game-design/SKILL.md` | Loop de 30 s (mover→pular→coletar→entregar), progressão de dificuldade, estado de fluxo, recompensa progressiva, anti-pattern "punir em excesso". |
| `game-development/mobile-games` | `mobile-games/SKILL.md` | Alvos de toque ≥ 44 px, feedback visual no toque, pausa ao perder o foco, suporte a retrato/paisagem, sem controles de desktop no mobile. |
| `game-development/web-games` | `web-games/SKILL.md` | Canvas puro (jogo 2D leve), áudio exige interação do usuário, pausa quando a aba fica oculta, sem carregamento de assets externos. |
| `frontend-design` | `frontend-design/SKILL.md` + `ux-psychology.md` (obrigatório) | Hierarquia do HUD (Fitts/Von Restorff no CTA), alvos de 44 px, contraste figura/fundo nas paletas, feedback imediato (<400 ms), regra dos 8 px, telas finais memoráveis (Peak-End). |
| `app-builder` | `app-builder/SKILL.md` + `feature-building.md` | Análise da feature (10 fases + arremesso + telas), separação de dados × lógica, integração por um carregador central, validação e preview. |

Todas as três skills solicitadas estavam disponíveis; nenhuma precisou ser ignorada.

### Estrutura existente (mantida e estendida)

- `index.html` / `style.css` — HUD, canvas 480×270, controles de toque, overlays.
- `js/sprites.js` — pixel art gerada por código (pássaro, filhote, gato, ícones).
- `js/audio.js` — sons sintetizados (Web Audio), botão de mudo.
- `js/level.js` — **atualmente**: uma fase fixa + cenário de jardim.
- `js/game.js` — laço, física, fila por histórico, gatos, estados, HUD.
- `tests/headless.js` (67 asserções) e `tests/render.js` (PNGs de inspeção).
- `.agents/` — documentação de skills (preservada, fora do jogo).

### Mudanças estruturais previstas

- **Novo** `js/levels.js` — apenas **dados**: as 10 configurações de fase
  (plataformas, porta, spawn, filhotes, gatos, objetos, pontos seguros, tema,
  dificuldade). Nenhuma lógica.
- `js/level.js` passa a ser o **carregador central**: `LEVEL.load(indice)` ativa a
  fase, faz cache do cenário por fase e expõe os dados ativos (getters).
- `js/game.js` ganha máquina de estados `menu | play | pause | complete | over |
  victory`, arremesso, atordoamento de gatos, bônus de tempo, recorde e progressão.
- `index.html`/`style.css` — HUD ampliado (Fase/Recorde), botão de arremesso,
  telas de conclusão/vitória, instruções do menu.

**Critério de conclusão (etapa 1):** skills lidas e aplicadas; arquivo de plano
atualizado com as 9 seções; nenhum arquivo pré-existente do jogo apagado.

---

## 2. Organização das configurações das 10 fases

Cada fase é um objeto de **dados** em `js/levels.js`:

```js
{
  nome: 'Jardim inicial',     tema: 'garden',
  platforms: [{x,y,w}...],    // y ∈ {198,150,102,54} + chão em 246
  door: {x,y,w,h},            spawn: {x,y},
  chicks: [{x,y}...],         // sempre sobre uma plataforma
  cats: [{x,y,x1,x2,dir}...], // patrulha contida na superfície (chão/plataforma)
  safePoints: [{x,y}...],     // superfícies válidas e alcançáveis
  throwables: [{x,y}...],     // objetos arremessáveis (repouso sobre superfície)
  speedMul, chaseRange        // dificuldade da fase
}
```

- Constantes de arena: 480×270, chão em y=246, degraus de **48 px**
  (198/150/102/54) com salto máx. ≈ 67,6 px e alcance horizontal ≥ 45 px.
- Distribuição obrigatória: filhotes **6/7/8/8/9/9/10/10/11/12**,
  gatos **2/2/3/3/3/4/4/4/5/5** (tabela do enunciado).
- `speedMul` progressivo e limitado: 1,0 → 1,05 → 1,1 → 1,15 → 1,2 → 1,25 → 1,3
  (patrulha 42 → máx. ~55 px/s, perseguição 66 → ~86 px/s, tempo de reação
  preservado); `chaseRange` 130 → 180 px.
- Temas: `garden, vila, forest, rooftops, dusk, warehouse, factory, night, tower,
  finale` — cada um com paleta de céu/chão/plataforma/porta e decoração próprias.

**Critério de conclusão (etapa 2):** `js/levels.js` contém 10 objetos completos,
contagens exatas da tabela, sem lógica misturada.

---

## 3. Sistema de carregamento e transição

- `LEVEL.load(indice)` (1..10) ativa a fase, comenta o cenário no cache e devolve
  a configuração; `game.js` guarda `LV` e nunca duplica lógica por fase.
- `loadPhase(n)` no jogo: limpa **fila, soltos, gatos, objetos, partículas,
  textos, histórico, comandos, invulnerabilidade e cronômetro**; recoloca o
  jogador no spawn; zera `Resgatados` (alvo = nº de filhotes da fase); mantém
  **pontuação e vidas**.
- `startCampaign()` — fase 1, 3 vidas, pontuação 0, recorde carregado do
  `localStorage`; usado por "Jogar", "Nova campanha" e "Jogar novamente".
- `nextPhase()` — `loadPhase(n+1)` + som de transição; botão "Próxima fase" (fases 1–9).
- Máquina de estados única: `menu | play | pause | complete | over | victory`.
  O laço `requestAnimationFrame` só é registrado **uma vez** no boot; o passo de
  física roda exclusivamente quando `state === 'play'` (pausa/conclusão/congelados).
- Guardas: `tryDeliver()` só age em `play` (sem conclusão duplicada), transição
  troca de estado antes de qualquer efeito colateral, `boot()` idempotente.

**Critério de conclusão (etapa 3):** trocar de fase não deixa resíduos (fila,
histórico, partículas, comandos zerados), cronômetro zera e não há laço duplicado.

---

## 4. Construção dos nove novos layouts

| Fase | Tema | Plataformas (ideia) | Filhotes | Gatos |
| --- | --- | --- | --- | --- |
| 1 | Jardim inicial | **Layout original preservado** (6 plataformas) | 6 | 2 |
| 2 | Vila colorida | 7 plataformas com vãos largos (mais espaçadas) | 7 | 2 |
| 3 | Bosque | 3 torres (esq/centro/dir) + ponte = rotas alternativas | 8 | 3 |
| 4 | Telhados da vila | 14 telhados nas 4 alturas (mais mudanças de altura) | 8 | 3 |
| 5 | Parque ao entardecer | 3 corredores horizontais com vãos que cruzam patrulhas | 9 | 3 |
| 6 | Armazém | 9 prateleiras em corredores (grade 2+4+3) | 9 | 4 |
| 7 | Fábrica | 3 rotas verticais + 6 conexões = decisões de percurso | 10 | 4 |
| 8 | Cidade noturna | Skyline escalonado (5+4+3+2) com patrulhas rápidas | 10 | 4 |
| 9 | Torre dos pássaros | 15 degraus espiralados em 4 alturas (vertical elaborado) | 11 | 5 |
| 10 | Jardim da grande fuga | Grade 4+4+3+4 combinando todos os desafios | 12 | 5 |

Regras de construção (validadas por teste):

- Subida: vão ≤ 45 px e Δy ≤ 48 px; descida: vão ≤ 85 px (alcance real do salto).
- BFS do chão a todas as plataformas; todo filhote sobre plataforma alcançável;
  porta no chão; pontos seguros sobre superfícies; gatos com `x1..x2` contidos na
  superfície; spawn do jogador livre de gatos e filhotes.
- Cenário por tema (céu, chão, decoração, plataformas e porta com paleta própria),
  pré-renderizado em canvas com cache — legibilidade figura/fundo em todos os temas.

**Critério de conclusão (etapa 4):** os 10 layouts passam no BFS e nas checagens
de dados; os 9 novos visivelmente distintos (screenshots por tema).

---

## 5. Ajustes de inimigos, dificuldade e objetos arremessáveis

- Gatos: patrulha contida na superfície + perseguição quando `|Δy| < 28` e
  `|Δx| < chaseRange`, sempre **respeitando os limites da geometria** (nunca saem
  da plataforma nem aparecem sobre o spawn do jogador).
- Velocidade progressiva por fase com teto (`speedMul ≤ 1,3`) — preserva reação.
- **Arremesso (novo):** objeto em repouso é coletado ao encostar (1 por vez,
  desenhado sobre o pássaro); `X`/`J`/botão lança na direção do olhar com leve
  arco; acerto no gato → **+100 pontos (uma única vez por acerto)** e gato
  **atordoado** (fora de ação, fantasma piscante) → desaparece e **reaparece num
  ponto seguro** da patrulha (longe do jogador) após 2,5 s com partículas.
  Objeto que erra pousa e pode ser recolhido.
- Gato atordoado não fere jogador nem filhotes; gato atinge fila → dispersão
  preservada; gato atinge filhote solto → susto/empurrão preservados.
- Fase 1 continua acessível (2 gatos lentos, objetos à mão perto do spawn).

**Critério de conclusão (etapa 5):** arremesso coleta/lança/acerta/erram,
+100 contados uma vez, gato atordoa e ressurge com segurança; nenhuma mecânica
antiga quebrou.

---

## 6. Pontuação acumulada e bônus de conclusão

- **100** por filhote entregue + **50** por adicional da mesma viagem
  (3 juntos = 400) — fórmula existente preservada.
- **100** por inimigo atingido por objeto (uma vez por acerto).
- **Bônus de tempo** ao concluir a fase: `max(0, 120 − floor(segundos)) × 10`.
- Pontuação e vidas **acumulam entre fases**; fase só termina com todos os
  filhotes entregues (`Resgatados: X/N` dinâmico).
- Recorde salvo em `localStorage` (`flicky.recorde`) a cada aumento, com
  fallback para quando o armazenamento está indisponível.

**Critério de conclusão (etapa 6):** entrega 400+400=800, acerto +100, bônus
calculado em segundos inteiros, pontuação/vidas preservadas na troca de fase.

---

## 7. Interface e telas de conclusão e vitória

- HUD: `Pontos` (acumulado), `Recorde`, `Fase N/10`, `Vidas` (ícones),
  `Resgatados: X/N` e som ligado/desligado — tudo em pt-BR, atualizado por fase.
- Menu inicial com título, instruções e botão **Jogar** (overlay sobre a fase 1).
- Pausa: `Esc`/`P` → "Continuar" + "Reiniciar campanha".
- **Fase concluída** (1–9): título "Fase N concluída!", pontos da fase, bônus de
  tempo e pontuação acumulada + botão **Próxima fase**.
- **Vitória** só após a fase 10: resumo da fase 10 + total + recorde +
  **Jogar novamente**.
- **Game Over**: total + botão **Nova campanha** (volta à fase 1 com 3 vidas).
- Efeitos: partículas discretas na entrega, acerto, dispersão e conclusão;
  sons de salto, coleta, entrega, arremesso, ataque, dano e transição;
  botão de mudo; áudio só após interação; pixels nítidos ao redimensionar.

**Critério de conclusão (etapa 7):** as 6 telas (menu, jogo, pausa, conclusão,
game over, vitória) funcionam com textos em pt-BR e números corretos.

---

## 8. Controles e adaptação para mobile

- Desktop: ←/→ ou A/D move; Espaço/W/↑ pula; **X/J lança**; **Esc/P pausa**; M som.
  Perda de foco/aba → pausa + **limpeza dos comandos pressionados**.
- Mobile: ◀ ▶ no canto inferior esquerdo; **▲ (salto) e ➤ (lançamento)** no
  canto inferior direito, `pointer events` independentes (múltiplos toques
  simultâneos), alvos ≥ 44 px com feedback visual.
- `touch-action: none`, `user-select: none`, `overscroll-behavior: none`,
  `preventDefault` nas teclas de rolagem → sem rolar/selecionar/zoom durante a partida.
- Layout 16:9 sempre com a arena inteira visível em retrato e paisagem,
  respeitando `env(safe-area-inset-*)`; HUD quebra linha em telas estreitas.

**Critério de conclusão (etapa 8):** mover+pular+lançar ao mesmo tempo no toque;
nenhuma informação importante coberta pelos botões.

---

## 9. Validação, correções e documentação

- `node --check` em todos os arquivos JS.
- `node tests/headless.js` — suíte atualizada cobrindo:
  menu/inicialização, física e laço, fila por histórico, dispersão, entrega e
  pontuação, bônus de tempo, transição de fase preservando pontos/vidas,
  **progressão automática 1 → 10** (contagens da tabela + BFS por fase),
  arremesso/atordoamento/+100, vitória **somente** na fase 10, game over →
  nova campanha, recorde (`localStorage`), pausa por Esc/P/foco limpando comandos.
- `node tests/render.js` — PNGs de inspeção por tema (fases 1, 4, 8, 10) + zooms.
- `README.md` — execução, controles, descrição da campanha, fases e testes.

**Critério de conclusão (etapa 9):** todos os testes passam, screenshots conferidos
e README atualizado. Limitações reais registradas no relatório final.
