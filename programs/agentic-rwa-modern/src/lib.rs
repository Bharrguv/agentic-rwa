use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};
use anchor_spl::associated_token::AssociatedToken;

declare_id!("39CDc5zXBMFkjqZoELL4bYr9VrMNZCk1e9tzGnrgmdpz");

#[program]
pub mod agentic_rwa_modern {
    use super::*;

    pub fn initialize_vault(ctx: Context<InitializeVault>, ltv_bps: u16) -> Result<()> {
        require!(ltv_bps <= 9000, ErrorCode::InvalidLtv);
        let vault = &mut ctx.accounts.vault;
        vault.authority = ctx.accounts.authority.key();
        vault.rwa_mint = ctx.accounts.rwa_mint.key();
        vault.stable_mint = ctx.accounts.stable_mint.key();
        vault.ltv_bps = ltv_bps;
        vault.bump = ctx.bumps.vault;
        Ok(())
    }

    pub fn deposit_collateral(ctx: Context<DepositCollateral>, amount: u64) -> Result<()> {
        require!(amount > 0, ErrorCode::ZeroAmount);

        let decimals = ctx.accounts.rwa_mint.decimals;
        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                TransferChecked {
                    from: ctx.accounts.user_rwa_account.to_account_info(),
                    mint: ctx.accounts.rwa_mint.to_account_info(),
                    to: ctx.accounts.vault_rwa_account.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount,
            decimals,
        )?;

        let position = &mut ctx.accounts.position;
        position.owner = ctx.accounts.user.key();
        position.collateral_amount = position.collateral_amount.checked_add(amount).unwrap();
        position.bump = ctx.bumps.position;
        Ok(())
    }

    pub fn borrow(ctx: Context<Borrow>, amount: u64) -> Result<()> {
        require!(amount > 0, ErrorCode::ZeroAmount);

        let position = &mut ctx.accounts.position;
        let vault = &ctx.accounts.vault;

        let max_borrow = (position.collateral_amount as u128)
            .checked_mul(vault.ltv_bps as u128)
            .unwrap()
            .checked_div(10_000)
            .unwrap() as u64;

        let new_borrowed = position.borrowed_amount.checked_add(amount).unwrap();
        require!(new_borrowed <= max_borrow, ErrorCode::ExceedsLtv);

        let seeds = &[b"vault".as_ref(), &[vault.bump]];
        let signer = &[&seeds[..]];
        let decimals = ctx.accounts.stable_mint.decimals;

        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                TransferChecked {
                    from: ctx.accounts.vault_stable_account.to_account_info(),
                    mint: ctx.accounts.stable_mint.to_account_info(),
                    to: ctx.accounts.user_stable_account.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                signer,
            ),
            amount,
            decimals,
        )?;

        position.borrowed_amount = new_borrowed;
        Ok(())
    }

    pub fn repay(ctx: Context<Repay>, amount: u64) -> Result<()> {
        require!(amount > 0, ErrorCode::ZeroAmount);

        let position = &mut ctx.accounts.position;
        let repay_amount = std::cmp::min(amount, position.borrowed_amount);
        let decimals = ctx.accounts.stable_mint.decimals;

        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                TransferChecked {
                    from: ctx.accounts.user_stable_account.to_account_info(),
                    mint: ctx.accounts.stable_mint.to_account_info(),
                    to: ctx.accounts.vault_stable_account.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            repay_amount,
            decimals,
        )?;

        position.borrowed_amount = position.borrowed_amount.checked_sub(repay_amount).unwrap();
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 32 + 32 + 2 + 1,
        seeds = [b"vault"],
        bump
    )]
    pub vault: Account<'info, Vault>,
    pub rwa_mint: InterfaceAccount<'info, Mint>,
    pub stable_mint: InterfaceAccount<'info, Mint>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositCollateral<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        init,
        payer = user,
        space = 8 + 32 + 8 + 8 + 1,
        seeds = [b"position", user.key().as_ref()],
        bump
    )]
    pub position: Account<'info, Position>,
    #[account(seeds = [b"vault"], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
    pub rwa_mint: InterfaceAccount<'info, Mint>,
    #[account(mut)]
    pub user_rwa_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub vault_rwa_account: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[derive(Accounts)]
pub struct Borrow<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        seeds = [b"position", user.key().as_ref()],
        bump = position.bump,
        constraint = position.owner == user.key()
    )]
    pub position: Account<'info, Position>,
    #[account(seeds = [b"vault"], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
    pub stable_mint: InterfaceAccount<'info, Mint>,
    #[account(mut)]
    pub user_stable_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub vault_stable_account: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct Repay<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        seeds = [b"position", user.key().as_ref()],
        bump = position.bump,
        constraint = position.owner == user.key()
    )]
    pub position: Account<'info, Position>,
    #[account(seeds = [b"vault"], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
    pub stable_mint: InterfaceAccount<'info, Mint>,
    #[account(mut)]
    pub user_stable_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub vault_stable_account: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[account]
pub struct Vault {
    pub authority: Pubkey,
    pub rwa_mint: Pubkey,
    pub stable_mint: Pubkey,
    pub ltv_bps: u16,
    pub bump: u8,
}

#[account]
pub struct Position {
    pub owner: Pubkey,
    pub collateral_amount: u64,
    pub borrowed_amount: u64,
    pub bump: u8,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid LTV")]
    InvalidLtv,
    #[msg("Amount must be > 0")]
    ZeroAmount,
    #[msg("Exceeds LTV")]
    ExceedsLtv,
}
