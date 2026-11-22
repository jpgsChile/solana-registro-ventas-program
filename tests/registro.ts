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

  it("actualiza el nombre de un cliente con ventas sin alterar id, PDA, compras ni historial", async () => {
    const antes = await program.account.cliente.fetch(clientePda);
    expect(antes.compras).to.be.greaterThan(0);
    expect(antes.historial).to.have.length.greaterThan(0);
    const historialAntes = antes.historial.map((h) => h.toBase58());

    await program.methods
      .actualizarCliente(1, "Ana Actualizada")
      .accounts({
        owner: owner.publicKey,
        registro: registroPda,
        cliente: clientePda,
      })
      .rpc();

    const despues = await program.account.cliente.fetch(clientePda);
    expect(despues.nombre).to.equal("Ana Actualizada");
    expect(despues.idCliente).to.equal(antes.idCliente);
    expect(despues.compras).to.equal(antes.compras);
    expect(despues.historial.map((h) => h.toBase58())).to.deep.equal(historialAntes);
  });

  it("actualiza el nombre de un cliente sin ventas", async () => {
    const idSinVentas = 2;
    const [clienteSinVentas] = PublicKey.findProgramAddressSync(
      [Buffer.from("cliente"), registroPda.toBuffer(), u16Le(idSinVentas)],
      program.programId,
    );

    await program.methods
      .crearCliente("Bruno")
      .accounts({
        owner: owner.publicKey,
        registro: registroPda,
        cliente: clienteSinVentas,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const antes = await program.account.cliente.fetch(clienteSinVentas);
    expect(antes.compras).to.equal(0);
    expect(antes.historial).to.have.length(0);

    await program.methods
      .actualizarCliente(idSinVentas, "Bruno Renombrado")
      .accounts({
        owner: owner.publicKey,
        registro: registroPda,
        cliente: clienteSinVentas,
      })
      .rpc();

    const despues = await program.account.cliente.fetch(clienteSinVentas);
    expect(despues.nombre).to.equal("Bruno Renombrado");
    expect(despues.idCliente).to.equal(idSinVentas);
    expect(despues.compras).to.equal(0);
    expect(despues.historial).to.have.length(0);
  });

  it("permite actualizar con el mismo nombre (sin cambio de datos)", async () => {
    await program.methods
      .actualizarCliente(1, "Ana Actualizada")
      .accounts({
        owner: owner.publicKey,
        registro: registroPda,
        cliente: clientePda,
      })
      .rpc();
    const cliente = await program.account.cliente.fetch(clientePda);
    expect(cliente.nombre).to.equal("Ana Actualizada");
  });

  it("rechaza un nombre de cliente invalido sin mutar el estado", async () => {
    const nombreAntes = (await program.account.cliente.fetch(clientePda)).nombre;

    try {
      await program.methods
        .actualizarCliente(1, "")
        .accounts({
          owner: owner.publicKey,
          registro: registroPda,
          cliente: clientePda,
        })
        .rpc();
      expect.fail("debía rechazar nombre vacío");
    } catch (error) {
      expect(error).to.be.instanceOf(AnchorError);
      expect((error as AnchorError).error.errorCode.code).to.equal("NombreClienteInvalido");
    }

    try {
      await program.methods
        .actualizarCliente(1, "ñ".repeat(16)) // 32 bytes UTF-8
        .accounts({
          owner: owner.publicKey,
          registro: registroPda,
          cliente: clientePda,
        })
        .rpc();
      expect.fail("debía rechazar nombre demasiado largo");
    } catch (error) {
      expect(error).to.be.instanceOf(AnchorError);
      expect((error as AnchorError).error.errorCode.code).to.equal("NombreClienteInvalido");
    }

    expect((await program.account.cliente.fetch(clientePda)).nombre).to.equal(nombreAntes);
  });

  it("rechaza actualizar cliente con autoridad incorrecta sin mutar el estado", async () => {
    const intruso = Keypair.generate();
    const nombreAntes = (await program.account.cliente.fetch(clientePda)).nombre;

    try {
      await program.methods
        .actualizarCliente(1, "Intruso")
        .accounts({
          owner: intruso.publicKey,
          registro: registroPda,
          cliente: clientePda,
        })
        .signers([intruso])
        .rpc();
      expect.fail("debía rechazar la autoridad incorrecta");
    } catch (error) {
      expect(error).to.be.instanceOf(AnchorError);
      expect((error as AnchorError).error.errorCode.code).to.equal("NoOwner");
    }

    expect((await program.account.cliente.fetch(clientePda)).nombre).to.equal(nombreAntes);
  });

  it("rechaza una PDA de cliente de otro registro", async () => {
    const otroNegocio = "Otro Cafe D1";
    const [otroRegistro] = PublicKey.findProgramAddressSync(
      [Buffer.from("registro"), Buffer.from(otroNegocio), owner.publicKey.toBuffer()],
      program.programId,
    );

    await program.methods
      .crearRegistro(otroNegocio)
      .accounts({
        owner: owner.publicKey,
        registro: otroRegistro,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const nombreAntes = (await program.account.cliente.fetch(clientePda)).nombre;

    try {
      await program.methods
        .actualizarCliente(1, "Cruzado")
        .accounts({
          owner: owner.publicKey,
          registro: otroRegistro,
          cliente: clientePda,
        })
        .rpc();
      expect.fail("debía rechazar PDA de otro registro");
    } catch (error) {
      expect(error).to.be.instanceOf(AnchorError);
      expect((error as AnchorError).error.errorCode.code).to.equal("ConstraintSeeds");
    }

    expect((await program.account.cliente.fetch(clientePda)).nombre).to.equal(nombreAntes);
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
