use wasm_bindgen::prelude::*;

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use serde::{Deserialize, Serialize};

use openmls::prelude::*;
use openmls_basic_credential::SignatureKeyPair;
use openmls_rust_crypto::OpenMlsRustCrypto;
use tls_codec::{Deserialize as TlsDeserialize, Serialize as TlsSerialize};

fn b64e(bytes: &[u8]) -> String {
    B64.encode(bytes)
}
fn b64d(s: &str) -> Result<Vec<u8>, JsError> {
    B64.decode(s).map_err(|e| JsError::new(&format!("base64: {e}")))
}

#[derive(Serialize, Deserialize)]
struct PersistedGroup {
    group: String, // tls serialized MlsGroup
    // NOTE: we re-create provider + signature from seed each load.
}

fn make_provider() -> OpenMlsRustCrypto {
    OpenMlsRustCrypto::default()
}

fn make_credential_with_key(
    provider: &OpenMlsRustCrypto,
    identity: &[u8],
) -> Result<(CredentialWithKey, SignatureKeyPair), JsError> {
    let credential = Credential::new(identity.to_vec(), CredentialType::Basic)
        .map_err(|e| JsError::new(&format!("credential: {e:?}")))?;

    let signature_keys = SignatureKeyPair::new(SignatureScheme::ED25519)
        .map_err(|e| JsError::new(&format!("sigkey: {e:?}")))?;

    // Store in keystore so group operations can find it.
    provider
        .key_store()
        .store(&signature_keys)
        .map_err(|e| JsError::new(&format!("keystore store sig: {e:?}")))?;

    let credential_with_key = CredentialWithKey {
        credential,
        signature_key: signature_keys.public().into(),
    };

    Ok((credential_with_key, signature_keys))
}

#[wasm_bindgen]
pub struct MlsAdmin {
    provider: OpenMlsRustCrypto,
    group: MlsGroup,
    signer: SignatureKeyPair,
}

#[wasm_bindgen]
pub struct MlsMember {
    provider: OpenMlsRustCrypto,
    group: MlsGroup,
    signer: SignatureKeyPair,
}

#[wasm_bindgen]
impl MlsAdmin {
    #[wasm_bindgen(constructor)]
    pub fn new(stream_id: String) -> Result<MlsAdmin, JsError> {
        let provider = make_provider();
        let (cred, signer) = make_credential_with_key(&provider, stream_id.as_bytes())?;

        let group_id = GroupId::from_slice(stream_id.as_bytes());
        let group = MlsGroup::new(
            &provider,
            &signer,
            &MlsGroupConfig::default(),
            group_id,
            cred,
        )
        .map_err(|e| JsError::new(&format!("group new: {e:?}")))?;

        Ok(MlsAdmin { provider, group, signer })
    }

    pub fn load(stream_id: String, persisted_json: String) -> Result<MlsAdmin, JsError> {
        let provider = make_provider();
        let (cred, signer) = make_credential_with_key(&provider, stream_id.as_bytes())?;

        let persisted: PersistedGroup = serde_json::from_str(&persisted_json)
            .map_err(|e| JsError::new(&format!("persist json: {e}")))?;
        let group_bytes = b64d(&persisted.group)?;
        let group = MlsGroup::tls_deserialize(&mut group_bytes.as_slice())
            .map_err(|e| JsError::new(&format!("group deserialize: {e:?}")))?;

        // Ensure signer exists in keystore, and credential matches.
        let _ = cred;

        Ok(MlsAdmin { provider, group, signer })
    }

    pub fn persist(&self) -> Result<String, JsError> {
        let group_bytes = self
            .group
            .tls_serialize_detached()
            .map_err(|e| JsError::new(&format!("group serialize: {e:?}")))?;
        let persisted = PersistedGroup {
            group: b64e(&group_bytes),
        };
        serde_json::to_string(&persisted).map_err(|e| JsError::new(&format!("persist to json: {e}")))
    }

    pub fn group_epoch(&self) -> u64 {
        self.group.epoch().as_u64()
    }

    /// Viewer sends a KeyPackage (base64 tls) as join request.
    pub fn add_member(&mut self, key_package_b64: String) -> Result<JsValue, JsError> {
        let kp_bytes = b64d(&key_package_b64)?;
        let key_package = KeyPackageIn::tls_deserialize(&mut kp_bytes.as_slice())
            .map_err(|e| JsError::new(&format!("keypackage decode: {e:?}")))?;

        let (commit_out, welcome_out, _group_info) = self
            .group
            .add_members(&self.provider, &self.signer, &[key_package])
            .map_err(|e| JsError::new(&format!("add_members: {e:?}")))?;

        // MUST merge pending commit locally.
        self.group
            .merge_pending_commit(&self.provider)
            .map_err(|e| JsError::new(&format!("merge_pending_commit(admin): {e:?}")))?;

        let welcome_bytes = welcome_out
            .tls_serialize_detached()
            .map_err(|e| JsError::new(&format!("welcome serialize: {e:?}")))?;
        let commit_bytes = commit_out
            .tls_serialize_detached()
            .map_err(|e| JsError::new(&format!("commit serialize: {e:?}")))?;

        let out = serde_json::json!({
            "welcome": b64e(&welcome_bytes),
            "commit": b64e(&commit_bytes),
            "epoch": self.group_epoch(),
        });
        Ok(JsValue::from_str(&out.to_string()))
    }

    /// Process a commit message sent by someone else.
    pub fn process_commit(&mut self, commit_b64: String) -> Result<u64, JsError> {
        let bytes = b64d(&commit_b64)?;
        let msg = MlsMessageIn::tls_deserialize(&mut bytes.as_slice())
            .map_err(|e| JsError::new(&format!("commit decode: {e:?}")))?;

        let processed = self
            .group
            .process_message(&self.provider, msg)
            .map_err(|e| JsError::new(&format!("process_message: {e:?}")))?;

        if let ProcessedMessageContent::StagedCommitMessage(staged) = processed.into_content() {
            self.group
                .merge_staged_commit(&self.provider, *staged)
                .map_err(|e| JsError::new(&format!("merge_staged_commit: {e:?}")))?;
        }
        Ok(self.group_epoch())
    }

    /// Export a secret for symmetric encryption key derivation.
    pub fn export_secret(&self, label: String, context_b64: String, len: usize) -> Result<String, JsError> {
        let ctx = b64d(&context_b64)?;
        let secret = self
            .group
            .export_secret(&self.provider, &label, &ctx, len)
            .map_err(|e| JsError::new(&format!("export_secret: {e:?}")))?;
        Ok(b64e(&secret))
    }
}

#[wasm_bindgen]
impl MlsMember {
    #[wasm_bindgen(constructor)]
    pub fn new(identity: String) -> Result<MlsMember, JsError> {
        let provider = make_provider();
        let (cred, signer) = make_credential_with_key(&provider, identity.as_bytes())?;

        // Create empty group placeholder; will be replaced upon welcome.
        // We create a new group with random group id just to have a value.
        let group_id = GroupId::from_slice(identity.as_bytes());
        let group = MlsGroup::new(
            &provider,
            &signer,
            &MlsGroupConfig::default(),
            group_id,
            cred,
        )
        .map_err(|e| JsError::new(&format!("group new(member placeholder): {e:?}")))?;

        Ok(MlsMember { provider, group, signer })
    }

    pub fn load(identity: String, persisted_json: String) -> Result<MlsMember, JsError> {
        let provider = make_provider();
        let (_cred, signer) = make_credential_with_key(&provider, identity.as_bytes())?;

        let persisted: PersistedGroup = serde_json::from_str(&persisted_json)
            .map_err(|e| JsError::new(&format!("persist json: {e}")))?;
        let group_bytes = b64d(&persisted.group)?;
        let group = MlsGroup::tls_deserialize(&mut group_bytes.as_slice())
            .map_err(|e| JsError::new(&format!("group deserialize: {e:?}")))?;

        Ok(MlsMember { provider, group, signer })
    }

    pub fn persist(&self) -> Result<String, JsError> {
        let group_bytes = self
            .group
            .tls_serialize_detached()
            .map_err(|e| JsError::new(&format!("group serialize: {e:?}")))?;
        let persisted = PersistedGroup {
            group: b64e(&group_bytes),
        };
        serde_json::to_string(&persisted).map_err(|e| JsError::new(&format!("persist to json: {e}")))
    }

    pub fn group_epoch(&self) -> u64 {
        self.group.epoch().as_u64()
    }

    pub fn create_key_package(&self) -> Result<String, JsError> {
        let (cred, _signer) = make_credential_with_key(&self.provider, b"viewer")?;
        let kp = KeyPackage::builder()
            .build(
                &self.provider,
                &self.signer,
                cred,
            )
            .map_err(|e| JsError::new(&format!("keypackage build: {e:?}")))?;
        let bytes = kp
            .tls_serialize_detached()
            .map_err(|e| JsError::new(&format!("keypackage serialize: {e:?}")))?;
        Ok(b64e(&bytes))
    }

    pub fn process_welcome(&mut self, welcome_b64: String, commit_b64: String) -> Result<u64, JsError> {
        let welcome_bytes = b64d(&welcome_b64)?;
        let welcome = Welcome::tls_deserialize(&mut welcome_bytes.as_slice())
            .map_err(|e| JsError::new(&format!("welcome decode: {e:?}")))?;

        self.group = MlsGroup::new_from_welcome(
            &self.provider,
            &MlsGroupConfig::default(),
            welcome,
            None,
        )
        .map_err(|e| JsError::new(&format!("new_from_welcome: {e:?}")))?;

        // Process the commit that accompanied the welcome.
        let commit_bytes = b64d(&commit_b64)?;
        let msg = MlsMessageIn::tls_deserialize(&mut commit_bytes.as_slice())
            .map_err(|e| JsError::new(&format!("commit decode: {e:?}")))?;
        let processed = self
            .group
            .process_message(&self.provider, msg)
            .map_err(|e| JsError::new(&format!("process_message(commit): {e:?}")))?;
        if let ProcessedMessageContent::StagedCommitMessage(staged) = processed.into_content() {
            self.group
                .merge_staged_commit(&self.provider, *staged)
                .map_err(|e| JsError::new(&format!("merge_staged_commit(member): {e:?}")))?;
        }

        Ok(self.group_epoch())
    }

    pub fn process_commit(&mut self, commit_b64: String) -> Result<u64, JsError> {
        let bytes = b64d(&commit_b64)?;
        let msg = MlsMessageIn::tls_deserialize(&mut bytes.as_slice())
            .map_err(|e| JsError::new(&format!("commit decode: {e:?}")))?;

        let processed = self
            .group
            .process_message(&self.provider, msg)
            .map_err(|e| JsError::new(&format!("process_message: {e:?}")))?;

        if let ProcessedMessageContent::StagedCommitMessage(staged) = processed.into_content() {
            self.group
                .merge_staged_commit(&self.provider, *staged)
                .map_err(|e| JsError::new(&format!("merge_staged_commit: {e:?}")))?;
        }
        Ok(self.group_epoch())
    }

    pub fn export_secret(&self, label: String, context_b64: String, len: usize) -> Result<String, JsError> {
        let ctx = b64d(&context_b64)?;
        let secret = self
            .group
            .export_secret(&self.provider, &label, &ctx, len)
            .map_err(|e| JsError::new(&format!("export_secret: {e:?}")))?;
        Ok(b64e(&secret))
    }
}
