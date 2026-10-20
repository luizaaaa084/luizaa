# 🎓 Portal de Estudos — PWA

App de estudo simples que funciona **offline** e pode ser **instalado** na tela inicial
do celular ou do computador (como um app nativo).

## Funcionalidades

- **⏱️ Foco (pomodoro)** — cronômetro com anel de progresso, ciclos de foco/pausa
  curta/pausa longa, som e notificação ao terminar, e início automático opcional.
- **✅ Tarefas** — criar, concluir, excluir e filtrar (todas / pendentes / concluídas),
  com barra de progresso.
- **📊 Progresso** — minutos e sessões do dia, tarefas concluídas, sequência de dias,
  meta diária e gráfico dos últimos 7 dias.
- **Offline & instalável** — service worker com cache do app, manifesto PWA e ícones
  próprios (192, 512 e maskable).
- **Extras** — tema claro/escuro, exportar/importar dados em JSON, atalhos do app
  ("Foco" e "Tarefas") e layout responsivo com suporte a `safe-area-inset` (notch).

Todos os dados ficam no `localStorage` do navegador — nada é enviado para servidor.

## Rodando localmente

O service worker exige **HTTPS** ou **localhost**. Qualquer servidor estático serve:

```bash
# com Python
python3 -m http.server 8080

# ou com Node
npx serve .
```

Depois abra <http://localhost:8080>.

> ⚠️ Abrir o `index.html` direto pelo `file://` funciona para ver a tela, mas o
> service worker (e portanto o modo offline e o botão "Instalar") só funciona via servidor.

## Instalando o app

1. Abra a URL do app em um navegador com suporte a PWA (Chrome, Edge, Safari 16.4+).
2. Use o botão **Instalar** que aparece no cabeçalho, ou o ícone de instalação da barra de endereços.
3. No celular, o app abre em tela cheia e continua funcionando sem internet.

## Estrutura

```
index.html             # shell do app (abas, timer, tarefas, progresso)
style.css              # estilos (variáveis CSS, tema claro/escuro, responsivo)
script.js              # lógica: timer, tarefas, estatísticas, storage, PWA
manifest.webmanifest   # manifesto do PWA (nome, ícones, atalhos, cores)
sw.js                  # service worker (cache offline)
icons/                 # ícones PNG gerados
tools/gen-icons.js     # gerador dos ícones (sem dependências)
```

## Ícones

Para regerar os ícones (após mudar o design em `tools/gen-icons.js`):

```bash
node tools/gen-icons.js
```

O script desenha um cap de graduação e codifica os PNGs por conta própria
(sem ImageMagick, Canvas ou bibliotecas externas).

## Atualizando o cache offline

Ao alterar arquivos do app, troque a constante `VERSION` em `sw.js` para forçar a
atualização do cache nos clientes.

## Publicando

Basta enviar a pasta para qualquer hospedagem estática (GitHub Pages, Netlify,
Vercel, Cloudflare Pages). Não há build nem dependências — é HTML, CSS e JS puros.
