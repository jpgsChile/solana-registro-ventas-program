# Registro de Ventas en Solana con PDAs (Anchor local)

Programa Anchor reproducible desde Ubuntu, basado en el material educativo de
[WayLearnLatam/Registro-Ventas-Solana-PDA](https://github.com/WayLearnLatam/Registro-Ventas-Solana-PDA).

Este fork adapta el ejemplo de Solana Playground a un workspace Anchor CLI
compatible con el frontend en [`bootcamp-solana`](https://github.com/jpgsChile/bootcamp-solana).

## Versiones fijadas

| Herramienta | Versión verificada |
| --- | --- |
| Rust | 1.98.1 |
| Solana CLI (Agave) | 4.4.1 |
| Anchor (AVM) | 0.31.1 |
| Node.js | 22.x |

```bash
export PATH="$HOME/.avm/bin:$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
avm use 0.31.1
```

## Program ID

```
C2dJeFBUGCgjgWdzh28tJZ6dPTmXAiVfod3DBhPy7EUA
```

Keypairs (fuera de Git):

- Programa: `/home/pablo/Pablo/Solana/.keys/solana-registro-ventas-program/programa-keypair.json`
- Pagador / upgrade authority (Devnet): `.../deployer-devnet-keypair.json`

Copia el keypair del programa a `target/deploy/registro-keypair.json` antes de
compilar o desplegar si el directorio no existe.

## Compilar y probar en local

```bash
cd /home/pablo/Pablo/Solana/solana-registro-ventas-program
npm ci
mkdir -p target/deploy
cp /home/pablo/Pablo/Solana/.keys/solana-registro-ventas-program/programa-keypair.json \
  target/deploy/registro-keypair.json
anchor build
anchor test
```

Artefactos del mismo build:

- `.so`: `target/deploy/registro.so`
- IDL: `target/idl/registro.json` (copia estable en `idl/registro.json`)

## Semillas PDA (compatibles con el frontend)

- `registro` ← `["registro", nombre_negocio, owner]`
- `cliente` ← `["cliente", registro, id_cliente u16 LE]`
- `venta` ← `["venta", cliente, sku]`

## Aportes propios (resumen)

1. Workspace Anchor CLI reproducible (sin Playground).
2. Validaciones on-chain de longitudes UTF-8, capacidad, montos y aritmética.
3. Eventos Anchor en registrar venta, corregir importe y devolver venta.

## Observar eventos

Tras una transacción confirmada en Devnet:

```bash
solana confirm -v <FIRMA> --url https://api.devnet.solana.com
```

Los eventos aparecen en los logs del programa (`Program data:`).

## Atribución

Material original: WayLearn · Solana Engineering Track.
Conservamos la estructura de instrucciones, cuentas y semillas del ejemplo didáctico.
