//! Phase 1 scaffold for the FLEET controller.
//!
//! This crate intentionally contains **no controller logic**. It exists so the
//! Rust workspace, CI, and the reproducibility harness are real and testable
//! before product work begins. The v0.3 specification is in `docs/SPEC_v0.3.md`.
//!
//! Nothing in this crate can be deployed as a useful contract.

/// Version marker for the Phase 1 scaffold. This is not a contract version.
pub const SCAFFOLD_VERSION: &str = "0.0.0-phase1";

/// Returns a machine-readable status string for the scaffold.
pub fn scaffold_status() -> &'static str {
    "phase1-scaffold-no-contract-logic"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scaffold_is_explicitly_not_a_contract() {
        assert_eq!(scaffold_status(), "phase1-scaffold-no-contract-logic");
        assert_eq!(SCAFFOLD_VERSION, "0.0.0-phase1");
    }
}
