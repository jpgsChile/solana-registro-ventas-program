# Registro de Ventas en Solana con PDAs (Anchor local)

Programa Anchor reproducible desde **Ubuntu** con **Anchor CLI**, basado en el material educativo de [WayLearnLatam/Registro-Ventas-Solana-PDA](https://github.com/WayLearnLatam/Registro-Ventas-Solana-PDA).

Este fork adapta el ejemplo de Solana Playground a un workspace local compatible con el frontend [jpgsChile/bootcamp-solana](https://github.com/jpgsChile/bootcamp-solana).

## Versiones verificadas

| Herramienta | Versión |
| --- | --- |
| Rust | 1.98.x |
| Solana CLI (Agave) | 4.4.1 |
| Anchor (AVM) | 0.31.1 |
| Node.js | 22.x |

```bash
export PATH="$HOME/.avm/bin:$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
avm use 0.31.1
anchor --version   # anchor-cli 0.31.1
solana --version   # solana-cli 4.4.1
```

El `Anchor.toml` fija `anchor_version = "0.31.1"`, el Program ID en `localnet`/`devnet` y el script de pruebas:

```toml
[scripts]
test = "npx ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts"
```

`npm test` y `anchor test` ejecutan ese suite (validador local + Mocha). En esta rama el suite incluye la instrucción `actualizar_cliente` (15 casos passing en la última corrida local).

## Flujo reproducible (compilar y probar)

Contraste breve: Playground compilaba y desplegaba desde el navegador; aquí el ciclo es CLI.

1. Clona este repositorio y entra en la rama de trabajo.
2. Instala dependencias JS del workspace (`npm ci`).
3. Coloca el keypair del **programa** en `target/deploy/registro-keypair.json` (el archivo no va en Git).
4. `anchor build` genera el `.so` y el IDL del **mismo** build.
5. `anchor test` levanta el validador de prueba y corre `tests/**/*.ts`.

```bash
git clone https://github.com/jpgsChile/solana-registro-ventas-program.git
cd solana-registro-ventas-program
git checkout feat/actualizar-cliente
npm ci
mkdir -p target/deploy
cp /ruta/a/tus-keys/programa-keypair.json target/deploy/registro-keypair.json
anchor build
anchor test
```

Artefactos del mismo build:

| Artefacto | Ruta |
| --- | --- |
| Binario | `target/deploy/registro.so` |
| IDL generado | `target/idl/registro.json` |
| Copia estable en el repo | [`idl/registro.json`](./idl/registro.json) |

Importa ese IDL en el frontend con `npm run configurar:idl` cuando cambies de build o de Program ID.

## Program ID (Devnet)

```
C2dJeFBUGCgjgWdzh28tJZ6dPTmXAiVfod3DBhPy7EUA
```

Upgrade confirmado en Devnet (misma autoridad de upgrade, programa ejecutable, slot de despliegue nuevo):

- Firma: `4HtuA9YzXHQ4N2JMZwFEZcWzGjzX5UXii4Ed7H1VRTc5XQYM9ULjMPX1J4jp2qBLH6DoPBZB9mYszdyhbvoN4iBw`
- Explorer: https://explorer.solana.com/tx/4HtuA9YzXHQ4N2JMZwFEZcWzGjzX5UXii4Ed7H1VRTc5XQYM9ULjMPX1J4jp2qBLH6DoPBZB9mYszdyhbvoN4iBw?cluster=devnet

Ejemplo de upgrade (ajusta rutas; la wallet CLI debe ser la **upgrade authority**):

```bash
anchor upgrade target/deploy/registro.so \
  --program-id C2dJeFBUGCgjgWdzh28tJZ6dPTmXAiVfod3DBhPy7EUA \
  --provider.cluster devnet \
  --provider.wallet /ruta/a/tus-keys/deployer-devnet-keypair.json
```

## Wallets: CLI vs Solflare

| Wallet | Rol |
| --- | --- |
| Keypair CLI (pagador / upgrade authority) | Paga el buffer y firma `anchor upgrade` / deploys. **No** es la autoridad del negocio en la UI. |
| Solflare (u otra wallet de navegador) | Firma las operaciones del registro (`crear_registro`, clientes, ventas, `actualizar_cliente`, …) como `owner` del PDA. |

Los keypairs de programa y deployer viven **fuera de Git** (por ejemplo bajo un directorio `.keys/` local). No copies claves privadas a Solflare ni al frontend.

## Instrucción `actualizar_cliente`

```text
actualizar_cliente(id_cliente: u16, nuevo_nombre: String)
```

- Debe firmar el **dueño del registro** (`has_one = owner`).
- La cuenta `cliente` se valida con las semillas PDA existentes: `["cliente", registro, id_cliente u16 LE]`. No hace falta buscar en `registro.clientes`.
- `nuevo_nombre` no vacío y como máximo **30 bytes UTF-8** (misma regla que al crear cliente).
- Solo muta `Cliente.nombre`. Se conservan **ID**, **compras**, **historial**, layout de la cuenta y Program ID.
- Enviar el mismo nombre es válido on-chain (no-op de datos). El frontend puede deshabilitar Guardar si el nombre normalizado no cambia.
- Sin evento nuevo en esta versión; si hay log, solo incluye el `id_cliente`.

Las cinco operaciones previas (`crear_registro`, `crear_cliente`, `registrar_venta`, `cambiar_monto`, `hacer_devolucion`) se mantienen.

## Semillas PDA (compatibles con el frontend)

- `registro` ← `["registro", nombre_negocio, owner]`
- `cliente` ← `["cliente", registro, id_cliente u16 LE]`
- `venta` ← `["venta", cliente, sku]`

## Aportes de este fork (resumen)

1. Workspace Anchor CLI reproducible (sin depender de Playground para el ciclo local).
2. Validaciones on-chain de longitudes UTF-8, capacidad, montos y aritmética.
3. Eventos Anchor en registrar, corregir y devolver ventas.
4. `actualizar_cliente` y IDL exportado en [`idl/registro.json`](./idl/registro.json).

## Observar eventos

```bash
solana confirm -v <FIRMA> --url https://api.devnet.solana.com
```

Los eventos aparecen en los logs del programa (`Program data:`). `actualizar_cliente` no emite evento en esta versión.

## Frontend

App de demo: [jpgsChile/bootcamp-solana](https://github.com/jpgsChile/bootcamp-solana) (rama `feat/actualizar-cliente`).

## Atribución

Material original: WayLearn · Solana Engineering Track.
Se conserva la estructura de instrucciones, cuentas y semillas del ejemplo didáctico.
