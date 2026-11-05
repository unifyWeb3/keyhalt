//! Tests written against the surviving mutants reported by `cargo-mutants`.
//!
//! Each test states the mutation class it is intended to kill. These tests are
//! separate from the behavioural suites so a reader can tell why they exist:
//! they pin exact boundaries, exact return values, and positive/negative
//! controls that a mutated operator or deleted guard would flip.
#![allow(deprecated)]

use crate::model::*;
use crate::*;
use near_sdk::mock::MockAction as VmAction;
use near_sdk::test_utils::{
    get_created_receipts, get_logs, testing_env_with_promise_results, VMContextBuilder,
};
use near_sdk::{testing_env, AccountId, NearToken, PromiseResult, PublicKey};
use std::str::FromStr;

const ADMIN: &str = "ed25519:2dckMmmyFQdr4J78vGfqm7XaK4ck2HgCvN8gSDfiQyx2";
const RECOVERY: &str = "ed25519:GBBrXTPNg3sSXBKbpdHnRv1RwC5edoFd5j5KnkG5ffbp";
const OP1: &str = "ed25519:6fwVD6BjbUyZ9Xq1UWCpfbnrtonRaa75a28sw7v6k2WX";
const OP2: &str = "ed25519:65WruDfYoZ5A5dkDWcxkXjtNCfUvvbSWELPo9T38cynD";
const OP3: &str = "ed25519:2ez7EPpss9wTAGFBTFfpejNRNtDnMiDdYX7qaEjfEpmm";
const OP4: &str = "ed25519:EVfpzNBztFza3BxPViKsk3Gy9sg92HxZzgSZBCeGJGzd";
const FRESH: &str = "ed25519:H7B3eyPfTQbewG3eDTXVu3frHEoLvp7knTzDsm4Xrzjj";
const CURRENT: &str = "agent.fleet.testnet";
const ADMIN_ACCOUNT: &str = "multisig.fleet.testnet";

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

fn context(predecessor: &str, signer_pk: &str) -> near_sdk::VMContext {
    ctx(CURRENT, predecessor, signer_pk)
}

fn deposit_context() -> near_sdk::VMContext {
    VMContextBuilder::new()
        .current_account_id(CURRENT.parse().unwrap())
        .predecessor_account_id(CURRENT.parse().unwrap())
        .signer_account_id(CURRENT.parse().unwrap())
        .signer_account_pk(PublicKey::from_str(ADMIN).unwrap())
        .attached_deposit(NearToken::from_yoctonear(1))
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
    Controller::new(config())
}

fn provisioned() -> Controller {
    let mut contract = init_contract();
    testing_env_with_promise_results(context(CURRENT, ADMIN), PromiseResult::Successful(vec![]));
    assert!(contract.on_provisioned());
    contract
}

fn ops() -> Vec<Operator> {
    vec![
        Operator {
            pk: OP1.to_string(),
            tag: "a".to_string(),
            active: true,
        },
        Operator {
            pk: OP2.to_string(),
            tag: "b".to_string(),
            active: true,
        },
    ]
}

fn mode_a() -> Mode {
    Mode::A {
        admin_pk: ADMIN.to_string(),
        recovery_pk: RECOVERY.to_string(),
    }
}

fn mode_b() -> Mode {
    Mode::B {
        admin_account: ADMIN_ACCOUNT.to_string(),
    }
}

fn state_a() -> State {
    State::init(
        mode_a(),
        CURRENT.to_string(),
        "ping".to_string(),
        8,
        ops(),
        true,
    )
    .unwrap()
}

fn state_b() -> State {
    State::init(
        mode_b(),
        CURRENT.to_string(),
        "ping".to_string(),
        8,
        vec![],
        true,
    )
    .unwrap()
}

fn actor(pk: &str) -> Actor {
    Actor {
        account: CURRENT.to_string(),
        signer_pk: pk.to_string(),
    }
}

fn admin_actor() -> Actor {
    actor(ADMIN)
}

fn recovery_actor() -> Actor {
    actor(RECOVERY)
}

fn op_actor() -> Actor {
    actor(OP1)
}

fn caught(f: impl FnOnce()) -> bool {
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(f)).is_err()
}

// ---------------------------------------------------------------------------
// Pure validators
// ---------------------------------------------------------------------------

/// Kills any mutation of the character set, the dot check, or the 2..=64
/// length window in `valid_account`.
#[test]
fn mt_valid_account_boundaries() {
    assert!(valid_account("ab.cd"));
    assert!(valid_account("a-b_c.d"));
    assert!(valid_account(&format!("ab.{}", "a".repeat(61)))); // exactly 64 bytes
    assert!(!valid_account("a"));
    assert!(!valid_account("ab"));
    assert!(!valid_account(&format!("ab.{}", "a".repeat(62)))); // 65 bytes
    assert!(!valid_account(".ab"));
    assert!(!valid_account("ab."));
    assert!(!valid_account("a..b"));
    assert!(!valid_account("AB.cd"));
    assert!(!valid_account("ab.cd "));
    assert!(!valid_account("äb.cd"));
}

/// Kills the curve check, the colon split, the 12-byte lower bound, the
/// 64-byte rest bound, and the rest character class in `valid_public_key`.
#[test]
fn mt_valid_public_key_boundaries() {
    assert!(valid_public_key("ed25519:2345")); // exactly 12 bytes
    assert!(!valid_public_key("ed25519:234")); // 11 bytes
    assert!(valid_public_key(&format!("ed25519:{}", "+".repeat(64))));
    assert!(!valid_public_key(&format!("ed25519:{}", "+".repeat(65))));
    assert!(valid_public_key("secp256k1:ABCdef0123456789+/"));
    assert!(!valid_public_key("ed25519:"));
    assert!(!valid_public_key("ed25519:abc def"));
    assert!(!valid_public_key("rsa:abcdefgh"));
    assert!(!valid_public_key("ed25519abc"));
    assert!(!valid_public_key("ed25519:ab=d"));
}

/// Kills the length bound and character class in `valid_tag`.
#[test]
fn mt_valid_tag_boundaries() {
    assert!(valid_tag("a"));
    assert!(valid_tag(&"a".repeat(MAX_TAG_LEN)));
    assert!(!valid_tag(&"a".repeat(MAX_TAG_LEN + 1)));
    assert!(!valid_tag(""));
    assert!(valid_tag("a-b_c9"));
    assert!(!valid_tag("A"));
    assert!(!valid_tag("ab!"));
}

/// Kills the empty check, the length bound, and every separator branch in
/// `valid_method`.
#[test]
fn mt_valid_method_boundaries() {
    assert!(valid_method("a"));
    assert!(valid_method(&"a".repeat(MAX_METHOD_LEN)));
    assert!(!valid_method(&"a".repeat(MAX_METHOD_LEN + 1)));
    assert!(!valid_method(""));
    assert!(valid_method("_"));
    assert!(valid_method("-"));
    assert!(valid_method("aB9"));
    assert!(!valid_method("a.b"));
}

/// Kills the high/low nibble extraction in `hex_encode`.
#[test]
fn mt_hex_encode_nibbles() {
    assert_eq!(
        hex_encode(&[0x00, 0x01, 0x0f, 0x10, 0xa5, 0xff]),
        "00010f10a5ff"
    );
}

// ---------------------------------------------------------------------------
// State::init
// ---------------------------------------------------------------------------

/// Kills each capacity bound (`== 0`, `> MAX`, `operator count > max`), the
/// operator key/tag guard, the duplicate scan, and the mode-specific checks.
#[test]
fn mt_state_init_boundaries() {
    let op = |pk: &str, tag: &str| Operator {
        pk: pk.to_string(),
        tag: tag.to_string(),
        active: false,
    };

    assert!(matches!(
        State::init(
            mode_a(),
            CURRENT.to_string(),
            "ping".to_string(),
            0,
            vec![],
            false
        ),
        Err(Error::Capacity)
    ));
    assert!(State::init(
        mode_a(),
        CURRENT.to_string(),
        "ping".to_string(),
        MAX_OPERATORS_CAP,
        vec![],
        false
    )
    .is_ok());
    assert!(matches!(
        State::init(
            mode_a(),
            CURRENT.to_string(),
            "ping".to_string(),
            MAX_OPERATORS_CAP + 1,
            vec![],
            false
        ),
        Err(Error::Capacity)
    ));
    // Exactly max operators is accepted; one more is not.
    assert!(State::init(
        mode_a(),
        CURRENT.to_string(),
        "ping".to_string(),
        1,
        vec![op(OP1, "a")],
        false
    )
    .is_ok());
    assert!(matches!(
        State::init(
            mode_a(),
            CURRENT.to_string(),
            "ping".to_string(),
            1,
            vec![op(OP1, "a"), op(OP2, "b")],
            false
        ),
        Err(Error::Capacity)
    ));
    // Duplicate keys are rejected.
    assert!(matches!(
        State::init(
            mode_a(),
            CURRENT.to_string(),
            "ping".to_string(),
            2,
            vec![op(OP1, "a"), op(OP1, "b")],
            false
        ),
        Err(Error::KeyCollision)
    ));
    // A valid key with an invalid tag, and an invalid key with a valid tag.
    assert!(matches!(
        State::init(
            mode_a(),
            CURRENT.to_string(),
            "ping".to_string(),
            2,
            vec![op(OP3, "BAD")],
            false
        ),
        Err(Error::InvalidKey)
    ));
    assert!(matches!(
        State::init(
            mode_a(),
            CURRENT.to_string(),
            "ping".to_string(),
            2,
            vec![op("nope", "ok")],
            false
        ),
        Err(Error::InvalidKey)
    ));
    // Receiver and method guards.
    assert!(State::init(
        mode_a(),
        "x".to_string(),
        "ping".to_string(),
        8,
        vec![],
        false
    )
    .is_err());
    assert!(State::init(
        mode_a(),
        CURRENT.to_string(),
        "bad method".to_string(),
        8,
        vec![],
        false
    )
    .is_err());
    // Admin and recovery keys are validated and must differ.
    assert!(State::init(
        Mode::A {
            admin_pk: "nope".to_string(),
            recovery_pk: RECOVERY.to_string(),
        },
        CURRENT.to_string(),
        "ping".to_string(),
        8,
        vec![],
        false
    )
    .is_err());
    assert!(State::init(
        Mode::A {
            admin_pk: ADMIN.to_string(),
            recovery_pk: ADMIN.to_string(),
        },
        CURRENT.to_string(),
        "ping".to_string(),
        8,
        vec![],
        false
    )
    .is_err());
    // Admin and recovery keys must not collide with an operator.
    assert!(matches!(
        State::init(
            mode_a(),
            CURRENT.to_string(),
            "ping".to_string(),
            8,
            vec![op(ADMIN, "a")],
            false
        ),
        Err(Error::KeyCollision)
    ));
    assert!(matches!(
        State::init(
            mode_a(),
            CURRENT.to_string(),
            "ping".to_string(),
            8,
            vec![op(RECOVERY, "a")],
            false
        ),
        Err(Error::KeyCollision)
    ));
    // Mode B validates its account.
    assert!(State::init(
        mode_b(),
        CURRENT.to_string(),
        "ping".to_string(),
        8,
        vec![],
        false
    )
    .is_ok());
    assert!(matches!(
        State::init(
            Mode::B {
                admin_account: "bad".to_string(),
            },
            CURRENT.to_string(),
            "ping".to_string(),
            8,
            vec![],
            false
        ),
        Err(Error::InvalidAccount)
    ));
    // Provisioned state activates operators and empties the reserve.
    let s = State::init(
        mode_a(),
        CURRENT.to_string(),
        "ping".to_string(),
        8,
        vec![op(OP1, "a")],
        true,
    )
    .unwrap();
    assert!(s.provisioned);
    assert!(s.pending_operators.is_empty());
    assert!(s.operators[0].active);
}

/// Kills the per-mode return values of `admin_pk`, `recovery_pk`,
/// `admin_account`, and `admin_mode`.
#[test]
fn mt_mode_views_are_exact() {
    let a = state_a();
    assert_eq!(a.admin_mode(), "A");
    assert_eq!(a.admin_pk(), Some(ADMIN));
    assert_eq!(a.recovery_pk(), Some(RECOVERY));
    assert_eq!(a.admin_account(), None);

    let b = state_b();
    assert_eq!(b.admin_mode(), "B");
    assert_eq!(b.admin_pk(), None);
    assert_eq!(b.recovery_pk(), None);
    assert_eq!(b.admin_account(), Some(ADMIN_ACCOUNT));
}

/// Kills the `operator_for` comparison and the `(in)active` partition.
#[test]
fn mt_operator_lookup_and_active_partition() {
    let mut s = state_a();
    assert_eq!(s.operator_for(OP1).map(|op| op.tag.as_str()), Some("a"));
    assert!(s.operator_for(OP3).is_none());
    assert_eq!(s.active_operators().len(), 2);

    s.operators[0].active = false;
    assert_eq!(s.active_operators().len(), 1);
    assert_eq!(s.active_operators()[0].pk, OP2);
}

// ---------------------------------------------------------------------------
// Audit chain
// ---------------------------------------------------------------------------

/// Kills the genesis head, the head chaining, and the entry lookup.
#[test]
fn mt_audit_head_and_entry_exact() {
    let mut s = state_a();
    let head = s.audit_head();
    assert_eq!(head.seq, 0);
    assert_eq!(head.entry_hash, "0".repeat(64));
    assert_eq!(head.block_height, 0);
    assert_eq!(head.block_timestamp, 0);

    s.record("init", "acct", "pk", "provisioned", 10, 1000)
        .unwrap();
    s.record("freeze", "acct", "pk", "paused=true", 20, 2000)
        .unwrap();

    let head = s.audit_head();
    assert_eq!(head.seq, 1);
    assert_eq!(head.entry_hash, s.audit[1].entry_hash);
    assert_eq!(head.block_height, 20);
    assert_eq!(head.block_timestamp, 2000);

    assert_eq!(s.audit_entry(1).unwrap().action, "freeze");
    assert!(s.audit_entry(99).is_none());
    assert_eq!(s.audit_page(1, MAX_AUDIT_PAGE).len(), 1);
    assert_eq!(s.audit_page(0, MAX_AUDIT_PAGE).len(), 2);
    assert_eq!(s.audit_page(0, 1).len(), 1);
}

/// Kills the page-size clamp in `audit_page`.
#[test]
fn mt_audit_page_is_capped() {
    let mut s = state_a();
    for i in 0..(MAX_AUDIT_PAGE as usize + 5) {
        s.record("tick", "", "", &i.to_string(), i as u64, i as u64)
            .unwrap();
    }
    assert_eq!(s.audit_page(0, u64::MAX).len(), MAX_AUDIT_PAGE as usize);
    assert_eq!(s.audit_page(0, 10).len(), 10);
}

/// Kills the action/subject length guards and the chain link setup in
/// `State::record`, including the genesis prev-hash.
#[test]
fn mt_record_length_boundaries() {
    let mut s = state_a();
    let ok64 = "a".repeat(64);
    let bad65 = "a".repeat(65);
    assert!(s.record(&ok64, "", "", "", 1, 1).is_ok());
    assert!(s.record(&bad65, "", "", "", 1, 1).is_err());

    let ok_subject = "s".repeat(MAX_SUBJECT_LEN);
    let bad_subject = "s".repeat(MAX_SUBJECT_LEN + 1);
    assert!(s.record("freeze", "", "", &ok_subject, 1, 1).is_ok());
    assert!(s.record("freeze", "", "", &bad_subject, 1, 1).is_err());

    let len = s.audit.len();
    assert!(s.record(&bad65, "", "", "", 1, 1).is_err());
    assert_eq!(s.audit.len(), len);

    assert_eq!(s.audit[0].seq, 0);
    assert_eq!(s.audit[0].prev_hash, "0".repeat(64));
    assert_eq!(s.audit[0].entry_hash.len(), 64);
    assert_eq!(s.audit[0].action, ok64);
    assert_eq!(
        s.audit[0].entry_hash,
        hash_message(&"0".repeat(64), 0, &ok64, "", "", "", 1, 1)
    );
}

/// Kills the `verify_audit` genesis check, the seq/prev early return, and the
/// entry-hash comparison.
#[test]
fn mt_verify_audit_detects_every_tamper() {
    let mut s = state_a();
    s.record("init", "acct", "pk", "provisioned", 1, 1000)
        .unwrap();
    s.record("freeze", "acct", "pk", "paused=true", 2, 2000)
        .unwrap();
    assert!(s.verify_audit());

    let tampered = |f: &dyn Fn(&mut State)| {
        let mut t = s.clone();
        f(&mut t);
        assert!(!t.verify_audit());
    };
    tampered(&|t| t.audit[1].seq = 5);
    tampered(&|t| t.audit[1].prev_hash = "0".repeat(64));
    tampered(&|t| t.audit[0].entry_hash = "f".repeat(64));
    tampered(&|t| t.audit[1].action = "unfreeze".to_string());
    tampered(&|t| t.audit[0].subject = "other".to_string());
    tampered(&|t| t.audit[0].actor_account = "other".to_string());
    tampered(&|t| t.audit[0].signer_pk = "other".to_string());
    tampered(&|t| t.audit[0].block_height = 999);
    tampered(&|t| t.audit[0].block_timestamp = 999);
}

/// The seq and prev-hash checks must fail even when the tampered entry has a
/// hash that is internally consistent with its own fields; otherwise a
/// rewritten tail could pass the hash loop.
#[test]
fn mt_verify_audit_rejects_consistent_but_mislinked_entry() {
    let mut s = state_a();
    s.record("init", "", "", "provisioned", 1, 1).unwrap();
    let prev = "f".repeat(64);
    let entry_hash = hash_message(&prev, 9, "freeze", "", "", "x", 2, 2);
    s.audit.push(AuditEntry {
        seq: 9,
        action: "freeze".to_string(),
        actor_account: "".to_string(),
        signer_pk: "".to_string(),
        subject: "x".to_string(),
        block_height: 2,
        block_timestamp: 2,
        prev_hash: prev,
        entry_hash,
    });
    assert!(!s.verify_audit());
}

// ---------------------------------------------------------------------------
// Role gates and lifecycle
// ---------------------------------------------------------------------------

/// Kills every early `Ok(())` replacement in the three role gates and each
/// comparison inside them.
#[test]
fn mt_role_gates_positive_and_negative() {
    let s = state_a();
    assert_eq!(s.require_admin(&admin_actor(), CURRENT), Ok(()));
    assert_eq!(s.require_admin(&op_actor(), CURRENT), Err(Error::AdminOnly));
    assert_eq!(
        s.require_admin(&admin_actor(), ADMIN_ACCOUNT),
        Err(Error::AdminOnly)
    );
    assert_eq!(
        s.require_admin(
            &Actor {
                account: ADMIN_ACCOUNT.to_string(),
                signer_pk: ADMIN.to_string(),
            },
            CURRENT
        ),
        Err(Error::AdminOnly)
    );
    assert_eq!(s.require_recovery(&recovery_actor(), CURRENT), Ok(()));
    assert_eq!(
        s.require_recovery(&admin_actor(), CURRENT),
        Err(Error::RecoveryOnly)
    );
    assert_eq!(s.require_operator(&op_actor(), CURRENT), Ok(()));
    assert_eq!(
        s.require_operator(&actor(OP3), CURRENT),
        Err(Error::AdminOnly)
    );
    assert_eq!(
        s.require_operator(
            &Actor {
                account: ADMIN_ACCOUNT.to_string(),
                signer_pk: OP1.to_string(),
            },
            CURRENT
        ),
        Err(Error::DirectCallOnly)
    );

    let mut inactive = state_a();
    inactive.operators[0].active = false;
    assert_eq!(
        inactive.require_operator(&op_actor(), CURRENT),
        Err(Error::NotActive)
    );

    let mut frozen = state_a();
    frozen.paused = true;
    assert_eq!(
        frozen.require_operator(&op_actor(), CURRENT),
        Err(Error::Frozen)
    );

    let b = state_b();
    assert_eq!(
        b.require_admin(
            &Actor {
                account: ADMIN_ACCOUNT.to_string(),
                signer_pk: OP1.to_string(),
            },
            CURRENT
        ),
        Ok(())
    );
    assert_eq!(
        b.require_admin(&admin_actor(), CURRENT),
        Err(Error::AdminOnly)
    );
    assert_eq!(
        b.require_recovery(&recovery_actor(), CURRENT),
        Err(Error::RecoveryOnly)
    );
}

/// Kills `freeze`/`unfreeze` body replacement and the `Frozen`/`NotFrozen`
/// guards.
#[test]
fn mt_freeze_unfreeze_state_machine() {
    let mut s = state_a();
    assert_eq!(s.freeze(&op_actor(), CURRENT, 1, 1), Err(Error::AdminOnly));
    assert!(!s.paused);
    assert!(s.freeze(&admin_actor(), CURRENT, 1, 1).is_ok());
    assert!(s.paused);
    assert_eq!(s.freeze(&admin_actor(), CURRENT, 1, 1), Err(Error::Frozen));
    assert!(s.unfreeze(&admin_actor(), CURRENT, 1, 1).is_ok());
    assert!(!s.paused);
    assert_eq!(
        s.unfreeze(&admin_actor(), CURRENT, 1, 1),
        Err(Error::NotFrozen)
    );
    assert_eq!(s.audit.len(), 2);
    assert_eq!(s.audit[0].action, "freeze");
    assert_eq!(s.audit[1].action, "unfreeze");
}

/// Kills the role, validity, collision, capacity, and status checks in
/// `prepare_grant`, plus the `pending_operators` half of `fresh_key`.
#[test]
fn mt_prepare_grant_checks() {
    let mut s = state_a();
    assert_eq!(
        s.prepare_grant(&op_actor(), CURRENT, OP3, "c", 1, 1),
        Err(Error::AdminOnly)
    );
    assert_eq!(
        s.prepare_grant(&admin_actor(), CURRENT, "nope", "c", 1, 1),
        Err(Error::InvalidKey)
    );
    assert_eq!(
        s.prepare_grant(&admin_actor(), CURRENT, OP3, "BAD", 1, 1),
        Err(Error::InvalidTag)
    );
    assert_eq!(
        s.prepare_grant(&admin_actor(), CURRENT, OP1, "c", 1, 1),
        Err(Error::KeyCollision)
    );
    assert_eq!(
        s.prepare_grant(&admin_actor(), CURRENT, ADMIN, "c", 1, 1),
        Err(Error::KeyCollision)
    );
    assert!(s
        .prepare_grant(&admin_actor(), CURRENT, OP3, "c", 1, 1)
        .is_ok());
    assert!(!s.operator_for(OP3).unwrap().active);
    assert_eq!(s.audit.last().unwrap().action, "grant_operator");

    let mut full = State::init(
        mode_a(),
        CURRENT.to_string(),
        "ping".to_string(),
        2,
        ops(),
        true,
    )
    .unwrap();
    assert_eq!(
        full.prepare_grant(&admin_actor(), CURRENT, OP3, "c", 1, 1),
        Err(Error::Capacity)
    );

    let mut unprovisioned = State::init(
        mode_a(),
        CURRENT.to_string(),
        "ping".to_string(),
        8,
        ops(),
        false,
    )
    .unwrap();
    assert_eq!(
        unprovisioned.prepare_grant(&admin_actor(), CURRENT, OP3, "c", 1, 1),
        Err(Error::NotProvisioned)
    );
    // A reserved (not yet active) operator is not a fresh key.
    assert!(!unprovisioned.fresh_key(OP1));
}

/// Kills the pending/inactive lookup in `confirm_grant` and both branches.
#[test]
fn mt_confirm_grant_requires_pending_inactive_operator() {
    let mut s = state_a();
    assert_eq!(
        s.confirm_grant(OP3, true, 1, 1),
        Err(Error::OperatorMissing)
    );
    s.prepare_grant(&admin_actor(), CURRENT, OP3, "c", 1, 1)
        .unwrap();
    assert_eq!(
        s.confirm_grant(OP4, true, 1, 1),
        Err(Error::OperatorMissing)
    );
    // An already-active operator is not a pending grant target.
    let len = s.audit.len();
    assert_eq!(
        s.confirm_grant(OP1, true, 1, 1),
        Err(Error::OperatorMissing)
    );
    assert_eq!(s.audit.len(), len);
    assert!(s.confirm_grant(OP3, true, 1, 1).is_ok());
    assert!(s.operator_for(OP3).unwrap().active);
    assert_eq!(s.audit.last().unwrap().action, "grant_confirmed");
    // A second confirm of the same key is rejected.
    assert_eq!(
        s.confirm_grant(OP3, true, 1, 1),
        Err(Error::OperatorMissing)
    );
    // Failure path removes the pending operator.
    s.prepare_grant(&admin_actor(), CURRENT, OP4, "d", 1, 1)
        .unwrap();
    assert!(s.confirm_grant(OP4, false, 1, 1).is_ok());
    assert!(s.operator_for(OP4).is_none());
    assert_eq!(s.audit.last().unwrap().action, "grant_failed");
}

/// Kills the role and membership guards and the tag partition in
/// `revoke_operator` / `revoke_tag`.
#[test]
fn mt_revoke_paths_and_exact_returns() {
    let mut s = state_a();
    assert_eq!(
        s.revoke_operator(&op_actor(), CURRENT, OP1, 1, 1),
        Err(Error::AdminOnly)
    );
    assert_eq!(
        s.revoke_operator(&admin_actor(), CURRENT, OP3, 1, 1),
        Err(Error::OperatorMissing)
    );
    assert!(s
        .revoke_operator(&admin_actor(), CURRENT, OP1, 1, 1)
        .is_ok());
    assert!(s.operator_for(OP1).is_none());
    assert_eq!(s.audit.last().unwrap().action, "revoke_operator");

    let mut s = state_a();
    assert_eq!(
        s.revoke_tag(&admin_actor(), CURRENT, "BAD", 1, 1),
        Err(Error::InvalidTag)
    );
    assert_eq!(
        s.revoke_tag(&admin_actor(), CURRENT, "nope", 1, 1),
        Err(Error::TagMissing)
    );
    let revoked = s.revoke_tag(&admin_actor(), CURRENT, "a", 1, 1).unwrap();
    assert_eq!(revoked, vec![OP1.to_string()]);
    assert!(s.operator_for(OP1).is_none());
    assert!(s.operator_for(OP2).is_some());
    assert_eq!(
        s.audit.last().unwrap().subject,
        format!("tag=a;removed={}", OP1)
    );
}

/// Kills the validity, status, collision, and capacity guards in
/// `prepare_rotate` and the removal logic in `confirm_rotate`.
#[test]
fn mt_rotate_paths_and_boundaries() {
    let mut s = state_a();
    assert_eq!(
        s.prepare_rotate(&admin_actor(), CURRENT, OP1, "nope", "c", 1, 1),
        Err(Error::InvalidKey)
    );
    assert_eq!(
        s.prepare_rotate(&admin_actor(), CURRENT, OP1, OP3, "BAD", 1, 1),
        Err(Error::InvalidKey)
    );
    assert_eq!(
        s.prepare_rotate(&admin_actor(), CURRENT, OP4, OP3, "c", 1, 1),
        Err(Error::OperatorMissing)
    );
    assert_eq!(
        s.prepare_rotate(&admin_actor(), CURRENT, OP1, OP1, "a", 1, 1),
        Err(Error::KeyCollision)
    );
    assert_eq!(
        s.prepare_rotate(&admin_actor(), CURRENT, OP1, OP2, "a", 1, 1),
        Err(Error::KeyCollision)
    );

    let mut inactive = state_a();
    inactive
        .prepare_grant(&admin_actor(), CURRENT, OP3, "c", 1, 1)
        .unwrap();
    assert_eq!(
        inactive.prepare_rotate(&admin_actor(), CURRENT, OP3, OP4, "d", 1, 1),
        Err(Error::NotActive)
    );

    let mut full = State::init(
        mode_a(),
        CURRENT.to_string(),
        "ping".to_string(),
        2,
        ops(),
        true,
    )
    .unwrap();
    assert_eq!(
        full.prepare_rotate(&admin_actor(), CURRENT, OP1, OP3, "c", 1, 1),
        Err(Error::Capacity)
    );

    assert!(s
        .prepare_rotate(&admin_actor(), CURRENT, OP1, OP3, "c", 1, 1)
        .is_ok());
    assert!(!s.operator_for(OP3).unwrap().active);
    assert!(s.operator_for(OP1).unwrap().active);

    assert_eq!(
        s.confirm_rotate(OP1, OP4, true, 1, 1),
        Err(Error::OperatorMissing)
    );
    assert!(s.confirm_rotate(OP1, OP3, false, 1, 1).is_ok());
    assert!(s.operator_for(OP3).is_none());
    assert!(s.operator_for(OP1).unwrap().active);
    assert_eq!(s.audit.last().unwrap().action, "rotate_failed");

    s.prepare_rotate(&admin_actor(), CURRENT, OP1, OP3, "c", 1, 1)
        .unwrap();
    assert!(s.confirm_rotate(OP1, OP3, true, 1, 1).is_ok());
    assert!(s.operator_for(OP1).is_none());
    assert!(s.operator_for(OP3).unwrap().active);
    assert_eq!(s.audit.last().unwrap().action, "rotate_confirmed");
    // An already-active new key is not a rotation target.
    assert_eq!(
        s.confirm_rotate(OP3, OP3, true, 1, 1),
        Err(Error::OperatorMissing)
    );
}

/// Kills the origin dispatch, mode guard, pending guard, and key guard in
/// `prepare_propose`, plus both `confirm_propose` branches.
#[test]
fn mt_propose_paths_and_boundaries() {
    let mut s = state_a();
    assert_eq!(
        s.prepare_propose(&op_actor(), CURRENT, OP3, PendingOrigin::Admin, 1, 1),
        Err(Error::AdminOnly)
    );
    assert_eq!(
        s.prepare_propose(&admin_actor(), CURRENT, OP3, PendingOrigin::Recovery, 1, 1),
        Err(Error::RecoveryOnly)
    );
    assert_eq!(
        s.prepare_propose(&admin_actor(), CURRENT, "nope", PendingOrigin::Admin, 1, 1),
        Err(Error::KeyCollision)
    );
    assert_eq!(
        s.prepare_propose(&admin_actor(), CURRENT, OP1, PendingOrigin::Admin, 1, 1),
        Err(Error::KeyCollision)
    );

    let mut b = state_b();
    assert_eq!(
        b.prepare_propose(
            &Actor {
                account: ADMIN_ACCOUNT.to_string(),
                signer_pk: OP1.to_string(),
            },
            CURRENT,
            OP3,
            PendingOrigin::Admin,
            1,
            1
        ),
        Err(Error::InvalidMode)
    );

    assert!(s
        .prepare_propose(
            &recovery_actor(),
            CURRENT,
            OP3,
            PendingOrigin::Recovery,
            1,
            1
        )
        .is_ok());
    assert_eq!(s.inflight_admin.as_deref(), Some(OP3));
    assert_eq!(s.inflight_origin, Some(PendingOrigin::Recovery));
    assert_eq!(s.audit.last().unwrap().action, "recover_admin");
    // A second proposal while one is in flight is rejected.
    assert_eq!(
        s.prepare_propose(&admin_actor(), CURRENT, OP4, PendingOrigin::Admin, 1, 1),
        Err(Error::PendingExists)
    );

    assert_eq!(s.confirm_propose(OP4, true, 1, 1), Err(Error::NoPending));
    assert!(s.confirm_propose(OP3, true, 1, 1).is_ok());
    assert!(s.inflight_admin.is_none());
    assert_eq!(s.pending_admin.as_ref().map(|p| p.pk.as_str()), Some(OP3));
    assert_eq!(
        s.pending_admin.as_ref().map(|p| &p.origin),
        Some(&PendingOrigin::Recovery)
    );
    assert_eq!(s.audit.last().unwrap().action, "recover_confirmed");
    // A pending admin blocks a new proposal too.
    assert_eq!(
        s.prepare_propose(&admin_actor(), CURRENT, OP4, PendingOrigin::Admin, 1, 1),
        Err(Error::PendingExists)
    );
    // The pending admin is not a fresh key.
    assert!(!s.fresh_key(OP3));

    let mut failed = state_a();
    failed
        .prepare_propose(&admin_actor(), CURRENT, OP3, PendingOrigin::Admin, 1, 1)
        .unwrap();
    assert!(failed.confirm_propose(OP3, false, 1, 1).is_ok());
    assert!(failed.pending_admin.is_none());
    assert!(failed.inflight_admin.is_none());
    assert_eq!(failed.audit.last().unwrap().action, "propose_failed");
}

/// Kills the pending guard, the direct-call and signer checks, and the
/// admin/recovery swap in `accept_admin`.
#[test]
fn mt_accept_admin_moves_the_admin_key() {
    let mut s = state_a();
    assert_eq!(
        s.accept_admin(&admin_actor(), CURRENT, 1, 1),
        Err(Error::NoPending)
    );
    s.prepare_propose(&admin_actor(), CURRENT, OP3, PendingOrigin::Admin, 1, 1)
        .unwrap();
    s.confirm_propose(OP3, true, 1, 1).unwrap();
    // The old admin cannot accept for the pending key.
    assert_eq!(
        s.accept_admin(&admin_actor(), CURRENT, 1, 1),
        Err(Error::PendingOnly)
    );
    let new_admin = actor(OP3);
    let old = s.accept_admin(&new_admin, CURRENT, 1, 1).unwrap();
    assert_eq!(old, ADMIN);
    assert_eq!(s.admin_pk(), Some(OP3));
    assert_eq!(s.recovery_pk(), Some(RECOVERY));
    assert!(s.pending_admin.is_none());
    assert_eq!(s.audit.last().unwrap().action, "accept_admin");
}

/// Kills the role check, the no-pending guard, and both return values in
/// `cancel_admin`.
#[test]
fn mt_cancel_admin_paths_and_return_value() {
    let mut s = state_a();
    assert_eq!(
        s.cancel_admin(&admin_actor(), CURRENT, 1, 1),
        Err(Error::NoPending)
    );
    assert_eq!(
        s.cancel_admin(&op_actor(), CURRENT, 1, 1),
        Err(Error::AdminOnly)
    );

    s.prepare_propose(&admin_actor(), CURRENT, OP3, PendingOrigin::Admin, 1, 1)
        .unwrap();
    assert_eq!(
        s.cancel_admin(&recovery_actor(), CURRENT, 1, 1).unwrap(),
        None
    );
    assert!(s.inflight_admin.is_none());
    assert!(s.inflight_origin.is_none());
    assert_eq!(s.audit.last().unwrap().subject, "inflight");

    s.prepare_propose(&admin_actor(), CURRENT, OP3, PendingOrigin::Admin, 1, 1)
        .unwrap();
    s.confirm_propose(OP3, true, 1, 1).unwrap();
    assert_eq!(
        s.cancel_admin(&admin_actor(), CURRENT, 1, 1).unwrap(),
        Some(OP3.to_string())
    );
    assert!(s.pending_admin.is_none());
    assert_eq!(s.audit.last().unwrap().subject, OP3);
}

/// Kills both branches and the double-provision guard of
/// `confirm_provision`.
#[test]
fn mt_confirm_provision_paths() {
    let mut s = State::init(
        mode_a(),
        CURRENT.to_string(),
        "ping".to_string(),
        8,
        ops(),
        false,
    )
    .unwrap();
    assert!(s.confirm_provision(true, 10, 100).is_ok());
    assert!(s.provisioned);
    assert!(s.operators.iter().all(|op| op.active));
    assert!(s.pending_operators.is_empty());
    assert_eq!(s.audit.last().unwrap().action, "init");
    assert_eq!(
        s.confirm_provision(true, 10, 100),
        Err(Error::AlreadyProvisioned)
    );

    let mut f = State::init(
        mode_a(),
        CURRENT.to_string(),
        "ping".to_string(),
        8,
        ops(),
        false,
    )
    .unwrap();
    assert!(f.confirm_provision(false, 10, 100).is_ok());
    assert!(!f.provisioned);
    assert!(f.provision_error.is_some());
    assert_eq!(f.audit.last().unwrap().action, "init_failed");
}

// ---------------------------------------------------------------------------
// lib.rs helpers and views
// ---------------------------------------------------------------------------

/// Kills `ping` body replacement and the missing ping event.
#[test]
fn mt_ping_returns_pong_and_logs() {
    let contract = provisioned();
    testing_env!(context(CURRENT, ADMIN));
    assert_eq!(contract.ping(), "pong");
    assert!(get_logs()
        .iter()
        .any(|log| log.contains("\"action\":\"ping\"")));
}

/// Kills `contract_version` body replacement.
#[test]
fn mt_contract_version_is_exact() {
    let contract = provisioned();
    testing_env!(context(CURRENT, ADMIN));
    assert_eq!(contract.contract_version(), VERSION);
}

/// Kills `promise_ok` replacement with a constant.
#[test]
fn mt_promise_ok_truth_table() {
    testing_env!(context(CURRENT, ADMIN));
    assert!(!promise_ok());
    testing_env_with_promise_results(context(CURRENT, ADMIN), PromiseResult::Successful(vec![]));
    assert!(promise_ok());
    testing_env_with_promise_results(context(CURRENT, ADMIN), PromiseResult::Failed);
    assert!(!promise_ok());
}

/// Kills `parse_allowance` replacement with a constant and the caps.
#[test]
fn mt_parse_allowance_defaults_and_caps() {
    assert_eq!(parse_allowance(None, 42), 42);
    assert_eq!(parse_allowance(Some("7"), 42), 7);
    assert_eq!(parse_allowance(Some("not-a-number"), 42), 42);
    // A parsed zero fails the positivity assert rather than falling back.
    assert!(caught(|| {
        parse_allowance(Some("0"), 42);
    }));
    assert_eq!(
        parse_allowance(Some(&MAX_ALLOWANCE.to_string()), 42),
        MAX_ALLOWANCE
    );
    assert!(caught(|| {
        parse_allowance(Some(&(MAX_ALLOWANCE + 1).to_string()), 42);
    }));
}

/// Kills `config_allowance` replacement with a constant.
#[test]
fn mt_config_allowance_is_the_documented_default() {
    let s = state_a();
    assert_eq!(config_allowance(&s, true), DEFAULT_ADMIN_ALLOWANCE);
    assert_eq!(config_allowance(&s, false), DEFAULT_OPERATOR_ALLOWANCE);
}

/// Kills `origin_str` replacement with a constant.
#[test]
fn mt_origin_str_is_exact() {
    assert_eq!(origin_str(&PendingOrigin::Admin), "admin");
    assert_eq!(origin_str(&PendingOrigin::Recovery), "recovery");
}

/// Kills the `emit_event` body replacement: the only execution path must
/// emit its event.
#[test]
fn mt_execute_emits_event() {
    let contract = provisioned();
    testing_env!(context(CURRENT, OP1));
    let _ = contract.execute(
        CURRENT.parse().unwrap(),
        "ping".to_string(),
        "{}".to_string(),
        1,
    );
    let logs = get_logs();
    assert!(
        logs.iter()
            .any(|log| log.contains("\"action\":\"execute\"") && log.contains("EVENT_JSON:")),
        "execute must emit the fleet_controller event, logs: {logs:?}"
    );
}

/// Kills the `emit_last` body replacement.
#[test]
fn mt_emit_last_logs_the_audit_entry() {
    let mut contract = provisioned();
    testing_env!(context(CURRENT, ADMIN));
    contract.freeze();
    let logs = get_logs();
    assert!(logs.iter().any(|log| log.contains("\"action\":\"freeze\"")
        && log.contains("\"seq\":1")
        && log.contains("\"subject\":\"paused=true\"")));
}

/// Kills the `verify_audit` view replacement in both directions.
#[test]
fn mt_verify_audit_view_true_and_false() {
    let mut contract = provisioned();
    testing_env!(context(CURRENT, ADMIN));
    contract.freeze();
    assert!(contract.verify_audit());
    contract.state.audit[1].entry_hash = "0".repeat(64);
    assert!(!contract.verify_audit());
}

/// Kills the state/inventory/audit view replacements.
#[test]
fn mt_audit_views_match_state() {
    let mut contract = provisioned();
    testing_env!(context(CURRENT, ADMIN));
    contract.freeze();

    let state = contract.get_state();
    assert_eq!(state.account_id, CURRENT);
    assert_eq!(state.version, VERSION);
    assert_eq!(state.mode, "A");
    assert!(state.paused);
    assert_eq!(state.admin_pk.as_deref(), Some(ADMIN));
    assert_eq!(state.recovery_pk.as_deref(), Some(RECOVERY));
    assert_eq!(state.admin_account, None);
    assert_eq!(state.pending_admin_pk, None);
    assert_eq!(state.inflight_admin_pk, None);
    assert_eq!(state.operators.len(), 2);
    assert_eq!(state.receiver, CURRENT);
    assert_eq!(state.method, "ping");
    assert_eq!(state.max_operators, 8);
    assert!(state.provisioned);
    assert_eq!(state.provision_error, None);
    assert_eq!(state.audit_len, 2);
    assert_eq!(state.audit_head.seq, 1);

    let inventory = contract.get_inventory();
    assert_eq!(inventory.audit_len, 2);
    assert!(inventory.paused);

    let entries = contract.get_audit(0, 10);
    assert_eq!(entries.len(), 2);
    assert_eq!(entries[1].action, "freeze");
    assert_eq!(contract.get_audit(1, 10).len(), 1);
    assert_eq!(contract.get_audit_entry(1).unwrap().action, "freeze");
    assert!(contract.get_audit_entry(99).is_none());
    assert_eq!(contract.get_audit_head().entry_hash, entries[1].entry_hash);
}

/// Kills both bounds in `execute`: gas at the cap is accepted, one unit above
/// is refused; the same for args length.
#[test]
fn mt_execute_gas_and_args_boundaries() {
    let contract = provisioned();
    let receiver: AccountId = CURRENT.parse().unwrap();

    testing_env!(context(CURRENT, OP1));
    let _ = contract.execute(
        receiver.clone(),
        "ping".to_string(),
        "{}".to_string(),
        MAX_EXECUTE_GAS,
    );
    testing_env!(context(CURRENT, OP1));
    assert!(caught(|| {
        let _ = contract.execute(
            receiver.clone(),
            "ping".to_string(),
            "{}".to_string(),
            MAX_EXECUTE_GAS + 1,
        );
    }));

    testing_env!(context(CURRENT, OP1));
    let _ = contract.execute(
        receiver.clone(),
        "ping".to_string(),
        "a".repeat(MAX_ARGS_LEN),
        1,
    );
    testing_env!(context(CURRENT, OP1));
    assert!(caught(|| {
        let _ = contract.execute(
            receiver.clone(),
            "ping".to_string(),
            "a".repeat(MAX_ARGS_LEN + 1),
            1,
        );
    }));

    testing_env!(context(CURRENT, OP1));
    assert!(caught(|| {
        let _ = contract.execute(
            ADMIN_ACCOUNT.parse().unwrap(),
            "ping".to_string(),
            "{}".to_string(),
            1,
        );
    }));
    testing_env!(context(CURRENT, OP1));
    assert!(caught(|| {
        let _ = contract.execute(receiver.clone(), "freeze".to_string(), "{}".to_string(), 1);
    }));
}

/// Kills the executor gate in `execute`: an inactive or unknown key cannot
/// execute, and a frozen controller refuses even the active one.
#[test]
fn mt_execute_requires_active_operator_and_unfrozen() {
    let contract = provisioned();
    let receiver: AccountId = CURRENT.parse().unwrap();

    testing_env!(context(CURRENT, OP3));
    assert!(caught(|| {
        let _ = contract.execute(receiver.clone(), "ping".to_string(), "{}".to_string(), 1);
    }));

    testing_env!(context(CURRENT, ADMIN));
    assert!(caught(|| {
        let _ = contract.execute(receiver.clone(), "ping".to_string(), "{}".to_string(), 1);
    }));

    let mut frozen = provisioned();
    testing_env!(context(CURRENT, ADMIN));
    frozen.freeze();
    testing_env!(context(CURRENT, OP1));
    assert!(caught(|| {
        let _ = frozen.execute(receiver, "ping".to_string(), "{}".to_string(), 1);
    }));
}

/// Kills `assert_no_deposit` (if reachable) and the non-payable public path.
#[test]
fn mt_nonzero_deposit_is_refused() {
    let mut contract = provisioned();
    testing_env!(deposit_context());
    assert!(caught(|| contract.freeze()));
    testing_env!(deposit_context());
    assert!(caught(|| {
        let _ = contract.execute(
            CURRENT.parse().unwrap(),
            "ping".to_string(),
            "{}".to_string(),
            1,
        );
    }));
}

/// Kills `assert_private` (defence in depth behind `#[private]`).
#[test]
fn mt_private_callbacks_reject_external_predecessor() {
    let mut contract = provisioned();
    testing_env!(context(ADMIN_ACCOUNT, ADMIN));
    assert!(caught(|| {
        let _ = contract.on_grant(OP3.to_string());
    }));
    testing_env!(context(ADMIN_ACCOUNT, ADMIN));
    assert!(caught(|| {
        let _ = contract.on_propose(OP3.to_string());
    }));
    testing_env!(context(ADMIN_ACCOUNT, ADMIN));
    assert!(caught(|| {
        let _ = contract.on_rotate(OP1.to_string(), OP3.to_string());
    }));
    testing_env!(context(ADMIN_ACCOUNT, ADMIN));
    assert!(caught(|| {
        let _ = contract.on_provisioned();
    }));
}

/// Kills the callback body replacements in `on_grant`, `on_rotate`, and
/// `on_propose` in both directions.
#[test]
fn mt_callbacks_return_and_apply_the_promise_result() {
    let mut contract = provisioned();

    testing_env!(context(CURRENT, ADMIN));
    let _ = contract.grant_operator(OP3.to_string(), "c".to_string());
    testing_env_with_promise_results(context(CURRENT, ADMIN), PromiseResult::Successful(vec![]));
    assert!(contract.on_grant(OP3.to_string()));
    assert!(contract.state.operator_for(OP3).unwrap().active);

    testing_env!(context(CURRENT, ADMIN));
    let _ = contract.rotate_operator(OP1.to_string(), OP4.to_string(), "a".to_string());
    testing_env_with_promise_results(context(CURRENT, ADMIN), PromiseResult::Successful(vec![]));
    assert!(contract.on_rotate(OP1.to_string(), OP4.to_string()));
    assert!(contract.state.operator_for(OP1).is_none());
    assert!(contract.state.operator_for(OP4).unwrap().active);

    testing_env!(context(CURRENT, ADMIN));
    let _ = contract.propose_admin(FRESH.to_string());
    testing_env_with_promise_results(context(CURRENT, ADMIN), PromiseResult::Failed);
    assert!(!contract.on_propose(FRESH.to_string()));
    assert!(contract.state.pending_admin.is_none());
    assert!(contract.state.inflight_admin.is_none());
    assert_eq!(
        contract.state.audit.last().unwrap().action,
        "propose_failed"
    );
}

/// Kills the old-key cleanup branches in `accept_admin` and `cancel_admin`.
#[test]
fn mt_admin_transitions_schedule_key_cleanup() {
    let mut contract = provisioned();
    testing_env!(context(CURRENT, ADMIN));
    let _ = contract.propose_admin(OP3.to_string());
    testing_env_with_promise_results(context(CURRENT, ADMIN), PromiseResult::Successful(vec![]));
    assert!(contract.on_propose(OP3.to_string()));

    // The pending key accepts; the old admin key must be deleted.
    testing_env!(context(CURRENT, OP3));
    contract.accept_admin();
    let receipts = get_created_receipts();
    let deleted = receipts
        .iter()
        .flat_map(|receipt| receipt.actions.iter())
        .any(|action| matches!(action, VmAction::DeleteKey { public_key, .. } if public_key.to_string() == ADMIN));
    assert!(
        deleted,
        "accept_admin must schedule a DeleteKey for the old admin"
    );
    assert_eq!(contract.state.admin_pk(), Some(OP3));

    // Cancel path: a pending key that was never accepted must be deleted.
    let mut contract = provisioned();
    testing_env!(context(CURRENT, ADMIN));
    let _ = contract.propose_admin(OP3.to_string());
    testing_env_with_promise_results(context(CURRENT, ADMIN), PromiseResult::Successful(vec![]));
    assert!(contract.on_propose(OP3.to_string()));
    testing_env!(context(CURRENT, ADMIN));
    contract.cancel_admin();
    assert!(contract.state.pending_admin.is_none());
    let receipts = get_created_receipts();
    let deleted = receipts
        .iter()
        .flat_map(|receipt| receipt.actions.iter())
        .any(|action| matches!(action, VmAction::DeleteKey { public_key, .. } if public_key.to_string() == OP3));
    assert!(
        deleted,
        "cancel_admin must schedule a DeleteKey for the pending key"
    );
}
