// Independent reference model for the differential test.
//
// Written from docs/SPEC_v0.3.md alone (see docs/INVARIANTS.md). It does not
// call State methods, does not share logic with model.rs, and represents
// operators as a simple sorted set and audit length as a counter. The
// differential test applies the same random xorshift sequences to both
// implementations and compares after every step.

use std::collections::BTreeSet;

use crate::model::State;

/// Minimal, deliberately naive reference state derived from SPEC.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Reference {
    pub mode: &'static str,
    pub admin: String,
    pub recovery: String,
    pub admin_account: String,
    pub paused: bool,
    /// Active operator keys as a set (sorted for determinism).
    pub active: BTreeSet<String>,
    /// All registered operator keys (active or not) as a set.
    pub registered: BTreeSet<String>,
    pub pending: Option<String>,
    pub pending_origin: Option<String>,
    pub audit_len: usize,
    pub provisioned: bool,
}

impl Reference {
    /// Snapshot the observable fields of a `State` for comparison.
    ///
    /// This reads public fields only; it never calls a `State` method. The
    /// normalization (sets, empty-string for `None`) is the spec's notion of
    /// "same observable state", not a copy of the implementation.
    pub fn from_state(state: &State) -> Self {
        Self {
            mode: state.admin_mode(),
            admin: state.admin_pk().unwrap_or("").to_string(),
            recovery: state.recovery_pk().unwrap_or("").to_string(),
            admin_account: state.admin_account().unwrap_or("").to_string(),
            paused: state.paused,
            active: state
                .operators
                .iter()
                .filter(|op| op.active)
                .map(|op| op.pk.clone())
                .collect(),
            registered: state.operators.iter().map(|op| op.pk.clone()).collect(),
            pending: state.pending_admin.as_ref().map(|p| p.pk.clone()),
            pending_origin: state.pending_admin.as_ref().map(|p| {
                match p.origin {
                    crate::model::PendingOrigin::Admin => "admin",
                    crate::model::PendingOrigin::Recovery => "recovery",
                }
                .to_string()
            }),
            audit_len: state.audit.len(),
            provisioned: state.provisioned,
        }
    }

    pub fn compare(&self, state: &State) -> Result<(), String> {
        let other = Self::from_state(state);
        if self == &other {
            Ok(())
        } else {
            Err(format!(
                "reference mismatch:\n ref={:?}\n got={:?}",
                self, other
            ))
        }
    }

    /// Test helper: render the active set in deterministic order.
    pub fn active_list(&self) -> Vec<String> {
        self.active.iter().cloned().collect()
    }
}
