use anchor_lang::prelude::*;

declare_id!("C2dJeFBUGCgjgWdzh28tJZ6dPTmXAiVfod3DBhPy7EUA");

#[program]
pub mod registro {
    use super::*; // Importa todos los structs y enums definidos fuera del modulo

    /////////////////////////// INSTRUCCIONES ///////////////////////////
    /////////////////////////// Crear Registro ///////////////////////////
    pub fn crear_registro(context: Context<NuevoRegistro>, nombre_negocio: String) -> Result<()> {
        require!(
            texto_valido(&nombre_negocio, MAX_NEGOCIO),
            Errores::NombreNegocioInvalido
        );

        context.accounts.registro.set_inner(Registro {
            owner: context.accounts.owner.key(),
            nombre_negocio: nombre_negocio.clone(),
            clientes: Vec::new(),
            id_counter: 0,
        });

        msg!("Registro: {} creado exitosamente!", nombre_negocio);
        Ok(())
    }

    /////////////////////////// Nuevo Cliente ///////////////////////////
    pub fn crear_cliente(context: Context<NuevoCliente>, nombre: String) -> Result<()> {
        require!(texto_valido(&nombre, MAX_NOMBRE), Errores::NombreClienteInvalido);

        let cliente_key = context.accounts.cliente.key();
        let registro = &mut context.accounts.registro;

        require!(
            registro.clientes.len() < MAX_CLIENTES,
            Errores::CapacidadClientes
        );

        // Debe coincidir con la semilla (registro.id_counter + 1).to_le_bytes() del contexto.
        let id_cliente = registro
            .id_counter
            .checked_add(1)
            .ok_or(Errores::DesbordamientoContador)?;
        registro.id_counter = id_cliente;
        registro.clientes.push(cliente_key);

        context.accounts.cliente.set_inner(Cliente {
            id_cliente,
            nombre: nombre.clone(),
            compras: 0,
            historial: Vec::new(),
        });

        msg!("Cliente {} creado con id: {}", nombre, id_cliente);
        Ok(())
    }

    /////////////////////////// Registrar Venta ///////////////////////////
    pub fn registrar_venta(
        context: Context<NuevaVenta>,
        _id_cliente: u16,
        sku: String,
        descripcion: String,
        monto: u32,
    ) -> Result<()> {
        require!(texto_valido(&sku, MAX_SKU), Errores::SkuInvalido);
        require!(
            texto_valido(&descripcion, MAX_DESCRIPCION),
            Errores::DescripcionInvalida
        );
        require!(monto > 0, Errores::MontoInvalido);

        let cliente = &mut context.accounts.cliente;
        require!(
            cliente.historial.len() < MAX_VENTAS,
            Errores::CapacidadVentas
        );

        context.accounts.venta.set_inner(Venta {
            sku,
            descripcion,
            monto,
        });

        let venta_key = context.accounts.venta.key();
        cliente.historial.push(venta_key);
        cliente.compras = cliente
            .compras
            .checked_add(1)
            .ok_or(Errores::DesbordamientoContador)?;

        msg!(
            "Venta registrada para el cliente con id: {}",
            cliente.id_cliente
        );
        Ok(())
    }

    /////////////////////////// Hacer Devolucion ///////////////////////////
    pub fn hacer_devolucion(
        context: Context<EliminarVenta>,
        _id_cliente: u16,
        sku: String,
    ) -> Result<()> {
        let venta_key = context.accounts.venta.key();
        let cliente = &mut context.accounts.cliente;

        require!(cliente.historial.contains(&venta_key), Errores::NoSKU);

        cliente.historial.retain(|&k| k != venta_key);
        cliente.compras = cliente
            .compras
            .checked_sub(1)
            .ok_or(Errores::DesbordamientoContador)?;

        msg!(
            "Venta con sku: {}, devuelta por el cliente con id: {}",
            sku,
            cliente.id_cliente
        );
        Ok(())
    }

    /////////////////////////// Cambiar Monto ///////////////////////////
    pub fn cambiar_monto(
        context: Context<ModificarVenta>,
        _id_cliente: u16,
        sku: String,
        nuevo_monto: u32,
    ) -> Result<()> {
        require!(nuevo_monto > 0, Errores::MontoInvalido);

        let venta = &mut context.accounts.venta;
        let viejo_monto = venta.monto;
        venta.monto = nuevo_monto;

        msg!(
            "El monto de la venta con sku: {}, paso de: {}, a: {}",
            sku,
            viejo_monto,
            nuevo_monto
        );
        Ok(())
    }
}

pub const MAX_NEGOCIO: usize = 30;
pub const MAX_NOMBRE: usize = 30;
pub const MAX_SKU: usize = 5;
pub const MAX_DESCRIPCION: usize = 50;
pub const MAX_CLIENTES: usize = 10;
pub const MAX_VENTAS: usize = 10;

fn texto_valido(valor: &str, max_bytes: usize) -> bool {
    !valor.is_empty() && valor.as_bytes().len() <= max_bytes
}

/////////////////////////// Codigos de Error ///////////////////////////
#[error_code]
pub enum Errores {
    #[msg("Error, no eres el owner del registro")]
    NoOwner,
    #[msg("Error, la venta no esta en el historial del cliente")]
    NoSKU,
    #[msg("Nombre de negocio vacio o mayor a 30 bytes UTF-8")]
    NombreNegocioInvalido,
    #[msg("Nombre de cliente vacio o mayor a 30 bytes UTF-8")]
    NombreClienteInvalido,
    #[msg("SKU vacio o mayor a 5 bytes UTF-8")]
    SkuInvalido,
    #[msg("Descripcion vacia o mayor a 50 bytes UTF-8")]
    DescripcionInvalida,
    #[msg("El monto debe ser un entero positivo")]
    MontoInvalido,
    #[msg("El registro alcanzo el maximo de 10 clientes")]
    CapacidadClientes,
    #[msg("El cliente alcanzo el maximo de 10 ventas activas")]
    CapacidadVentas,
    #[msg("Desbordamiento del contador u16")]
    DesbordamientoContador,
}

/////////////////////////// CUENTAS ///////////////////////////
/////////////////////////// Registro ///////////////////////////

#[account]
#[derive(InitSpace)]
pub struct Registro {
    pub owner: Pubkey, // pub: has_one = owner necesita leer este campo desde el contexto

    #[max_len(30)]
    pub nombre_negocio: String,

    #[max_len(10)] // Guarda PDAs (32 bytes c/u), no structs completos
    pub clientes: Vec<Pubkey>,

    pub id_counter: u16,
}

/////////////////////////// Cliente ///////////////////////////

#[account]
#[derive(InitSpace, PartialEq)]
pub struct Cliente {
    pub id_cliente: u16,

    #[max_len(30)]
    pub nombre: String,

    pub compras: u16,

    #[max_len(10)]
    pub historial: Vec<Pubkey>,
}

/////////////////////////// Venta ///////////////////////////

#[account]
#[derive(InitSpace, PartialEq)]
pub struct Venta {
    #[max_len(5)]
    pub sku: String,

    #[max_len(50)]
    pub descripcion: String,

    pub monto: u32,
}

/////////////////////////// CONTEXTOS ///////////////////////////
/*
La jerarquia del modelo vive en las seeds:

    registro  <- [b"registro", nombre_negocio, owner]
    cliente   <- [b"cliente",  registro, id_cliente]
    venta     <- [b"venta",    cliente,  sku]

Cada cuenta se deriva de su padre, asi que la pertenencia queda garantizada por construccion:
si la direccion coincide, el cliente ES de ese registro. Por eso ya no hace falta recorrer
el vector para validar; los vectores quedan como indice de lectura para el frontend.

El "has_one = owner" cierra la cadena por arriba: comprueba que registro.owner == owner.key(),
es decir, que quien firma es el dueño del registro desde el que se deriva todo lo demas.
*/

/////////////////////////// Nuevo Registro ///////////////////////////
/// Instruccion: crear_registro

#[derive(Accounts)]
#[instruction(nombre_negocio: String)]
pub struct NuevoRegistro<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init,
        payer = owner,
        space = Registro::INIT_SPACE + 8,
        seeds = [b"registro", nombre_negocio.as_bytes(), owner.key().as_ref()],
        bump
    )]
    pub registro: Account<'info, Registro>,

    pub system_program: Program<'info, System>,
}

/////////////////////////// Nuevo Cliente ///////////////////////////
/// Instruccion: crear_cliente

#[derive(Accounts)]
pub struct NuevoCliente<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(mut, has_one = owner @ Errores::NoOwner)]
    pub registro: Account<'info, Registro>,

    #[account(
        init,
        payer = owner,
        space = Cliente::INIT_SPACE + 8,
        // El id sale del contador del propio registro: el programa lo asigna, nadie lo envia.
        // to_le_bytes() porque un u16 no tiene as_bytes(): ese metodo es de String/str
        seeds = [b"cliente", registro.key().as_ref(), (registro.id_counter + 1).to_le_bytes().as_ref()],
        bump
    )]
    pub cliente: Account<'info, Cliente>,

    pub system_program: Program<'info, System>,
}

/////////////////////////// Nueva Venta ///////////////////////////
/// Instruccion: registrar_venta

#[derive(Accounts)]
#[instruction(id_cliente: u16, sku: String)]
pub struct NuevaVenta<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(has_one = owner @ Errores::NoOwner)]
    pub registro: Account<'info, Registro>, // Sin mut: solo se lee para derivar al cliente

    #[account(
        mut,
        seeds = [b"cliente", registro.key().as_ref(), id_cliente.to_le_bytes().as_ref()],
        bump
    )]
    pub cliente: Account<'info, Cliente>,

    #[account(
        init,
        payer = owner,
        space = Venta::INIT_SPACE + 8,
        // El SKU entra en los seeds: un cliente no puede repetir el mismo producto
        seeds = [b"venta", cliente.key().as_ref(), sku.as_bytes()],
        bump
    )]
    pub venta: Account<'info, Venta>,

    pub system_program: Program<'info, System>,
}

/////////////////////////// Modificar Venta ///////////////////////////
/// Instruccion: cambiar_monto

#[derive(Accounts)]
#[instruction(id_cliente: u16, sku: String)]
pub struct ModificarVenta<'info> {
    pub owner: Signer<'info>,

    #[account(has_one = owner @ Errores::NoOwner)]
    pub registro: Account<'info, Registro>,

    #[account(
        seeds = [b"cliente", registro.key().as_ref(), id_cliente.to_le_bytes().as_ref()],
        bump
    )]
    pub cliente: Account<'info, Cliente>, // Sin mut: solo se lee, para derivar la venta

    #[account(
        mut,
        seeds = [b"venta", cliente.key().as_ref(), sku.as_bytes()],
        bump
    )]
    pub venta: Account<'info, Venta>,
}

/////////////////////////// Eliminar Venta ///////////////////////////
/// Instruccion: hacer_devolucion -> cierra la cuenta

#[derive(Accounts)]
#[instruction(id_cliente: u16, sku: String)]
pub struct EliminarVenta<'info> {
    #[account(mut)]
    pub owner: Signer<'info>, // mut: recibe el rent de la cuenta cerrada

    #[account(has_one = owner @ Errores::NoOwner)]
    pub registro: Account<'info, Registro>, // Sin mut: el registro no cambia en una devolucion

    #[account(
        mut,
        seeds = [b"cliente", registro.key().as_ref(), id_cliente.to_le_bytes().as_ref()],
        bump
    )]
    pub cliente: Account<'info, Cliente>,

    #[account(
        mut,
        close = owner,
        seeds = [b"venta", cliente.key().as_ref(), sku.as_bytes()],
        bump
    )]
    pub venta: Account<'info, Venta>,
}
