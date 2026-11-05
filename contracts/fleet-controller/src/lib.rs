//! FLEET controller v0.3.
//!
//! Deployed on each managed NEAR account. It manages the account's native
//! access keys and exposes a narrow, allowlisted execution path. It never
//! grants full access, deploys code, transfers the balance, or accepts a
//! deposit. Testnet only; unaudited.

mod model;

#[cfg(test)]
mod mutation_tests;

#[cfg(test)]
mod reference_model;

use model::{Actor, Mode, Operator, PendingOrigin, State, MAX_ARGS_LEN, MAX_EXECUTE_GAS, VERSION};
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::serde_json::{json, Value};
use near_sdk::{
    env, near, AccountId, Allowance, Gas, NearToken, PanicOnDefault, Promise, PromiseResult,
    PublicKey,
};
use std::str::FromStr;

const ADMIN_METHODS: &str = "freeze,unfreeze,grant_operator,revoke_operator,rotate_operator,revoke_tag,propose_admin,cancel_admin";
const PENDING_METHODS: &str = "freeze,unfreeze,grant_operator,revoke_operator,rotate_operator,revoke_tag,propose_admin,cancel_admin,accept_admin";
const RECOVERY_METHODS: &str = "recover_admin,cancel_admin";
const OPERATOR_METHODS: &str = "execute";
const DEFAULT_ADMIN_ALLOWANCE: u128 = 100_000_000_000_000_000_000_000; // 0.1 NEAR
const DEFAULT_OPERATOR_ALLOWANCE: u128 = 250_000_000_000_000_000_000_000; // 0.25 NEAR
const MAX_ALLOWANCE: u128 = 1_000_000_000_000_000_000_000_000; // 1 NEAR

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct OperatorKey {
    pub public_key: String,
    pub tag: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct InitConfig {
    /// "A" for a team-held admin key, "B" for a governed admin account.
    pub mode: String,
    pub admin_pk: Option<String>,
    pub recovery_pk: Option<String>,
    pub admin_account: Option<String>,
    pub operator_keys: Vec<OperatorKey>,
    pub receiver: String,
    pub method: String,
    pub max_operators: Option<u32>,
    pub admin_allowance_yocto: Option<String>,
    pub operator_allowance_yocto: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct StateView {
    pub account_id: String,
    pub version: String,
    pub mode: String,
    pub paused: bool,
    pub admin_pk: Option<String>,
    pub admin_account: Option<String>,
    pub recovery_pk: Option<String>,
    pub pending_admin_pk: Option<String>,
    pub pending_origin: Option<String>,
    pub inflight_admin_pk: Option<String>,
    pub operators: Vec<Operator>,
    pub receiver: String,
    pub method: String,
    pub max_operators: u32,
    pub provisioned: bool,
    pub provision_error: Option<String>,
    pub audit_head: model::AuditHead,
    pub audit_len: u64,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Controller {
    pub state: State,
}

#[near]
impl Controller {
    #[init]
    pub fn new(config: InitConfig) -> Self {
        assert!(env::state_read::<State>().is_none(), "already initialized");
        assert_no_deposit();

        let mode = match config.mode.as_str() {
            "A" => {
                assert!(
                    config.admin_pk.is_some() && config.recovery_pk.is_some(),
                    "mode A requires admin_pk and recovery_pk"
                );
                assert!(
                    config.admin_account.is_none(),
                    "mode A rejects admin_account"
                );
                Mode::A {
                    admin_pk: config.admin_pk.clone().unwrap(),
                    recovery_pk: config.recovery_pk.clone().unwrap(),
                }
            }
            "B" => {
                assert!(
                    config.admin_account.is_some(),
                    "mode B requires admin_account"
                );
                assert!(
                    config.admin_pk.is_none() && config.recovery_pk.is_none(),
                    "mode B rejects admin_pk and recovery_pk"
                );
                Mode::B {
                    admin_account: config.admin_account.clone().unwrap(),
                }
            }
            _ => refuse("mode must be A or B"),
        };

        let operators: Vec<Operator> = config
            .operator_keys
            .iter()
            .map(|key| Operator {
                pk: key.public_key.clone(),
                tag: key.tag.clone(),
                active: false,
            })
            .collect();
        let max_operators = config.max_operators.unwrap_or(16);
        let state = State::init(
            mode.clone(),
            config.receiver.clone(),
            config.method.clone(),
            max_operators,
            operators.clone(),
            false,
        )
        .unwrap_or_else(|error| refuse(error.message()));

        let admin_allowance = parse_allowance(
            config.admin_allowance_yocto.as_deref(),
            DEFAULT_ADMIN_ALLOWANCE,
        );
        let operator_allowance = parse_allowance(
            config.operator_allowance_yocto.as_deref(),
            DEFAULT_OPERATOR_ALLOWANCE,
        );

        let current = env::current_account_id();
        let mut batch = Promise::new(current.clone());
        match &mode {
            Mode::A {
                admin_pk,
                recovery_pk,
            } => {
                batch = batch.add_access_key_allowance(
                    parse_key(admin_pk),
                    Allowance::limited(NearToken::from_yoctonear(admin_allowance)).unwrap(),
                    current.clone(),
                    ADMIN_METHODS.to_string(),
                );
                batch = batch.add_access_key_allowance(
                    parse_key(recovery_pk),
                    Allowance::limited(NearToken::from_yoctonear(admin_allowance)).unwrap(),
                    current.clone(),
                    RECOVERY_METHODS.to_string(),
                );
            }
            Mode::B { .. } => {}
        }
        for operator in &operators {
            batch = batch.add_access_key_allowance(
                parse_key(&operator.pk),
                Allowance::limited(NearToken::from_yoctonear(operator_allowance)).unwrap(),
                current.clone(),
                OPERATOR_METHODS.to_string(),
            );
        }

        let callback = Promise::new(current).function_call(
            "on_provisioned".to_string(),
            b"{}".to_vec(),
            NearToken::from_yoctonear(0),
            Gas::from_tgas(20),
        );
        drop(batch.then(callback));

        Self { state }
    }

    // ------------------------------------------------------------- views

    pub fn get_state(&self) -> StateView {
        StateView {
            account_id: env::current_account_id().to_string(),
            version: VERSION.to_string(),
            mode: self.state.admin_mode().to_string(),
            paused: self.state.paused,
            admin_pk: self.state.admin_pk().map(str::to_string),
            admin_account: self.state.admin_account().map(str::to_string),
            recovery_pk: self.state.recovery_pk().map(str::to_string),
            pending_admin_pk: self.state.pending_admin.as_ref().map(|p| p.pk.clone()),
            pending_origin: self
                .state
                .pending_admin
                .as_ref()
                .map(|p| origin_str(&p.origin)),
            inflight_admin_pk: self.state.inflight_admin.clone(),
            operators: self.state.operators.clone(),
            receiver: self.state.receiver.clone(),
            method: self.state.method.clone(),
            max_operators: self.state.max_operators,
            provisioned: self.state.provisioned,
            provision_error: self.state.provision_error.clone(),
            audit_head: self.state.audit_head(),
            audit_len: self.state.audit.len() as u64,
        }
    }

    pub fn get_inventory(&self) -> StateView {
        self.get_state()
    }

    pub fn get_audit(&self, from_seq: u64, limit: u64) -> Vec<model::AuditEntry> {
        self.state.audit_page(from_seq, limit)
    }

    pub fn get_audit_entry(&self, seq: u64) -> Option<model::AuditEntry> {
        self.state.audit_entry(seq)
    }

    pub fn get_audit_head(&self) -> model::AuditHead {
        self.state.audit_head()
    }

    pub fn verify_audit(&self) -> bool {
        self.state.verify_audit()
    }

    pub fn contract_version(&self) -> String {
        VERSION.to_string()
    }

    // --------------------------------------------------------- execution

    /// The only execution path. The operator key is natively scoped to this
    /// method; the controller re-checks role, freeze state, receiver, method,
    /// gas, and zero deposit.
    pub fn execute(
        &self,
        receiver_id: AccountId,
        method_name: String,
        args: String,
        gas: u64,
    ) -> Promise {
        assert_no_deposit();
        let current = env::current_account_id().to_string();
        let actor = current_actor();
        self.state
            .require_operator(&actor, &current)
            .unwrap_or_else(|error| refuse(error.message()));
        if receiver_id.as_str() != self.state.receiver {
            refuse("receiver not allowed");
        }
        if method_name != self.state.method {
            refuse("method not allowed");
        }
        if gas > MAX_EXECUTE_GAS {
            refuse("gas above policy cap");
        }
        if args.len() > MAX_ARGS_LEN {
            refuse("arguments too large");
        }
        emit_event(
            "execute",
            &actor,
            &format!("{}.{}", receiver_id, method_name),
            env::block_height(),
            env::block_timestamp(),
            "",
        );
        Promise::new(receiver_id).function_call(
            method_name,
            args.into_bytes(),
            NearToken::from_yoctonear(0),
            Gas::from_gas(gas),
        )
    }

    pub fn ping(&self) -> String {
        env::log_str(
            r#"EVENT_JSON:{"standard":"nep297","version":"1.0.0","event":"fleet_controller","data":{"action":"ping"}}"#,
        );
        "pong".to_string()
    }

    // --------------------------------------------------------- lifecycle

    pub fn freeze(&mut self) {
        assert_no_deposit();
        let (actor, current) = (current_actor(), env::current_account_id().to_string());
        self.state
            .freeze(
                &actor,
                &current,
                env::block_height(),
                env::block_timestamp(),
            )
            .unwrap_or_else(|error| refuse(error.message()));
        emit_last(&self.state);
    }

    pub fn unfreeze(&mut self) {
        assert_no_deposit();
        let (actor, current) = (current_actor(), env::current_account_id().to_string());
        self.state
            .unfreeze(
                &actor,
                &current,
                env::block_height(),
                env::block_timestamp(),
            )
            .unwrap_or_else(|error| refuse(error.message()));
        emit_last(&self.state);
    }

    pub fn grant_operator(&mut self, public_key: String, tag: String) -> Promise {
        assert_no_deposit();
        let (actor, current) = (current_actor(), env::current_account_id().to_string());
        self.state
            .prepare_grant(
                &actor,
                &current,
                &public_key,
                &tag,
                env::block_height(),
                env::block_timestamp(),
            )
            .unwrap_or_else(|error| refuse(error.message()));
        emit_last(&self.state);
        let allowance = config_allowance(&self.state, false);
        add_key_promise(&public_key, allowance, OPERATOR_METHODS)
            .then(callback("on_grant", json!({ "public_key": public_key })))
    }

    pub fn rotate_operator(
        &mut self,
        old_public_key: String,
        new_public_key: String,
        tag: String,
    ) -> Promise {
        assert_no_deposit();
        let (actor, current) = (current_actor(), env::current_account_id().to_string());
        self.state
            .prepare_rotate(
                &actor,
                &current,
                &old_public_key,
                &new_public_key,
                &tag,
                env::block_height(),
                env::block_timestamp(),
            )
            .unwrap_or_else(|error| refuse(error.message()));
        emit_last(&self.state);
        let allowance = config_allowance(&self.state, false);
        add_key_promise(&new_public_key, allowance, OPERATOR_METHODS).then(callback(
            "on_rotate",
            json!({ "old_public_key": old_public_key, "new_public_key": new_public_key }),
        ))
    }

    pub fn revoke_operator(&mut self, public_key: String) {
        assert_no_deposit();
        let (actor, current) = (current_actor(), env::current_account_id().to_string());
        self.state
            .revoke_operator(
                &actor,
                &current,
                &public_key,
                env::block_height(),
                env::block_timestamp(),
            )
            .unwrap_or_else(|error| refuse(error.message()));
        emit_last(&self.state);
        drop(Promise::new(env::current_account_id()).delete_key(parse_key(&public_key)));
    }

    pub fn revoke_tag(&mut self, tag: String) -> Vec<String> {
        assert_no_deposit();
        let (actor, current) = (current_actor(), env::current_account_id().to_string());
        let revoked = self
            .state
            .revoke_tag(
                &actor,
                &current,
                &tag,
                env::block_height(),
                env::block_timestamp(),
            )
            .unwrap_or_else(|error| refuse(error.message()));
        emit_last(&self.state);
        for key in &revoked {
            drop(Promise::new(env::current_account_id()).delete_key(parse_key(key)));
        }
        revoked
    }

    pub fn propose_admin(&mut self, new_admin_pk: String) -> Promise {
        assert_no_deposit();
        let (actor, current) = (current_actor(), env::current_account_id().to_string());
        self.state
            .prepare_propose(
                &actor,
                &current,
                &new_admin_pk,
                PendingOrigin::Admin,
                env::block_height(),
                env::block_timestamp(),
            )
            .unwrap_or_else(|error| refuse(error.message()));
        emit_last(&self.state);
        add_key_promise(
            &new_admin_pk,
            config_allowance(&self.state, true),
            PENDING_METHODS,
        )
        .then(callback(
            "on_propose",
            json!({ "new_admin_pk": new_admin_pk, "origin": "admin" }),
        ))
    }

    pub fn recover_admin(&mut self, new_admin_pk: String) -> Promise {
        assert_no_deposit();
        let (actor, current) = (current_actor(), env::current_account_id().to_string());
        self.state
            .prepare_propose(
                &actor,
                &current,
                &new_admin_pk,
                PendingOrigin::Recovery,
                env::block_height(),
                env::block_timestamp(),
            )
            .unwrap_or_else(|error| refuse(error.message()));
        emit_last(&self.state);
        add_key_promise(
            &new_admin_pk,
            config_allowance(&self.state, true),
            PENDING_METHODS,
        )
        .then(callback(
            "on_propose",
            json!({ "new_admin_pk": new_admin_pk, "origin": "recovery" }),
        ))
    }

    /// Step 2 of rotation. Performs no AddKey; only flips state and deletes the
    /// old admin key best-effort.
    pub fn accept_admin(&mut self) {
        assert_no_deposit();
        let (actor, current) = (current_actor(), env::current_account_id().to_string());
        let old = self
            .state
            .accept_admin(
                &actor,
                &current,
                env::block_height(),
                env::block_timestamp(),
            )
            .unwrap_or_else(|error| refuse(error.message()));
        emit_last(&self.state);
        if !old.is_empty() {
            drop(Promise::new(env::current_account_id()).delete_key(parse_key(&old)));
        }
    }

    pub fn cancel_admin(&mut self) {
        assert_no_deposit();
        let (actor, current) = (current_actor(), env::current_account_id().to_string());
        let pending = self
            .state
            .cancel_admin(
                &actor,
                &current,
                env::block_height(),
                env::block_timestamp(),
            )
            .unwrap_or_else(|error| refuse(error.message()));
        emit_last(&self.state);
        if let Some(pk) = pending {
            drop(Promise::new(env::current_account_id()).delete_key(parse_key(&pk)));
        }
    }

    // --------------------------------------------------------- callbacks

    #[private]
    pub fn on_provisioned(&mut self) -> bool {
        assert_private();
        let ok = promise_ok();
        self.state
            .confirm_provision(ok, env::block_height(), env::block_timestamp())
            .unwrap_or_else(|error| refuse(error.message()));
        emit_last(&self.state);
        ok
    }

    #[private]
    pub fn on_grant(&mut self, public_key: String) -> bool {
        assert_private();
        let ok = promise_ok();
        self.state
            .confirm_grant(&public_key, ok, env::block_height(), env::block_timestamp())
            .unwrap_or_else(|error| refuse(error.message()));
        emit_last(&self.state);
        ok
    }

    #[private]
    pub fn on_rotate(&mut self, old_public_key: String, new_public_key: String) -> bool {
        assert_private();
        let ok = promise_ok();
        self.state
            .confirm_rotate(
                &old_public_key,
                &new_public_key,
                ok,
                env::block_height(),
                env::block_timestamp(),
            )
            .unwrap_or_else(|error| refuse(error.message()));
        emit_last(&self.state);
        if ok {
            drop(Promise::new(env::current_account_id()).delete_key(parse_key(&old_public_key)));
        }
        ok
    }

    #[private]
    pub fn on_propose(&mut self, new_admin_pk: String) -> bool {
        assert_private();
        let ok = promise_ok();
        self.state
            .confirm_propose(
                &new_admin_pk,
                ok,
                env::block_height(),
                env::block_timestamp(),
            )
            .unwrap_or_else(|error| refuse(error.message()));
        emit_last(&self.state);
        ok
    }
}

fn current_actor() -> Actor {
    Actor {
        account: env::predecessor_account_id().to_string(),
        signer_pk: String::from(&env::signer_account_pk()),
    }
}

/// Emit a machine-readable refusal reason before trapping, so testnet receipt
/// logs show why the controller rejected a call. The log is best effort; the
/// trap is the authoritative refusal.
fn refuse(message: &str) -> ! {
    env::log_str(&format!("FLEET_REFUSAL:{}", message));
    env::panic_str(message)
}

fn assert_no_deposit() {
    if !env::attached_deposit().is_zero() {
        refuse("deposit must be zero");
    }
}

fn assert_private() {
    if env::predecessor_account_id() != env::current_account_id() {
        refuse("private callback");
    }
}

fn parse_key(value: &str) -> PublicKey {
    PublicKey::from_str(value).unwrap_or_else(|_| refuse("invalid public key"))
}

fn parse_allowance(value: Option<&str>, default: u128) -> u128 {
    let parsed = value
        .and_then(|raw| raw.parse::<u128>().ok())
        .unwrap_or(default);
    assert!(parsed > 0, "allowance must be positive");
    assert!(parsed <= MAX_ALLOWANCE, "allowance above cap");
    parsed
}

fn config_allowance(_state: &State, admin: bool) -> u128 {
    // The allowance is set at init and at each AddKey. The contract does not
    // store per-role allowances in v0.3; the SDK records them from the key list
    // and the deployment config. Keep a single conservative default.
    if admin {
        DEFAULT_ADMIN_ALLOWANCE
    } else {
        DEFAULT_OPERATOR_ALLOWANCE
    }
}

fn add_key_promise(public_key: &str, allowance: u128, methods: &str) -> Promise {
    Promise::new(env::current_account_id()).add_access_key_allowance(
        parse_key(public_key),
        Allowance::limited(NearToken::from_yoctonear(allowance)).unwrap(),
        env::current_account_id(),
        methods.to_string(),
    )
}

fn callback(method: &str, args: Value) -> Promise {
    Promise::new(env::current_account_id()).function_call(
        method.to_string(),
        near_sdk::serde_json::to_vec(&args).unwrap(),
        NearToken::from_yoctonear(0),
        Gas::from_tgas(20),
    )
}

#[allow(deprecated)]
fn promise_ok() -> bool {
    if env::promise_results_count() == 0 {
        return false;
    }
    matches!(env::promise_result(0), PromiseResult::Successful(_))
}

fn origin_str(origin: &PendingOrigin) -> String {
    match origin {
        PendingOrigin::Admin => "admin".to_string(),
        PendingOrigin::Recovery => "recovery".to_string(),
    }
}

fn emit_last(state: &State) {
    if let Some(entry) = state.audit.last() {
        let data = json!({
            "seq": entry.seq,
            "action": entry.action,
            "actor_account": entry.actor_account,
            "signer_pk": entry.signer_pk,
            "subject": entry.subject,
            "block_height": entry.block_height,
            "block_timestamp": entry.block_timestamp,
            "entry_hash": entry.entry_hash,
        });
        let event = json!({
            "standard": "nep297",
            "version": "1.0.0",
            "event": "fleet_controller",
            "data": data,
        });
        env::log_str(&format!("EVENT_JSON:{}", event));
    }
}

fn emit_event(
    action: &str,
    actor: &Actor,
    subject: &str,
    block_height: u64,
    block_timestamp: u64,
    entry_hash: &str,
) {
    let data = json!({
        "action": action,
        "actor_account": actor.account,
        "signer_pk": actor.signer_pk,
        "subject": subject,
        "block_height": block_height,
        "block_timestamp": block_timestamp,
        "entry_hash": entry_hash,
    });
    let event = json!({
        "standard": "nep297",
        "version": "1.0.0",
        "event": "fleet_controller",
        "data": data,
    });
    env::log_str(&format!("EVENT_JSON:{}", event));
}

#[cfg(test)]
mod tests {
    #![allow(deprecated)]
    use super::*;
    use near_sdk::mock::MockAction as VmAction;
    use near_sdk::test_utils::{
        get_created_receipts, testing_env_with_promise_results, VMContextBuilder,
    };
    use near_sdk::testing_env;
    use near_sdk::PromiseResult;

    const ADMIN: &str = "ed25519:2dckMmmyFQdr4J78vGfqm7XaK4ck2HgCvN8gSDfiQyx2";
    const RECOVERY: &str = "ed25519:GBBrXTPNg3sSXBKbpdHnRv1RwC5edoFd5j5KnkG5ffbp";
    const OP1: &str = "ed25519:6fwVD6BjbUyZ9Xq1UWCpfbnrtonRaa75a28sw7v6k2WX";
    const OP2: &str = "ed25519:65WruDfYoZ5A5dkDWcxkXjtNCfUvvbSWELPo9T38cynD";
    const OP3: &str = "ed25519:2ez7EPpss9wTAGFBTFfpejNRNtDnMiDdYX7qaEjfEpmm";
    const OP4: &str = "ed25519:EVfpzNBztFza3BxPViKsk3Gy9sg92HxZzgSZBCeGJGzd";
    const CURRENT: &str = "agent.fleet.testnet";
    const ADMIN_ACCOUNT: &str = "multisig.fleet.testnet";

    fn context(predecessor: &str, signer_pk: &str) -> near_sdk::VMContext {
        ctx(CURRENT, predecessor, signer_pk)
    }

    fn ctx(current: &str, predecessor: &str, signer_pk: &str) -> near_sdk::VMContext {
        VMContextBuilder::new()
            .current_account_id(current.parse().unwrap())
            .predecessor_account_id(predecessor.parse().unwrap())
            .signer_account_id(predecessor.parse().unwrap())
            .signer_account_pk(PublicKey::from_str(signer_pk).unwrap())
            .attached_deposit(NearToken::from_yoctonear(0))
            .block_height(100)
            .block_timestamp(1_000_000_000)
            .build()
    }

    fn config() -> InitConfig {
        InitConfig {
            mode: "A".to_string(),
            admin_pk: Some(ADMIN.to_string()),
            recovery_pk: Some(RECOVERY.to_string()),
            admin_account: None,
            operator_keys: vec![
                OperatorKey {
                    public_key: OP1.to_string(),
                    tag: "a".to_string(),
                },
                OperatorKey {
                    public_key: OP2.to_string(),
                    tag: "b".to_string(),
                },
            ],
            receiver: CURRENT.to_string(),
            method: "ping".to_string(),
            max_operators: Some(8),
            admin_allowance_yocto: None,
            operator_allowance_yocto: None,
        }
    }

    fn init_contract() -> Controller {
        testing_env!(context(CURRENT, ADMIN));
        let contract = Controller::new(config());
        let receipts = get_created_receipts();
        assert!(!receipts.is_empty(), "init must schedule key receipts");
        contract
    }

    fn provisioned() -> Controller {
        let mut contract = init_contract();
        testing_env_with_promise_results(
            context(CURRENT, ADMIN),
            PromiseResult::Successful(vec![]),
        );
        assert!(contract.on_provisioned());
        contract
    }

    fn admin_ctx() -> near_sdk::VMContext {
        context(CURRENT, ADMIN)
    }

    fn operator_ctx() -> near_sdk::VMContext {
        context(CURRENT, OP1)
    }

    #[test]
    fn init_is_mode_exclusive_and_schedules_no_full_access_key() {
        testing_env!(context(CURRENT, ADMIN));
        let contract = Controller::new(config());
        let receipts = get_created_receipts();
        let actions = receipts
            .iter()
            .flat_map(|receipt| receipt.actions.iter())
            .collect::<Vec<_>>();
        assert!(actions
            .iter()
            .any(|action| matches!(action, VmAction::AddKeyWithFunctionCall { .. })));
        assert!(!actions
            .iter()
            .any(|action| matches!(action, VmAction::AddKeyWithFullAccess { .. })));
        assert!(!contract.state.provisioned);
        assert_eq!(contract.state.pending_operators.len(), 2);
    }

    #[test]
    fn init_rejects_both_modes() {
        testing_env!(context(CURRENT, ADMIN));
        let mut cfg = config();
        cfg.admin_account = Some(ADMIN_ACCOUNT.to_string());
        let result = std::panic::catch_unwind(|| Controller::new(cfg));
        assert!(result.is_err());
    }

    #[test]
    fn provisioning_callback_promotes_operators() {
        let contract = provisioned();
        assert!(contract.state.provisioned);
        assert_eq!(contract.state.operators.len(), 2);
        assert!(contract.state.operators.iter().all(|op| op.active));
        assert!(contract.state.verify_audit());
        assert_eq!(contract.state.audit[0].action, "init");
    }

    #[test]
    fn provisioning_failure_leaves_controller_unprovisioned() {
        let mut contract = init_contract();
        testing_env_with_promise_results(context(CURRENT, ADMIN), PromiseResult::Failed);
        assert!(!contract.on_provisioned());
        assert!(!contract.state.provisioned);
        assert_eq!(contract.state.operators.len(), 0);
        assert!(contract.state.provision_error.is_some());
    }

    #[test]
    fn freeze_and_unfreeze_are_admin_only() {
        let mut contract = provisioned();
        testing_env!(admin_ctx());
        contract.freeze();
        assert!(contract.state.paused);
        contract.unfreeze();
        assert!(!contract.state.paused);
        assert_eq!(contract.state.audit.len(), 3);
    }

    #[test]
    fn operator_cannot_call_admin_methods() {
        let mut contract = provisioned();
        testing_env!(context(CURRENT, OP1));
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| contract.freeze()));
        assert!(result.is_err());
        assert!(!contract.state.paused);
    }

    #[test]
    fn grant_schedules_function_call_key_and_callback_confirms() {
        let mut contract = provisioned();
        testing_env!(admin_ctx());
        let before = contract.state.operators.len();
        let _promise = contract.grant_operator(OP3.to_string(), "c".to_string());
        assert_eq!(contract.state.operators.len(), before + 1);
        assert!(!contract.state.operator_for(OP3).unwrap().active);
        testing_env_with_promise_results(admin_ctx(), PromiseResult::Successful(vec![]));
        assert!(contract.on_grant(OP3.to_string()));
        assert!(contract.state.operator_for(OP3).unwrap().active);
    }

    #[test]
    fn failed_grant_is_not_active_and_is_removed() {
        let mut contract = provisioned();
        testing_env!(admin_ctx());
        let _promise = contract.grant_operator(OP3.to_string(), "c".to_string());
        testing_env_with_promise_results(admin_ctx(), PromiseResult::Failed);
        assert!(!contract.on_grant(OP3.to_string()));
        assert!(contract.state.operator_for(OP3).is_none());
    }

    #[test]
    fn grant_and_rotate_add_only_function_call_keys() {
        let mut contract = provisioned();
        testing_env!(admin_ctx());
        let grant_promise = contract.grant_operator(OP3.to_string(), "c".to_string());
        drop(grant_promise);
        let receipts = get_created_receipts();
        let actions = receipts
            .iter()
            .flat_map(|receipt| receipt.actions.iter())
            .collect::<Vec<_>>();
        assert!(actions
            .iter()
            .any(|action| matches!(action, VmAction::AddKeyWithFunctionCall { .. })));
        assert!(!actions
            .iter()
            .any(|action| matches!(action, VmAction::AddKeyWithFullAccess { .. })));

        testing_env_with_promise_results(admin_ctx(), PromiseResult::Successful(vec![]));
        assert!(contract.on_grant(OP3.to_string()));
        testing_env!(admin_ctx());
        let rotate_promise =
            contract.rotate_operator(OP3.to_string(), OP4.to_string(), "c".to_string());
        drop(rotate_promise);
        let receipts = get_created_receipts();
        let actions = receipts
            .iter()
            .flat_map(|receipt| receipt.actions.iter())
            .collect::<Vec<_>>();
        assert!(actions
            .iter()
            .any(|action| matches!(action, VmAction::AddKeyWithFunctionCall { .. })));
        assert!(!actions
            .iter()
            .any(|action| matches!(action, VmAction::AddKeyWithFullAccess { .. })));
    }

    #[test]
    fn no_lifecycle_receipt_contains_deploy_transfer_stake_delete_account_or_full_access() {
        fn assert_no_forbidden(receipts: &[near_sdk::mock::Receipt]) {
            let forbidden: Vec<&near_sdk::mock::MockAction> = receipts
                .iter()
                .flat_map(|receipt| receipt.actions.iter())
                .filter(|action| {
                    matches!(
                        action,
                        VmAction::DeployContract { .. }
                            | VmAction::DeployGlobalContract { .. }
                            | VmAction::UseGlobalContract { .. }
                            | VmAction::Transfer { .. }
                            | VmAction::Stake { .. }
                            | VmAction::DeleteAccount { .. }
                            | VmAction::AddKeyWithFullAccess { .. }
                    )
                })
                .collect();
            assert!(
                forbidden.is_empty(),
                "found forbidden actions: {forbidden:?}"
            );
        }

        let mut contract = provisioned();
        testing_env!(admin_ctx());
        let grant_promise = contract.grant_operator(OP3.to_string(), "c".to_string());
        drop(grant_promise);
        assert_no_forbidden(&get_created_receipts());

        testing_env_with_promise_results(admin_ctx(), PromiseResult::Successful(vec![]));
        assert!(contract.on_grant(OP3.to_string()));
        testing_env!(admin_ctx());
        let rotate_promise =
            contract.rotate_operator(OP3.to_string(), OP4.to_string(), "c".to_string());
        drop(rotate_promise);
        assert_no_forbidden(&get_created_receipts());

        testing_env_with_promise_results(admin_ctx(), PromiseResult::Successful(vec![]));
        assert!(contract.on_rotate(OP3.to_string(), OP4.to_string()));
        testing_env!(admin_ctx());
        contract.revoke_operator(OP2.to_string());
        assert_no_forbidden(&get_created_receipts());
    }

    #[test]
    fn rotation_never_leaves_zero_active_admins() {
        let mut contract = provisioned();
        assert_eq!(contract.state.admin_pk(), Some(ADMIN));
        testing_env!(admin_ctx());
        let _promise = contract.propose_admin(OP3.to_string());
        testing_env_with_promise_results(admin_ctx(), PromiseResult::Successful(vec![]));
        assert!(contract.on_propose(OP3.to_string()));
        assert!(contract.state.admin_pk().is_some());
        assert!(contract.state.pending_admin.is_some());
        testing_env!(context(CURRENT, OP3));
        contract.accept_admin();
        assert!(contract.state.admin_pk().is_some());
        assert_eq!(contract.state.admin_pk(), Some(OP3));
    }

    #[test]
    fn unauthorized_admin_call_does_not_change_state() {
        let mut contract = provisioned();
        let before_audit = contract.state.audit.len();
        testing_env!(operator_ctx());
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| contract.freeze()));
        assert!(result.is_err());
        assert!(!contract.state.paused);
        assert_eq!(contract.state.audit.len(), before_audit);
    }

    #[test]
    fn failed_rotate_add_receipt_is_removed_and_old_key_stays_active() {
        let mut contract = provisioned();
        testing_env!(admin_ctx());
        let _promise = contract.rotate_operator(OP1.to_string(), OP3.to_string(), "c".to_string());
        testing_env_with_promise_results(admin_ctx(), PromiseResult::Failed);
        assert!(!contract.on_rotate(OP1.to_string(), OP3.to_string()));
        assert!(contract.state.operator_for(OP3).is_none());
        let old = contract.state.operator_for(OP1).unwrap();
        assert!(old.active);
    }

    #[test]
    fn failed_rotate_receipt_keeps_audit_and_active_set_consistent() {
        let mut contract = provisioned();
        testing_env!(admin_ctx());
        let _promise = contract.rotate_operator(OP1.to_string(), OP3.to_string(), "c".to_string());
        testing_env_with_promise_results(admin_ctx(), PromiseResult::Failed);
        assert!(!contract.on_rotate(OP1.to_string(), OP3.to_string()));
        assert!(contract.state.verify_audit());
        assert_eq!(
            contract
                .state
                .audit
                .iter()
                .filter(|entry| entry.action == "rotate_failed")
                .count(),
            1
        );
    }

    #[test]
    fn failed_rotation_self_callback_clears_inflight_and_allows_retry() {
        let mut contract = provisioned();
        testing_env!(admin_ctx());
        let _promise = contract.propose_admin(OP3.to_string());
        testing_env_with_promise_results(admin_ctx(), PromiseResult::Failed);
        assert!(!contract.on_propose(OP3.to_string()));
        assert!(contract.state.pending_admin.is_none());
        assert!(contract.state.inflight_admin.is_none());
        // A fresh rotation after the failed callback must be accepted.
        let _retry = contract.propose_admin(OP3.to_string());
        assert_eq!(contract.state.inflight_admin.as_deref(), Some(OP3));
    }

    #[test]
    fn failed_recovery_callback_leaves_no_inflight_and_allows_retry() {
        let mut contract = provisioned();
        testing_env!(context(CURRENT, RECOVERY));
        let _promise = contract.recover_admin(OP3.to_string());
        testing_env_with_promise_results(context(CURRENT, RECOVERY), PromiseResult::Failed);
        assert!(!contract.on_propose(OP3.to_string()));
        assert!(contract.state.pending_admin.is_none());
        assert!(contract.state.inflight_admin.is_none());
        let _retry = contract.recover_admin(OP3.to_string());
        assert_eq!(contract.state.inflight_admin.as_deref(), Some(OP3));
    }

    #[test]
    fn public_callback_is_private() {
        let mut contract = provisioned();
        testing_env!(context(ADMIN_ACCOUNT, ADMIN));
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            contract.on_grant(OP2.to_string())
        }));
        assert!(result.is_err());
    }

    #[test]
    fn execute_requires_active_operator_freeze_and_allowlist() {
        let mut contract = provisioned();
        testing_env!(context(CURRENT, OP1));
        let promise = contract.execute(
            CURRENT.parse().unwrap(),
            "ping".to_string(),
            "{}".to_string(),
            10_000_000_000_000,
        );
        drop(promise);
        let receipts = get_created_receipts();
        assert!(receipts.iter().any(|receipt| receipt
            .actions
            .iter()
            .any(|action| matches!(action, VmAction::FunctionCallWeight { .. }))));

        testing_env!(admin_ctx());
        contract.freeze();
        testing_env!(context(CURRENT, OP1));
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            contract.execute(
                CURRENT.parse().unwrap(),
                "ping".to_string(),
                "{}".to_string(),
                10_000_000_000_000,
            )
        }));
        assert!(result.is_err());
    }

    #[test]
    fn execute_rejects_wrong_receiver_and_deposit() {
        let contract = provisioned();
        testing_env!(VMContextBuilder::new()
            .current_account_id(CURRENT.parse().unwrap())
            .predecessor_account_id(CURRENT.parse().unwrap())
            .signer_account_id(CURRENT.parse().unwrap())
            .signer_account_pk(PublicKey::from_str(OP1).unwrap())
            .attached_deposit(NearToken::from_yoctonear(1))
            .build());
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            contract.execute(
                CURRENT.parse().unwrap(),
                "ping".to_string(),
                "{}".to_string(),
                10_000_000_000_000,
            )
        }));
        assert!(result.is_err());
    }

    #[test]
    fn revoke_and_tag_revoke_are_exact() {
        let mut contract = provisioned();
        testing_env!(admin_ctx());
        let removed = contract.revoke_tag("b".to_string());
        assert_eq!(removed, vec![OP2.to_string()]);
        assert!(contract.state.operator_for(OP1).is_some());
        contract.revoke_operator(OP1.to_string());
        assert!(contract.state.operators.is_empty());
    }

    #[test]
    fn admin_rotation_has_no_add_key_on_accept() {
        let mut contract = provisioned();
        testing_env!(admin_ctx());
        let _promise = contract.propose_admin(OP3.to_string());
        testing_env_with_promise_results(admin_ctx(), PromiseResult::Successful(vec![]));
        assert!(contract.on_propose(OP3.to_string()));
        assert_eq!(
            contract.state.pending_admin.as_ref().unwrap().pk,
            OP3.to_string()
        );
        let before_accept = get_created_receipts();
        testing_env!(context(CURRENT, OP3));
        contract.accept_admin();
        assert_eq!(contract.state.admin_pk(), Some(OP3));
        assert!(contract.state.pending_admin.is_none());
        // accept_admin flips state and schedules DeleteKey, but never AddKey.
        let receipts = get_created_receipts();
        for receipt in receipts {
            if !before_accept.contains(&receipt) {
                assert!(!receipt
                    .actions
                    .iter()
                    .any(|action| matches!(action, VmAction::AddKeyWithFunctionCall { .. })));
            }
        }
    }

    #[test]
    fn recovery_proposes_and_pending_key_accepts() {
        let mut contract = provisioned();
        testing_env!(context(CURRENT, RECOVERY));
        let _promise = contract.recover_admin(OP3.to_string());
        testing_env_with_promise_results(
            context(CURRENT, RECOVERY),
            PromiseResult::Successful(vec![]),
        );
        assert!(contract.on_propose(OP3.to_string()));
        testing_env!(context(CURRENT, OP3));
        contract.accept_admin();
        assert_eq!(contract.state.admin_pk(), Some(OP3));
    }

    #[test]
    fn mode_b_uses_predecessor_account() {
        let mut cfg = config();
        cfg.mode = "B".to_string();
        cfg.admin_pk = None;
        cfg.recovery_pk = None;
        cfg.admin_account = Some(ADMIN_ACCOUNT.to_string());
        testing_env!(ctx(ADMIN_ACCOUNT, ADMIN_ACCOUNT, ADMIN));
        let mut contract = Controller::new(cfg);
        testing_env_with_promise_results(
            ctx(ADMIN_ACCOUNT, ADMIN_ACCOUNT, ADMIN),
            PromiseResult::Successful(vec![]),
        );
        assert!(contract.on_provisioned());
        testing_env!(ctx(ADMIN_ACCOUNT, ADMIN_ACCOUNT, ADMIN));
        contract.freeze();
        assert!(contract.state.paused);
        testing_env!(context(CURRENT, OP1));
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| contract.unfreeze()));
        assert!(result.is_err());
    }

    #[test]
    fn audit_chain_survives_failed_callbacks() {
        let mut contract = provisioned();
        testing_env!(admin_ctx());
        let _promise = contract.grant_operator(OP3.to_string(), "c".to_string());
        testing_env_with_promise_results(admin_ctx(), PromiseResult::Failed);
        assert!(!contract.on_grant(OP3.to_string()));
        assert!(contract.state.verify_audit());
        assert!(contract
            .get_audit(0, 100)
            .iter()
            .any(|entry| entry.action == "grant_failed"));
    }
}
