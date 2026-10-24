# Protocolo do Attack Shark X85 Pro

Engenharia reversa para interoperabilidade, a partir do bundle web do qmk.top / gearhub.top
(`js/index.DBxGlqV7.js`) e confirmada com leituras no teclado real. O código deste repositório é
uma reimplementação própria: nada do código proprietário foi copiado.

## Identificação

| Item | Valor |
|---|---|
| USB (cabo) | `3151:5002` "Gaming Keyboard" |
| USB (dongle 2.4G) | `3151:5006` "2.4G Wireless Keyboard" |
| Interface de configuração | interface 2, usage page `0xFFFF`, usage `2`, só *feature reports* de 64 bytes, sem report ID |
| ID do firmware (`0x8F`) | **3451** (`7b 0d 00 00`), que não existe no catálogo do qmk.top |
| Chip / tela (`0xAD`) | `"RY5060"`, versão da tela `0x0102`, flash `0x0100` |

O qmk.top não cadastra o ID 3451. Por isso ele não conhece a resolução da tela e mostra
"当前设备没有有效的屏幕分辨率配置" (o dispositivo não tem configuração válida de resolução).
O upload em si é HID puro: o "IOT driver" (`iot_manager_rs.exe`) só destrava uma checagem na
interface (`isUseIOTSDK` + login).

## Enquadramento

Cada comando é um feature report de 64 bytes (`sendFeatureReport(0, …)`). Quando há resposta,
ela é lida ~10 ms depois com `receiveFeatureReport(0)`.

Checksum:
- `bit7`: `byte[7] = 255 − (soma(byte[0..6]) & 0xFF)`, o padrão.
- `bit8`: `byte[8] = 255 − (soma(byte[0..7]) & 0xFF)`, usado pelos comandos de iluminação.

Comandos que o firmware não implementa voltam como **eco** do pacote enviado.

## Tabela de comandos (família YC3123/RY5088, classe `an` no bundle)

| Ler | Gravar | Função | Formato |
|---|---|---|---|
| `0x8F` | – | identidade | `[1..4]` = ID uint32 LE, `[7..8]` = versão |
| `0x83` | `0x03` | taxa de polling | `[2]`: 0=8k, 1=4k, 2=2k, 3=1k, 4=500, 5=250, 6=125 |
| `0x84` | `0x04` | perfil | `[1]` |
| `0x85` | – | economia de energia | `[1] == 1` |
| `0x86` | `0x06` | debounce | `[1]` |
| `0x87` | `0x07` (bit8) | RGB principal | `[1]` modo, `[2]` = 4−velocidade, `[3]` brilho, `[4]` = (opção<<4)\|(7 normal / 8 arco-íris), `[5..7]` RGB |
| `0x88` | `0x08` (bit8) | luz lateral | igual, mas velocidade direta; branco é gravado como `fa ff fa` |
| `0x8A` | `0x0A` | matriz de teclas | leitura: `[0x8A, perfil, 0xFF, página 0..7, camada]` → 64 bytes crus por página |
| `0x90` | `0x10` | camada Fn | leitura: `[0x90, so, perfilFn, 0xFF, página]` |
| `0x91` | `0x11` | repouso | uint16 LE em `[8]` BT, `[10]` 2.4G, `[12]` profundo BT, `[14]` profundo 2.4G (segundos) |
| – | `0x01` | reset de fábrica | |

Gravar uma tecla: `[0x0A, perfil, pos, 0, 0, 1, camada, chk, v0, v1, v2, v3]`.
Gravar uma tecla na camada Fn: `[0x10, so, perfilFn, pos, 0, 0, 0, chk, v0..v3]`.

### Matriz

São 128 posições de 4 bytes, organizadas **por coluna**, com 6 linhas: `pos = coluna*6 + linha`.
O X85 usa 16 colunas. Valores:

| Tipo | Formato |
|---|---|
| 0 | tecla `[0, modificadores, uso HID, uso2]`, ou `[0, uso, 0, 0]` |
| 1 | mouse |
| 2 | sistema |
| 3 | consumer `[3, 0, lo, hi]` |
| 9 | macro `[9, modo, índice, 0]` |
| 10 | Fn / travas |
| 19 | funções da tela (coluna do knob) |

## Tela TFT (comandos compartilhados, classe `F6`)

| Cmd | Função |
|---|---|
| `0xA5` | início do upload (handshake), modo de 16 bits |
| `0x25` | dados, 56 bytes de pixels por pacote |
| `0x28` | relógio: `[8..9]` ano BE, `[10]` mês, `[11]` dia, `[12]` h, `[13]` min, `[14]` s |
| `0xAC` | apaga toda a flash da tela (responde `aa aa 55 55`); não usado pelo app |
| `0xAD` | versões da tela e do flash |

Handshake `0xA5`:
```
[0xA5, frame, total, delay, len0, len1, 0, chk,
 left, top, right, bottom, leftHi, topHi, rightHi, bottomHi, len2, len3, slot]
```
Repetido até 10×, com 100 ms antes de enviar e de ler, até `resposta[1] == 1`.

Dados `0x25`:
```
[0x25, frame, total, delay, chunkLo, chunkHi, len, chk, …56 bytes]
```
Enviado com 1 ms entre pacotes.

Pixels: RGB565 big-endian, varridos **por coluna** (x por fora, y por dentro), dentro do retângulo
que envolve os pixels não-pretos (em animações, a união dos retângulos de todos os frames).
- Imagem estática: `frame = slot`, `total = 1`, `slot` em `[18]`.
- Animação: frames `0..n−1`, `delay` em ms (1–255), `slot = 0`.

O site só permite upload pelo **cabo USB**. A resolução não está no firmware nem no catálogo; o
padrão é 128×128, que é o tamanho típico de uma TFT de 0,85".
