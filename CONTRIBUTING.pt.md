# Contribuindo

[English](CONTRIBUTING.md) · **Português**

Obrigado por ajudar. Relatos de bugs, descobertas sobre o protocolo e pull requests são bem-vindos.

## Relatando um problema

Abra uma [issue](https://github.com/rouri404/dorsal/issues) com:

- onde aconteceu: no site (e em qual navegador), no AppImage do Dorsal ou no Dorsal Screen;
- seu sistema e como o teclado está ligado (precisa ser o cabo USB);
- o que você fez, o que esperava e o que aconteceu;
- em problemas de conexão, a saída de `ls -l /dev/hidraw*` com o teclado conectado.

O [`docs/troubleshooting.md`](docs/troubleshooting.md) cobre os casos comuns.

## Preparando o ambiente

```bash
npm install
npm run dev        # http://localhost:5173, no Chrome, Edge, Chromium ou Brave
```

Sem o teclado? Abra `http://localhost:5173/app?demo`: o modo demonstração repete respostas gravadas de um X85 Pro real, e as gravações ficam só na memória. Scripts, variáveis de ambiente e modos estão em [`docs/development.md`](docs/development.md).

## Antes de abrir um pull request

```bash
npm run typecheck
npm test
```

- **Textos:** todo texto visível passa por `tr("pt", "en")`, nos dois idiomas. Nomes das tabelas do protocolo ganham o nome em inglês em `src/i18n/labels.ts`.
- **Componentes:** a interface nova vem do [beUI](https://beui.dev) (`npx shadcn@latest add @beui/<nome>`). Dependências ficam com a versão exata.
- **Comentários:** só onde o código não consegue dizer, como uma peculiaridade do firmware ou o porquê de um contorno.
- **Mudanças visuais:** coloque uma captura no pull request; pode ser no modo demonstração.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/pt-br), sem escopo, uma mudança por commit:

```
feat: switch language in Dorsal Screen
fix: read back lighting and sleep writes in demo mode
docs: translate the protocol notes to English
```

## O protocolo

O teclado foi estudado por engenharia reversa, para interoperabilidade; o que se sabe está em [`docs/protocol.md`](docs/protocol.md).

- **Nunca copie código proprietário.** Descreva o comportamento observado e implemente você mesmo.
- **Gravações têm risco.** Teste no modo demonstração, depois com a simulação ligada (modo desenvolvedor, `?dev`), e só então no teclado, com um backup feito antes. Diga no pull request quais você testou no hardware de verdade.
- **Fora do escopo:** atualização de firmware, porque uma falha pode inutilizar o teclado.

Descobertas novas (um comando, uma função Fn desconhecida, o canal do dongle) são muito bem-vindas, mesmo sem código: abra uma issue com os bytes enviados e recebidos.
