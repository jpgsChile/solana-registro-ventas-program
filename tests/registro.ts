import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorError } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import { Registro } from "../target/types/registro";

function u16Le(valor: number): Buffer {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(valor, 0);
  return buf;
}

describe("registro", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Registro as Program<Registro>;
  const owner = provider.wallet as anchor.Wallet;

  const nombreNegocio = "Cafe Local D1";
  let registroPda: PublicKey;
  let clientePda: PublicKey;
  let ventaPda: PublicKey;
  const sku = "CAF01";

  before(() => {
    [registroPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("registro"), Buffer.from(nombreNegocio), owner.publicKey.toBuffer()],
      program.programId,
    );
  });

  it("crea el registro del negocio", async () => {
    await program.methods
      .crearRegistro(nombreNegocio)
      .accounts({
        owner: owner.publicKey,
        registro: registroPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const cuenta = await program.account.registro.fetch(registroPda);
    expect(cuenta.owner.toBase58()).to.equal(owner.publicKey.toBase58());
    expect(cuenta.nombreNegocio).to.equal(nombreNegocio);
    expect(cuenta.idCounter).to.equal(0);
    expect(cuenta.clientes).to.have.length(0);
  });

  it("crea un cliente con id u16 little-endian en la PDA", async () => {
    const siguienteId = 1;
    [clientePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("cliente"), registroPda.toBuffer(), u16Le(siguienteId)],
      program.programId,
    );

    await program.methods
      .crearCliente("Ana")
      .accounts({
        owner: owner.publicKey,
        registro: registroPda,
        cliente: clientePda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const registro = await program.account.registro.fetch(registroPda);
    const cliente = await program.account.cliente.fetch(clientePda);
    expect(registro.idCounter).to.equal(1);
    expect(registro.clientes.map((c) => c.toBase58())).to.include(clientePda.toBase58());
    expect(cliente.idCliente).to.equal(1);
    expect(cliente.nombre).to.equal("Ana");
    expect(cliente.compras).to.equal(0);
  });

  it("registra una venta", async () => {
    [ventaPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("venta"), clientePda.toBuffer(), Buffer.from(sku)],
      program.programId,
    );

    await program.methods
      .registrarVenta(1, sku, "Cafe americano", 50)
      .accounts({
        owner: owner.publicKey,
        registro: registroPda,
        cliente: clientePda,
        venta: ventaPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const venta = await program.account.venta.fetch(ventaPda);
    const cliente = await program.account.cliente.fetch(clientePda);
    expect(venta.sku).to.equal(sku);
    expect(venta.descripcion).to.equal("Cafe americano");
    expect(venta.monto).to.equal(50);
    expect(cliente.compras).to.equal(1);
    expect(cliente.historial.map((h) => h.toBase58())).to.include(ventaPda.toBase58());
  });

  it("corrige el importe de la venta", async () => {
    await program.methods
      .cambiarMonto(1, sku, 55)
      .accounts({
        owner: owner.publicKey,
        registro: registroPda,
        cliente: clientePda,
        venta: ventaPda,
      })
      .rpc();

    const venta = await program.account.venta.fetch(ventaPda);
    expect(venta.monto).to.equal(55);
  });

  it("rechaza una autoridad incorrecta sin mutar el estado", async () => {
    const intruso = Keypair.generate();
    const montoAntes = (await program.account.venta.fetch(ventaPda)).monto;

    try {
      await program.methods
        .cambiarMonto(1, sku, 99)
        .accounts({
          owner: intruso.publicKey,
          registro: registroPda,
          cliente: clientePda,
          venta: ventaPda,
        })
        .signers([intruso])
        .rpc();
      expect.fail("debía rechazar la autoridad incorrecta");
    } catch (error) {
      expect(error).to.be.instanceOf(AnchorError);
      const ae = error as AnchorError;
      expect(ae.error.errorCode.code).to.equal("NoOwner");
    }

    const venta = await program.account.venta.fetch(ventaPda);
    expect(venta.monto).to.equal(montoAntes);
  });

  it("rechaza un SKU activo duplicado", async () => {
    try {
      await program.methods
        .registrarVenta(1, sku, "duplicado", 10)
        .accounts({
          owner: owner.publicKey,
          registro: registroPda,
          cliente: clientePda,
          venta: ventaPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("debía rechazar el SKU duplicado");
    } catch (error) {
      expect(String(error)).to.match(/already in use|0x0|custom program error/i);
    }
  });

  it("rechaza un monto inválido sin mutar el estado", async () => {
    const montoAntes = (await program.account.venta.fetch(ventaPda)).monto;
    try {
      await program.methods
        .cambiarMonto(1, sku, 0)
        .accounts({
          owner: owner.publicKey,
          registro: registroPda,
          cliente: clientePda,
          venta: ventaPda,
        })
        .rpc();
      expect.fail("debía rechazar monto 0");
    } catch (error) {
      expect(error).to.be.instanceOf(AnchorError);
      expect((error as AnchorError).error.errorCode.code).to.equal("MontoInvalido");
    }
    expect((await program.account.venta.fetch(ventaPda)).monto).to.equal(montoAntes);
  });

  it("rechaza un SKU con más de 5 bytes UTF-8", async () => {
    const skuLargo = "CAFÉ01"; // 7 bytes UTF-8
    const [ventaLarga] = PublicKey.findProgramAddressSync(
      [Buffer.from("venta"), clientePda.toBuffer(), Buffer.from(skuLargo)],
      program.programId,
    );
    try {
      await program.methods
        .registrarVenta(1, skuLargo, "no debe crearse", 10)
        .accounts({
          owner: owner.publicKey,
          registro: registroPda,
          cliente: clientePda,
          venta: ventaLarga,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("debía rechazar el SKU largo");
    } catch (error) {
      expect(error).to.be.instanceOf(AnchorError);
      expect((error as AnchorError).error.errorCode.code).to.equal("SkuInvalido");
    }
    expect(await provider.connection.getAccountInfo(ventaLarga)).to.equal(null);
  });

  it("devuelve la venta, retira la referencia y cierra la cuenta", async () => {
    await program.methods
      .hacerDevolucion(1, sku)
      .accounts({
        owner: owner.publicKey,
        registro: registroPda,
        cliente: clientePda,
        venta: ventaPda,
      })
      .rpc();

    const cliente = await program.account.cliente.fetch(clientePda);
    expect(cliente.compras).to.equal(0);
    expect(cliente.historial).to.have.length(0);

    const info = await provider.connection.getAccountInfo(ventaPda);
    expect(info).to.equal(null);
  });
});
