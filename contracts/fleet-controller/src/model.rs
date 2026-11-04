//! Pure controller state machine.
//!
//! This module contains no NEAR host calls and no receipt scheduling. The
//! contract wrapper (`lib.rs`) validates the signer, calls these functions, and
//! schedules `AddKey`/`DeleteKey` receipts. Tests drive this state machine
//! directly and compare it to an independent reference model.

use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub const VERSION: &str = "fleet-controller-v0.3.0";
pub const MAX_AUDIT_PAGE: u64 = 100;
pub const MAX_OPERATORS_CAP: u32 = 64;
pub const MAX_SUBJECT_LEN: usize = 256;
pub const MAX_TAG_LEN: usize = 32;
pub const MAX_METHOD_LEN: usize = 64;
pub const MAX_ARGS_LEN: usize = 4096;
pub const MAX_EXECUTE_GAS: u64 = 100_000_000_000_000; // 100 Tgas

/// A controller admin mode. Exactly one variant is populated.
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(crate = "near_sdk::serde")]
pub enum Mode {
    /// A team-held admin key and a recovery key. Both are FunctionCall keys.
    A {
        admin_pk: String,
        recovery_pk: String,
    },
    /// A governed account (for example a 2-of-2 multisig) is the admin.
    B { admin_account: String },
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(crate = "near_sdk::serde")]
pub struct Operator {
    pub pk: String,
    pub tag: String,
    /// False while the AddKey receipt is in flight, or after it failed.
    pub active: bool,
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(crate = "near_sdk::serde")]
pub enum PendingOrigin {
    Admin,
    Recovery,
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(crate = "near_sdk::serde")]
pub struct PendingAdmin {
    pub pk: String,
    pub origin: PendingOrigin,
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(crate = "near_sdk::serde")]
pub struct AuditEntry {
    pub seq: u64,
    pub action: String,
    pub actor_account: String,
    pub signer_pk: String,
    pub subject: String,
    pub block_height: u64,
    pub block_timestamp: u64,
    pub prev_hash: String,
    pub entry_hash: String,
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(crate = "near_sdk::serde")]
pub struct AuditHead {
    pub seq: u64,
    pub entry_hash: String,
    pub block_height: u64,
    pub block_timestamp: u64,
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(crate = "near_sdk::serde")]
pub struct State {
    pub mode: Mode,
    pub paused: bool,
    pub operators: Vec<Operator>,
    pub pending_admin: Option<PendingAdmin>,
    /// Reservation for an AddKey that has not been confirmed yet.
    pub inflight_admin: Option<String>,
    pub inflight_origin: Option<PendingOrigin>,
    pub receiver: String,
    pub method: String,
    pub max_operators: u32,
    pub audit: Vec<AuditEntry>,
    pub provisioned: bool,
    pub provision_error: Option<String>,
    pub pending_operators: Vec<Operator>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Actor {
    pub account: String,
    pub signer_pk: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Error {
    NotProvisioned,
    AlreadyProvisioned,
    InvalidMode,
    InvalidKey,
    InvalidAccount,
    InvalidTag,
    InvalidMethod,
    InvalidArgs,
    InvalidGas,
    KeyCollision,
    Capacity,
    AdminOnly,
    RecoveryOnly,
    PendingOnly,
    DirectCallOnly,
    Frozen,
    NotFrozen,
    NoPending,
    PendingExists,
    OperatorMissing,
    TagMissing,
    NotActive,
    BadDeposit,
    AuditBroken,
}

impl Error {
    pub fn message(self) -> &'static str {
        match self {
            Error::NotProvisioned => "controller is not provisioned",
            Error::AlreadyProvisioned => "controller is already provisioned",
            Error::InvalidMode => "exactly one admin mode is required",
            Error::InvalidKey => "invalid public key",
            Error::InvalidAccount => "invalid account id",
            Error::InvalidTag => "invalid tag",
            Error::InvalidMethod => "invalid method",
            Error::InvalidArgs => "invalid arguments",
            Error::InvalidGas => "gas above policy cap",
            Error::KeyCollision => "key already has a role",
            Error::Capacity => "operator capacity reached",
            Error::AdminOnly => "active admin required",
            Error::RecoveryOnly => "recovery key required",
            Error::PendingOnly => "pending admin key required",
            Error::DirectCallOnly => "direct call to this account only",
            Error::Frozen => "controller is frozen",
            Error::NotFrozen => "controller is not frozen",
            Error::NoPending => "no pending admin",
            Error::PendingExists => "a rotation is already pending",
            Error::OperatorMissing => "operator not registered",
            Error::TagMissing => "no operators with that tag",
            Error::NotActive => "operator key is not active",
            Error::BadDeposit => "deposit must be zero",
            Error::AuditBroken => "audit chain is broken",
        }
    }
}

fn is_lower_hex_or_sep(c: char) -> bool {
    c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '_' || c == '.'
}

/// NEAR account IDs are lower-case, 2..=64 bytes, dot-separated labels.
pub fn valid_account(value: &str) -> bool {
    if value.len() < 2 || value.len() > 64 || !value.contains('.') {
        return false;
    }
    if value.starts_with('.') || value.ends_with('.') || value.contains("..") {
        return false;
    }
    value.chars().all(is_lower_hex_or_sep)
}

/// A NEAR public key string: `<curve>:<base58>`. We do not decode base58 here;
/// the host rejects malformed keys when the AddKey action executes, and the SDK
/// validates with the RPC before submitting.
pub fn valid_public_key(value: &str) -> bool {
    if value.len() < 12 || value.len() > 80 {
        return false;
    }
    let Some((curve, rest)) = value.split_once(':') else {
        return false;
    };
    if !matches!(curve, "ed25519" | "secp256k1") {
        return false;
    }
    !rest.is_empty()
        && rest.len() <= 64
        && rest
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '+' || c == '/')
}

pub fn valid_tag(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= MAX_TAG_LEN
        && value
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '_')
}

pub fn valid_method(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= MAX_METHOD_LEN
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

pub fn hex_encode(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(HEX[(byte >> 4) as usize] as char);
        out.push(HEX[(byte & 0x0f) as usize] as char);
    }
    out
}

#[allow(clippy::too_many_arguments)]
fn hash_message(
    prev_hash: &str,
    seq: u64,
    action: &str,
    actor_account: &str,
    signer_pk: &str,
    subject: &str,
    block_height: u64,
    block_timestamp: u64,
) -> String {
    let message = format!(
        "{}|{}|{}|{}|{}|{}|{}|{}",
        prev_hash, seq, action, actor_account, signer_pk, subject, block_height, block_timestamp
    );
    let digest = Sha256::digest(message.as_bytes());
    hex_encode(&digest[..])
}

impl State {
    pub fn init(
        mode: Mode,
        receiver: String,
        method: String,
        max_operators: u32,
        operators: Vec<Operator>,
        provisioned: bool,
    ) -> Result<Self, Error> {
        if !valid_account(&receiver) || !valid_method(&method) {
            return Err(Error::InvalidMethod);
        }
        if max_operators == 0 || max_operators > MAX_OPERATORS_CAP {
            return Err(Error::Capacity);
        }
        if operators.len() as u32 > max_operators {
            return Err(Error::Capacity);
        }
        let mut seen = Vec::new();
        for op in &operators {
            if !valid_public_key(&op.pk) || !valid_tag(&op.tag) {
                return Err(Error::InvalidKey);
            }
            if seen.contains(&op.pk) {
                return Err(Error::KeyCollision);
            }
            seen.push(op.pk.clone());
        }
        match &mode {
            Mode::A {
                admin_pk,
                recovery_pk,
            } => {
                if !valid_public_key(admin_pk) || !valid_public_key(recovery_pk) {
                    return Err(Error::InvalidKey);
                }
                if admin_pk == recovery_pk {
                    return Err(Error::KeyCollision);
                }
                if seen.contains(admin_pk) || seen.contains(recovery_pk) {
                    return Err(Error::KeyCollision);
                }
            }
            Mode::B { admin_account } => {
                if !valid_account(admin_account) {
                    return Err(Error::InvalidAccount);
                }
            }
        }
        let mut ops = operators;
        if provisioned {
            for op in &mut ops {
                op.active = true;
            }
        }
        Ok(Self {
            mode,
            paused: false,
            operators: if provisioned { ops.clone() } else { Vec::new() },
            pending_admin: None,
            inflight_admin: None,
            inflight_origin: None,
            receiver,
            method,
            max_operators,
            audit: Vec::new(),
            provisioned,
            provision_error: None,
            pending_operators: if provisioned { Vec::new() } else { ops },
        })
    }

    pub fn admin_mode(&self) -> &'static str {
        match self.mode {
            Mode::A { .. } => "A",
            Mode::B { .. } => "B",
        }
    }

    pub fn admin_pk(&self) -> Option<&str> {
        match &self.mode {
            Mode::A { admin_pk, .. } => Some(admin_pk),
            Mode::B { .. } => None,
        }
    }

    pub fn recovery_pk(&self) -> Option<&str> {
        match &self.mode {
            Mode::A { recovery_pk, .. } => Some(recovery_pk),
            Mode::B { .. } => None,
        }
    }

    pub fn admin_account(&self) -> Option<&str> {
        match &self.mode {
            Mode::A { .. } => None,
            Mode::B { admin_account } => Some(admin_account),
        }
    }

    pub fn active_operators(&self) -> Vec<&Operator> {
        self.operators.iter().filter(|op| op.active).collect()
    }

    pub fn operator_for(&self, pk: &str) -> Option<&Operator> {
        self.operators.iter().find(|op| op.pk == pk)
    }

    pub fn audit_head(&self) -> AuditHead {
        match self.audit.last() {
            Some(last) => AuditHead {
                seq: last.seq,
                entry_hash: last.entry_hash.clone(),
                block_height: last.block_height,
                block_timestamp: last.block_timestamp,
            },
            None => AuditHead {
                seq: 0,
                entry_hash: "0".repeat(64),
                block_height: 0,
                block_timestamp: 0,
            },
        }
    }

    pub fn audit_page(&self, from_seq: u64, limit: u64) -> Vec<AuditEntry> {
        let limit = limit.min(MAX_AUDIT_PAGE) as usize;
        self.audit
            .iter()
            .filter(|entry| entry.seq >= from_seq)
            .take(limit)
            .cloned()
            .collect()
    }

    pub fn audit_entry(&self, seq: u64) -> Option<AuditEntry> {
        self.audit.iter().find(|entry| entry.seq == seq).cloned()
    }

    pub fn record(
        &mut self,
        action: &str,
        actor_account: &str,
        signer_pk: &str,
        subject: &str,
        block_height: u64,
        block_timestamp: u64,
    ) -> Result<(), Error> {
        if action.len() > 64 || subject.len() > MAX_SUBJECT_LEN {
            return Err(Error::InvalidArgs);
        }
        let seq = self.audit.len() as u64;
        let prev_hash = self
            .audit
            .last()
            .map(|entry| entry.entry_hash.clone())
            .unwrap_or_else(|| "0".repeat(64));
        let entry_hash = hash_message(
            &prev_hash,
            seq,
            action,
            actor_account,
            signer_pk,
            subject,
            block_height,
            block_timestamp,
        );
        self.audit.push(AuditEntry {
            seq,
            action: action.to_string(),
            actor_account: actor_account.to_string(),
            signer_pk: signer_pk.to_string(),
            subject: subject.to_string(),
            block_height,
            block_timestamp,
            prev_hash,
            entry_hash,
        });
        Ok(())
    }

    pub fn verify_audit(&self) -> bool {
        let mut prev = "0".repeat(64);
        for (index, entry) in self.audit.iter().enumerate() {
            if entry.seq != index as u64 || entry.prev_hash != prev {
                return false;
            }
            let expected = hash_message(
                &entry.prev_hash,
                entry.seq,
                &entry.action,
                &entry.actor_account,
                &entry.signer_pk,
                &entry.subject,
                entry.block_height,
                entry.block_timestamp,
            );
            if entry.entry_hash != expected {
                return false;
            }
            prev = entry.entry_hash.clone();
        }
        true
    }

    fn require_admin(&self, actor: &Actor, current: &str) -> Result<(), Error> {
        match &self.mode {
            Mode::A { admin_pk, .. } => {
                if actor.account != current || &actor.signer_pk != admin_pk {
                    return Err(Error::AdminOnly);
                }
            }
            Mode::B { admin_account } => {
                if &actor.account != admin_account {
                    return Err(Error::AdminOnly);
                }
            }
        }
        Ok(())
    }

    fn require_recovery(&self, actor: &Actor, current: &str) -> Result<(), Error> {
        match &self.mode {
            Mode::A { recovery_pk, .. } => {
                if actor.account != current || &actor.signer_pk != recovery_pk {
                    return Err(Error::RecoveryOnly);
                }
                Ok(())
            }
            Mode::B { .. } => Err(Error::RecoveryOnly),
        }
    }

    pub fn require_operator(&self, actor: &Actor, current: &str) -> Result<(), Error> {
        if actor.account != current {
            return Err(Error::DirectCallOnly);
        }
        if self.paused {
            return Err(Error::Frozen);
        }
        let Some(op) = self.operator_for(&actor.signer_pk) else {
            return Err(Error::AdminOnly);
        };
        if !op.active {
            return Err(Error::NotActive);
        }
        Ok(())
    }

    fn fresh_key(&self, pk: &str) -> bool {
        if Some(pk) == self.admin_pk() || Some(pk) == self.recovery_pk() {
            return false;
        }
        if self.pending_admin.as_ref().map(|p| p.pk.as_str()) == Some(pk) {
            return false;
        }
        if self.inflight_admin.as_deref() == Some(pk) {
            return false;
        }
        !self.operators.iter().any(|op| op.pk == pk)
            && !self.pending_operators.iter().any(|op| op.pk == pk)
    }

    pub fn freeze(
        &mut self,
        actor: &Actor,
        current: &str,
        height: u64,
        timestamp: u64,
    ) -> Result<(), Error> {
        self.require_admin(actor, current)?;
        if self.paused {
            return Err(Error::Frozen);
        }
        self.paused = true;
        self.record(
            "freeze",
            &actor.account,
            &actor.signer_pk,
            "paused=true",
            height,
            timestamp,
        )
    }

    pub fn unfreeze(
        &mut self,
        actor: &Actor,
        current: &str,
        height: u64,
        timestamp: u64,
    ) -> Result<(), Error> {
        self.require_admin(actor, current)?;
        if !self.paused {
            return Err(Error::NotFrozen);
        }
        self.paused = false;
        self.record(
            "unfreeze",
            &actor.account,
            &actor.signer_pk,
            "paused=false",
            height,
            timestamp,
        )
    }

    pub fn prepare_grant(
        &mut self,
        actor: &Actor,
        current: &str,
        pk: &str,
        tag: &str,
        height: u64,
        timestamp: u64,
    ) -> Result<(), Error> {
        self.require_admin(actor, current)?;
        if !self.provisioned {
            return Err(Error::NotProvisioned);
        }
        if !valid_public_key(pk) {
            return Err(Error::InvalidKey);
        }
        if !valid_tag(tag) {
            return Err(Error::InvalidTag);
        }
        if !self.fresh_key(pk) {
            return Err(Error::KeyCollision);
        }
        if self.operators.len() as u32 >= self.max_operators {
            return Err(Error::Capacity);
        }
        self.operators.push(Operator {
            pk: pk.to_string(),
            tag: tag.to_string(),
            active: false,
        });
        self.record(
            "grant_operator",
            &actor.account,
            &actor.signer_pk,
            &format!("{};tag={}", pk, tag),
            height,
            timestamp,
        )
    }

    pub fn confirm_grant(
        &mut self,
        pk: &str,
        ok: bool,
        height: u64,
        timestamp: u64,
    ) -> Result<(), Error> {
        let Some(op) = self
            .operators
            .iter_mut()
            .find(|op| op.pk == pk && !op.active)
        else {
            return Err(Error::OperatorMissing);
        };
        if ok {
            op.active = true;
            self.record("grant_confirmed", "", "", pk, height, timestamp)
        } else {
            self.operators.retain(|op| op.pk != pk);
            self.record("grant_failed", "", "", pk, height, timestamp)
        }
    }

    pub fn revoke_operator(
        &mut self,
        actor: &Actor,
        current: &str,
        pk: &str,
        height: u64,
        timestamp: u64,
    ) -> Result<(), Error> {
        self.require_admin(actor, current)?;
        if !self.operators.iter().any(|op| op.pk == pk) {
            return Err(Error::OperatorMissing);
        }
        self.operators.retain(|op| op.pk != pk);
        self.record(
            "revoke_operator",
            &actor.account,
            &actor.signer_pk,
            pk,
            height,
            timestamp,
        )
    }

    pub fn revoke_tag(
        &mut self,
        actor: &Actor,
        current: &str,
        tag: &str,
        height: u64,
        timestamp: u64,
    ) -> Result<Vec<String>, Error> {
        self.require_admin(actor, current)?;
        if !valid_tag(tag) {
            return Err(Error::InvalidTag);
        }
        let revoked: Vec<String> = self
            .operators
            .iter()
            .filter(|op| op.tag == tag)
            .map(|op| op.pk.clone())
            .collect();
        if revoked.is_empty() {
            return Err(Error::TagMissing);
        }
        self.operators.retain(|op| op.tag != tag);
        self.record(
            "revoke_tag",
            &actor.account,
            &actor.signer_pk,
            &format!("tag={};removed={}", tag, revoked.join(",")),
            height,
            timestamp,
        )?;
        Ok(revoked)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn prepare_rotate(
        &mut self,
        actor: &Actor,
        current: &str,
        old_pk: &str,
        new_pk: &str,
        tag: &str,
        height: u64,
        timestamp: u64,
    ) -> Result<(), Error> {
        self.require_admin(actor, current)?;
        if !valid_public_key(new_pk) || !valid_tag(tag) {
            return Err(Error::InvalidKey);
        }
        let Some(old) = self.operator_for(old_pk) else {
            return Err(Error::OperatorMissing);
        };
        if !old.active {
            return Err(Error::NotActive);
        }
        if old_pk == new_pk || !self.fresh_key(new_pk) {
            return Err(Error::KeyCollision);
        }
        if self.operators.len() as u32 >= self.max_operators {
            return Err(Error::Capacity);
        }
        self.operators.push(Operator {
            pk: new_pk.to_string(),
            tag: tag.to_string(),
            active: false,
        });
        self.record(
            "rotate_operator",
            &actor.account,
            &actor.signer_pk,
            &format!("{}->{};tag={}", old_pk, new_pk, tag),
            height,
            timestamp,
        )
    }

    pub fn confirm_rotate(
        &mut self,
        old_pk: &str,
        new_pk: &str,
        ok: bool,
        height: u64,
        timestamp: u64,
    ) -> Result<(), Error> {
        let Some(new_op) = self
            .operators
            .iter_mut()
            .find(|op| op.pk == new_pk && !op.active)
        else {
            return Err(Error::OperatorMissing);
        };
        if ok {
            new_op.active = true;
            self.operators
                .retain(|op| op.pk != old_pk || op.pk == new_pk);
            self.record("rotate_confirmed", "", "", new_pk, height, timestamp)
        } else {
            self.operators.retain(|op| op.pk != new_pk);
            self.record("rotate_failed", "", "", new_pk, height, timestamp)
        }
    }

    pub fn prepare_propose(
        &mut self,
        actor: &Actor,
        current: &str,
        new_pk: &str,
        origin: PendingOrigin,
        height: u64,
        timestamp: u64,
    ) -> Result<(), Error> {
        match origin {
            PendingOrigin::Admin => self.require_admin(actor, current)?,
            PendingOrigin::Recovery => self.require_recovery(actor, current)?,
        }
        if !matches!(self.mode, Mode::A { .. }) {
            return Err(Error::InvalidMode);
        }
        if self.pending_admin.is_some() {
            return Err(Error::PendingExists);
        }
        if self.inflight_admin.is_some() {
            return Err(Error::PendingExists);
        }
        if !valid_public_key(new_pk) || !self.fresh_key(new_pk) {
            return Err(Error::KeyCollision);
        }
        self.inflight_admin = Some(new_pk.to_string());
        self.inflight_origin = Some(origin.clone());
        let action = match origin {
            PendingOrigin::Admin => "propose_admin",
            PendingOrigin::Recovery => "recover_admin",
        };
        self.record(
            action,
            &actor.account,
            &actor.signer_pk,
            new_pk,
            height,
            timestamp,
        )
    }

    pub fn confirm_propose(
        &mut self,
        new_pk: &str,
        ok: bool,
        height: u64,
        timestamp: u64,
    ) -> Result<(), Error> {
        if self.inflight_admin.as_deref() != Some(new_pk) {
            return Err(Error::NoPending);
        }
        let origin = self.inflight_origin.take().unwrap_or(PendingOrigin::Admin);
        self.inflight_admin = None;
        if ok {
            self.pending_admin = Some(PendingAdmin {
                pk: new_pk.to_string(),
                origin: origin.clone(),
            });
            let action = match origin {
                PendingOrigin::Admin => "propose_confirmed",
                PendingOrigin::Recovery => "recover_confirmed",
            };
            self.record(action, "", "", new_pk, height, timestamp)
        } else {
            let action = match origin {
                PendingOrigin::Admin => "propose_failed",
                PendingOrigin::Recovery => "recover_failed",
            };
            self.record(action, "", "", new_pk, height, timestamp)
        }
    }

    pub fn accept_admin(
        &mut self,
        actor: &Actor,
        current: &str,
        height: u64,
        timestamp: u64,
    ) -> Result<String, Error> {
        let pending = self.pending_admin.clone().ok_or(Error::NoPending)?;
        if actor.account != current && matches!(self.mode, Mode::A { .. }) {
            return Err(Error::DirectCallOnly);
        }
        if matches!(self.mode, Mode::A { .. }) && actor.signer_pk != pending.pk {
            return Err(Error::PendingOnly);
        }
        let old_admin = self.admin_pk().map(str::to_string);
        self.mode = Mode::A {
            admin_pk: pending.pk.clone(),
            recovery_pk: self.recovery_pk().unwrap_or_default().to_string(),
        };
        self.pending_admin = None;
        self.record(
            "accept_admin",
            &actor.account,
            &actor.signer_pk,
            &pending.pk,
            height,
            timestamp,
        )?;
        Ok(old_admin.unwrap_or_default())
    }

    pub fn cancel_admin(
        &mut self,
        actor: &Actor,
        current: &str,
        height: u64,
        timestamp: u64,
    ) -> Result<Option<String>, Error> {
        let allowed = self.require_admin(actor, current).is_ok()
            || self.require_recovery(actor, current).is_ok();
        if !allowed {
            return Err(Error::AdminOnly);
        }
        if self.pending_admin.is_none() && self.inflight_admin.is_none() {
            return Err(Error::NoPending);
        }
        let pending = self.pending_admin.take().map(|p| p.pk);
        self.inflight_admin = None;
        self.inflight_origin = None;
        let subject = pending.clone().unwrap_or_else(|| "inflight".to_string());
        self.record(
            "cancel_admin",
            &actor.account,
            &actor.signer_pk,
            &subject,
            height,
            timestamp,
        )?;
        Ok(pending)
    }

    /// The provisioning callback promotes the reserved operator list.
    pub fn confirm_provision(
        &mut self,
        ok: bool,
        height: u64,
        timestamp: u64,
    ) -> Result<(), Error> {
        if self.provisioned {
            return Err(Error::AlreadyProvisioned);
        }
        if ok {
            self.operators = std::mem::take(&mut self.pending_operators);
            for op in &mut self.operators {
                op.active = true;
            }
            self.provisioned = true;
            self.provision_error = None;
            self.record("init", "", "", "provisioned", height, timestamp)
        } else {
            self.provision_error = Some("key installation failed".to_string());
            self.record(
                "init_failed",
                "",
                "",
                "key installation failed",
                height,
                timestamp,
            )
        }
    }
}

// Reference model lives in `reference_model.rs` (written from SPEC alone).

#[cfg(test)]
mod tests {
    use super::*;
    use crate::reference_model::Reference;

    const ADMIN: &str = "ed25519:2dckMmmyFQdr4J78vGfqm7XaK4ck2HgCvN8gSDfiQyx2";
    const RECOVERY: &str = "ed25519:GBBrXTPNg3sSXBKbpdHnRv1RwC5edoFd5j5KnkG5ffbp";
    const OP1: &str = "ed25519:6fwVD6BjbUyZ9Xq1UWCpfbnrtonRaa75a28sw7v6k2WX";
    const OP2: &str = "ed25519:65WruDfYoZ5A5dkDWcxkXjtNCfUvvbSWELPo9T38cynD";
    const OP3: &str = "ed25519:2ez7EPpss9wTAGFBTFfpejNRNtDnMiDdYX7qaEjfEpmm";
    const CURRENT: &str = "agent.fleet.testnet";
    const ADMIN_ACCOUNT: &str = "multisig.fleet.testnet";

    fn mode_a() -> Mode {
        Mode::A {
            admin_pk: ADMIN.to_string(),
            recovery_pk: RECOVERY.to_string(),
        }
    }

    fn op(pk: &str, tag: &str) -> Operator {
        Operator {
            pk: pk.to_string(),
            tag: tag.to_string(),
            active: false,
        }
    }

    fn state() -> State {
        State::init(
            mode_a(),
            CURRENT.to_string(),
            "ping".to_string(),
            8,
            vec![op(OP1, "a")],
            true,
        )
        .unwrap()
    }

    fn admin_actor() -> Actor {
        Actor {
            account: CURRENT.to_string(),
            signer_pk: ADMIN.to_string(),
        }
    }

    fn operator_actor() -> Actor {
        Actor {
            account: CURRENT.to_string(),
            signer_pk: OP1.to_string(),
        }
    }

    fn recovery_actor() -> Actor {
        Actor {
            account: CURRENT.to_string(),
            signer_pk: RECOVERY.to_string(),
        }
    }

    #[test]
    fn init_rejects_both_or_neither_mode() {
        let both = State::init(
            mode_a(),
            CURRENT.to_string(),
            "ping".to_string(),
            8,
            vec![],
            true,
        );
        assert!(both.is_ok());
        // The contract wrapper enforces the JSON mode string; the model's Mode
        // enum makes both-or-neither unrepresentable. This test records that
        // structural invariant instead of pretending a JSON parser exists here.
        assert_eq!(state().admin_mode(), "A");
    }

    #[test]
    fn init_rejects_duplicate_and_colliding_keys() {
        let dup = State::init(
            mode_a(),
            CURRENT.to_string(),
            "ping".to_string(),
            8,
            vec![op(OP1, "a"), op(OP1, "b")],
            true,
        );
        assert_eq!(dup, Err(Error::KeyCollision));
        let collide = State::init(
            mode_a(),
            CURRENT.to_string(),
            "ping".to_string(),
            8,
            vec![op(ADMIN, "a")],
            true,
        );
        assert_eq!(collide, Err(Error::KeyCollision));
    }

    #[test]
    fn freeze_blocks_operator_and_unfreeze_restores_positive_control() {
        let mut state = state();
        state.freeze(&admin_actor(), CURRENT, 1, 10).unwrap();
        assert_eq!(
            state.require_operator(&operator_actor(), CURRENT),
            Err(Error::Frozen)
        );
        state.unfreeze(&admin_actor(), CURRENT, 2, 20).unwrap();
        assert!(state.require_operator(&operator_actor(), CURRENT).is_ok());
    }

    #[test]
    fn operator_cannot_freeze_but_admin_can() {
        let mut state = state();
        assert_eq!(
            state.freeze(&operator_actor(), CURRENT, 1, 10),
            Err(Error::AdminOnly)
        );
        assert_eq!(state.audit.len(), 0);
        state.freeze(&admin_actor(), CURRENT, 2, 20).unwrap();
        assert!(state.paused);
        assert_eq!(state.audit.len(), 1);
    }

    #[test]
    fn recovery_cannot_freeze_or_grant() {
        let mut state = state();
        assert_eq!(
            state.freeze(&recovery_actor(), CURRENT, 1, 10),
            Err(Error::AdminOnly)
        );
        assert_eq!(
            state.prepare_grant(&recovery_actor(), CURRENT, OP2, "b", 2, 20),
            Err(Error::AdminOnly)
        );
    }

    #[test]
    fn revoke_tag_is_an_exact_partition() {
        let mut state = state();
        state
            .prepare_grant(&admin_actor(), CURRENT, OP2, "b", 1, 10)
            .unwrap();
        state.confirm_grant(OP2, true, 2, 20).unwrap();
        state
            .prepare_grant(&admin_actor(), CURRENT, OP3, "b", 3, 30)
            .unwrap();
        state.confirm_grant(OP3, true, 4, 40).unwrap();
        let removed = state
            .revoke_tag(&admin_actor(), CURRENT, "b", 5, 50)
            .unwrap();
        assert_eq!(removed, vec![OP2.to_string(), OP3.to_string()]);
        assert!(state.operator_for(OP1).is_some());
        assert!(state.operator_for(OP2).is_none());
        assert!(state.operator_for(OP3).is_none());
        assert!(state.require_operator(&operator_actor(), CURRENT).is_ok());
    }

    #[test]
    fn missing_tag_reverts_without_audit() {
        let mut state = state();
        let before = state.audit.len();
        assert_eq!(
            state.revoke_tag(&admin_actor(), CURRENT, "missing", 1, 10),
            Err(Error::TagMissing)
        );
        assert_eq!(state.audit.len(), before);
    }

    #[test]
    fn pending_admin_cannot_freeze_and_accept_performs_no_add() {
        let mut state = state();
        state
            .prepare_propose(&admin_actor(), CURRENT, OP2, PendingOrigin::Admin, 1, 10)
            .unwrap();
        state.confirm_propose(OP2, true, 2, 20).unwrap();
        let pending_actor = Actor {
            account: CURRENT.to_string(),
            signer_pk: OP2.to_string(),
        };
        assert_eq!(
            state.freeze(&pending_actor, CURRENT, 3, 30),
            Err(Error::AdminOnly)
        );
        let old = state.accept_admin(&pending_actor, CURRENT, 4, 40).unwrap();
        assert_eq!(old, ADMIN);
        assert_eq!(state.admin_pk(), Some(OP2));
        assert!(state.pending_admin.is_none());
        assert!(state
            .freeze(
                &Actor {
                    account: CURRENT.to_string(),
                    signer_pk: OP2.to_string()
                },
                CURRENT,
                5,
                50
            )
            .is_ok());
    }

    #[test]
    fn recovery_proposes_but_cannot_accept_itself() {
        let mut state = state();
        state
            .prepare_propose(
                &recovery_actor(),
                CURRENT,
                OP2,
                PendingOrigin::Recovery,
                1,
                10,
            )
            .unwrap();
        state.confirm_propose(OP2, true, 2, 20).unwrap();
        assert_eq!(
            state.pending_admin.as_ref().unwrap().origin,
            PendingOrigin::Recovery
        );
        assert_eq!(
            state.accept_admin(&recovery_actor(), CURRENT, 3, 30),
            Err(Error::PendingOnly)
        );
        assert!(state
            .accept_admin(
                &Actor {
                    account: CURRENT.to_string(),
                    signer_pk: OP2.to_string()
                },
                CURRENT,
                4,
                40
            )
            .is_ok());
    }

    #[test]
    fn grant_and_propose_reject_keys_that_already_have_a_role() {
        let mut state = state();
        for key in [ADMIN, RECOVERY, OP1] {
            assert_eq!(
                state.prepare_grant(&admin_actor(), CURRENT, key, "b", 1, 10),
                Err(Error::KeyCollision)
            );
            assert_eq!(
                state.prepare_propose(&admin_actor(), CURRENT, key, PendingOrigin::Admin, 2, 20),
                Err(Error::KeyCollision)
            );
        }
        assert_eq!(state.audit.len(), 0);
    }

    #[test]
    fn cancel_admin_is_allowed_for_admin_or_recovery_and_clears_pending() {
        let mut state = state();
        assert_eq!(
            state.cancel_admin(&admin_actor(), CURRENT, 1, 10),
            Err(Error::NoPending)
        );

        state
            .prepare_propose(&admin_actor(), CURRENT, OP2, PendingOrigin::Admin, 2, 20)
            .unwrap();
        state.confirm_propose(OP2, true, 3, 30).unwrap();
        assert_eq!(
            state.cancel_admin(&operator_actor(), CURRENT, 4, 40),
            Err(Error::AdminOnly)
        );
        assert_eq!(
            state.cancel_admin(&admin_actor(), CURRENT, 5, 50),
            Ok(Some(OP2.to_string()))
        );
        assert!(state.pending_admin.is_none());
        assert!(state.audit.iter().any(|e| e.action == "cancel_admin"));

        state
            .prepare_propose(
                &recovery_actor(),
                CURRENT,
                OP3,
                PendingOrigin::Recovery,
                6,
                60,
            )
            .unwrap();
        state.confirm_propose(OP3, true, 7, 70).unwrap();
        assert_eq!(
            state.cancel_admin(&recovery_actor(), CURRENT, 8, 80),
            Ok(Some(OP3.to_string()))
        );
        assert!(state.pending_admin.is_none());
    }

    #[test]
    fn rotate_is_fresh_key_first_and_keeps_old_until_confirmed() {
        let mut state = state();
        state
            .prepare_grant(&admin_actor(), CURRENT, OP3, "b", 1, 10)
            .unwrap();
        state.confirm_grant(OP3, true, 2, 20).unwrap();
        state
            .prepare_rotate(&admin_actor(), CURRENT, OP1, OP2, "a", 3, 30)
            .unwrap();
        assert!(state.operator_for(OP1).unwrap().active);
        assert!(!state.operator_for(OP2).unwrap().active);
        state.confirm_rotate(OP1, OP2, true, 4, 40).unwrap();
        assert!(state.operator_for(OP1).is_none());
        assert!(state.operator_for(OP2).unwrap().active);
        assert!(
            state.operator_for(OP3).is_some(),
            "rotation must not delete other operators"
        );
        assert!(state
            .require_operator(
                &Actor {
                    account: CURRENT.to_string(),
                    signer_pk: OP2.to_string()
                },
                CURRENT
            )
            .is_ok());
    }

    #[test]
    fn grant_failure_removes_pending_operator() {
        let mut state = state();
        state
            .prepare_grant(&admin_actor(), CURRENT, OP2, "b", 1, 10)
            .unwrap();
        state.confirm_grant(OP2, false, 2, 20).unwrap();
        assert!(state.operator_for(OP2).is_none());
        assert!(state.audit.iter().any(|e| e.action == "grant_failed"));
    }

    #[test]
    fn audit_chain_verifies_and_tamper_fails() {
        let mut state = state();
        for index in 0..5 {
            state
                .freeze(&admin_actor(), CURRENT, index, index * 10)
                .unwrap();
            state
                .unfreeze(&admin_actor(), CURRENT, index + 100, index * 10 + 1)
                .unwrap();
        }
        assert!(state.verify_audit());
        let head = state.audit_head();
        assert_eq!(head.seq, 9);
        state.audit[3].subject.push('x');
        assert!(!state.verify_audit());
        state.audit[3].subject.pop();
        assert!(state.verify_audit());
        state.audit[4].block_height += 1;
        assert!(!state.verify_audit());
        state.audit[4].block_height -= 1;
        state.audit[4].prev_hash = "0".repeat(64);
        assert!(!state.verify_audit());
        state.audit[4].prev_hash = state.audit[3].entry_hash.clone();
        assert!(state.verify_audit());
    }

    #[test]
    fn mode_b_admin_is_predecessor_only() {
        let mut state = State::init(
            Mode::B {
                admin_account: ADMIN_ACCOUNT.to_string(),
            },
            CURRENT.to_string(),
            "ping".to_string(),
            8,
            vec![op(OP1, "a")],
            true,
        )
        .unwrap();
        let wrong = Actor {
            account: CURRENT.to_string(),
            signer_pk: OP1.to_string(),
        };
        assert_eq!(state.freeze(&wrong, CURRENT, 1, 10), Err(Error::AdminOnly));
        let multisig = Actor {
            account: ADMIN_ACCOUNT.to_string(),
            signer_pk: String::new(),
        };
        state.freeze(&multisig, CURRENT, 2, 20).unwrap();
        assert!(state.paused);
        assert_eq!(state.pending_admin, None);
    }

    #[test]
    fn invalid_inputs_revert_before_state_change() {
        let mut state = state();
        let before = state.clone();
        assert!(state
            .prepare_grant(&admin_actor(), CURRENT, "not-a-key", "x", 1, 10)
            .is_err());
        assert!(state
            .prepare_grant(&admin_actor(), CURRENT, OP2, "BAD TAG", 1, 10)
            .is_err());
        assert!(state
            .prepare_grant(&admin_actor(), CURRENT, OP2, "b", 1, 10)
            .is_ok());
        state.confirm_grant(OP2, true, 2, 20).unwrap();
        assert_ne!(state.audit.len(), before.audit.len());
    }

    #[test]
    fn audit_entry_lookup_and_pagination_are_exact() {
        let mut state = state();
        for index in 0..3 {
            state.freeze(&admin_actor(), CURRENT, index, index).unwrap();
            state
                .unfreeze(&admin_actor(), CURRENT, index, index)
                .unwrap();
        }
        assert_eq!(state.audit_page(4, 2).len(), 2);
        assert_eq!(state.audit_page(4, 2)[0].seq, 4);
        assert_eq!(state.audit_entry(5).unwrap().seq, 5);
        assert!(state.audit_entry(99).is_none());
    }

    #[test]
    fn reference_model_matches_a_short_sequence() {
        let mut state = state();
        let mut reference = Reference::from_state(&state);
        state.freeze(&admin_actor(), CURRENT, 1, 10).unwrap();
        reference.paused = true;
        reference.audit_len += 1;
        reference.compare(&state).unwrap();
        state.unfreeze(&admin_actor(), CURRENT, 2, 20).unwrap();
        reference.paused = false;
        reference.audit_len += 1;
        reference.compare(&state).unwrap();
    }

    #[test]
    fn random_sequences_preserve_reference_and_audit() {
        // Differential test: the same xorshift sequences drive the
        // implementation (State) and the independent reference model
        // (reference_model.rs, written from SPEC alone). Outer loop covers
        // multiple seeded sequences; each runs 5,000 steps compared after
        // every step. Total: 3 sequences × 5,000 steps = 15,000 comparisons.
        let seeds: [u64; 3] = [0x9e3779b97f4a7c15, 0x1234567890abcdef, 0x0fedcba987654321];
        for seed0 in seeds {
            let mut seed = seed0;
            let mut next = || {
                seed ^= seed << 13;
                seed ^= seed >> 7;
                seed ^= seed << 17;
                seed
            };
            let mut state = state();
            let mut reference = Reference::from_state(&state);
            for step in 0..5_000u64 {
                match next() % 6 {
                    0 => {
                        if state.paused {
                            if state.unfreeze(&admin_actor(), CURRENT, step, step).is_ok() {
                                reference.paused = false;
                                reference.audit_len += 1;
                            }
                        } else if state.freeze(&admin_actor(), CURRENT, step, step).is_ok() {
                            reference.paused = true;
                            reference.audit_len += 1;
                        }
                    }
                    1 => {
                        let idx = (next() % 10) as u8;
                        let pk = format!("ed25519:RandomOperator{:02}1111111111111111111111", idx);
                        if state
                            .prepare_grant(&admin_actor(), CURRENT, &pk, "r", step, step)
                            .is_ok()
                        {
                            reference.audit_len += 1;
                            reference.registered.insert(pk.clone());
                            if next() % 2 == 0 {
                                state.confirm_grant(&pk, true, step, step).unwrap();
                                reference.active.insert(pk);
                            } else {
                                state.confirm_grant(&pk, false, step, step).unwrap();
                                state.operators.retain(|op| op.pk != pk);
                                reference.registered.remove(&pk);
                            }
                            reference.audit_len += 1;
                        }
                    }
                    2 => {
                        let pk = reference.active_list().into_iter().next();
                        if let Some(pk) = pk {
                            if state
                                .revoke_operator(&admin_actor(), CURRENT, &pk, step, step)
                                .is_ok()
                            {
                                reference.active.remove(&pk);
                                reference.registered.remove(&pk);
                                reference.audit_len += 1;
                            }
                        }
                    }
                    3 => {
                        if !state.paused {
                            state.freeze(&admin_actor(), CURRENT, step, step).unwrap();
                            reference.paused = true;
                            reference.audit_len += 1;
                        }
                    }
                    4 => {
                        if state.paused {
                            state.unfreeze(&admin_actor(), CURRENT, step, step).unwrap();
                            reference.paused = false;
                            reference.audit_len += 1;
                        }
                    }
                    _ => {
                        let before = state.audit.len();
                        let _ = state.revoke_tag(&admin_actor(), CURRENT, "missing", step, step);
                        assert_eq!(state.audit.len(), before);
                    }
                }
                reference.compare(&state).unwrap_or_else(|error| {
                    panic!(
                        "seed {:x} step {}: {} (audit heads: {:?})",
                        seed0,
                        step,
                        error,
                        state.audit_head()
                    )
                });
                assert!(
                    state.verify_audit(),
                    "audit broken at seed {:x} step {}",
                    seed0,
                    step
                );
            }
        }
    }
}
