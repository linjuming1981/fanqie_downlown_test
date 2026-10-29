use std::collections::HashMap;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64_STD;
use once_cell::sync::Lazy;
use reqwest::Certificate;
use reqwest::Proxy;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::api;
use crate::http::HttpClient;

static REGISTRY: Lazy<ClientRegistry> = Lazy::new(ClientRegistry::new);

struct ClientRegistry {
    next: AtomicU64,
    clients: Mutex<HashMap<u64, HttpClient>>,
}

impl ClientRegistry {
    fn new() -> Self {
        Self {
            next: AtomicU64::new(1),
            clients: Mutex::new(HashMap::new()),
        }
    }

    fn insert(&self, client: HttpClient) -> u64 {
        let handle = self.next.fetch_add(1, Ordering::Relaxed);
        self.clients.lock().unwrap().insert(handle, client);
        handle
    }

    fn get(&self, handle: u64) -> Option<HttpClient> {
        self.clients.lock().unwrap().get(&handle).cloned()
    }

    fn remove(&self, handle: u64) {
        self.clients.lock().unwrap().remove(&handle);
    }
}

#[repr(C)]
pub struct FfiBuffer {
    pub ptr: *mut u8,
    pub len: usize,
}

#[derive(Deserialize)]
struct ClientConfig {
    #[serde(default)]
    default_headers: HashMap<String, String>,
    #[serde(default)]
    timeout_ms: Option<u64>,
    #[serde(default)]
    user_agent: Option<String>,
    #[serde(default)]
    proxy: Option<String>,
    #[serde(default)]
    ca_cert_pem: Option<String>,
    #[serde(default)]
    danger_accept_invalid_certs: Option<bool>,
    #[serde(default)]
    http1_only: Option<bool>,
}

#[derive(Deserialize)]
struct RequestSpec {
    method: String,
    url: String,
    #[serde(default)]
    headers: HashMap<String, String>,
    #[serde(default)]
    query: Option<String>,
    #[serde(default)]
    body_b64: Option<String>,
    #[serde(default)]
    json_body: Option<Value>,
    #[serde(default)]
    timeout_ms: Option<u64>,
}

#[derive(Serialize)]
struct ResponsePayload {
    status: u16,
    url: String,
    headers: HashMap<String, String>,
    body_b64: Option<String>,
}

#[derive(Serialize)]
struct HandlePayload {
    handle: u64,
}

#[derive(Serialize)]
struct Envelope<T> {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<T>,
}

fn success<T: Serialize>(data: T) -> Vec<u8> {
    serde_json::to_vec(&Envelope {
        ok: true,
        error: None,
        data: Some(data),
    })
    .unwrap_or_else(|err| error_payload(&err.to_string()))
}

fn error_payload(message: &str) -> Vec<u8> {
    serde_json::to_vec(&Envelope::<Value> {
        ok: false,
        error: Some(message.to_string()),
        data: None,
    })
    .unwrap_or_else(|_| Vec::new())
}

fn into_buffer(data: Vec<u8>) -> FfiBuffer {
    let mut boxed = data.into_boxed_slice();
    let ptr = boxed.as_mut_ptr();
    let len = boxed.len();
    std::mem::forget(boxed);
    FfiBuffer { ptr, len }
}

/// Creates an HTTP client handle from a JSON encoded configuration block.
///
/// # Safety
/// The caller must ensure `ptr` points to `len` bytes of readable memory containing valid UTF-8
/// JSON for the configuration. The memory must remain accessible for the duration of the call.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn tn_core_create_client(ptr: *const u8, len: usize) -> FfiBuffer {
    match create_client(ptr, len) {
        Ok(handle) => into_buffer(success(HandlePayload { handle })),
        Err(err) => into_buffer(error_payload(&err)),
    }
}

/// Executes a request using an existing client and returns the response payload.
///
/// # Safety
/// The caller must guarantee that `ptr` references `len` readable bytes containing valid UTF-8
/// JSON describing the request and that the provided `handle` was obtained from this API.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn tn_core_execute_request(
    handle: u64,
    ptr: *const u8,
    len: usize,
) -> FfiBuffer {
    match execute_request(handle, ptr, len) {
        Ok(response) => into_buffer(success(response)),
        Err(err) => into_buffer(error_payload(&err)),
    }
}

/// Drops a previously created client associated with `handle`.
///
/// # Safety
/// The caller must ensure the `handle` was returned by `tn_core_create_client` and is not used
/// again after destruction.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn tn_core_destroy_client(handle: u64) {
    REGISTRY.remove(handle);
}

/// Releases an FFI buffer that was allocated by this crate and returned to the caller.
///
/// # Safety
/// The caller must only pass buffers previously obtained from these FFI functions and must not use
/// the buffer after freeing it.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn tn_core_free_buffer(buffer: FfiBuffer) {
    if !buffer.ptr.is_null() {
        unsafe {
            let _ = Vec::from_raw_parts(buffer.ptr, buffer.len, buffer.len);
        }
    }
}

/// Invokes a generic API operation and returns the serialized response.
///
/// # Safety
/// The caller must ensure both pointer/length pairs reference readable memory for the lifetime of
/// the call and contain valid UTF-8 for the operation name and binary payload for the request.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn tn_core_call(
    op_ptr: *const u8,
    op_len: usize,
    payload_ptr: *const u8,
    payload_len: usize,
) -> FfiBuffer {
    match core_dispatch(op_ptr, op_len, payload_ptr, payload_len) {
        Ok(value) => into_buffer(success(value)),
        Err(err) => into_buffer(error_payload(&err)),
    }
}

fn create_client(ptr: *const u8, len: usize) -> Result<u64, String> {
    let config: ClientConfig = read_json(ptr, len)?;
    let mut builder = HttpClient::builder();
    if !config.default_headers.is_empty() {
        let mut header_map = reqwest::header::HeaderMap::new();
        for (key, value) in config.default_headers {
            let name = reqwest::header::HeaderName::from_bytes(key.as_bytes())
                .map_err(|err| err.to_string())?;
            let val =
                reqwest::header::HeaderValue::from_str(&value).map_err(|err| err.to_string())?;
            header_map.insert(name, val);
        }
        builder = builder.default_headers(header_map);
    }
    if let Some(ms) = config.timeout_ms {
        builder = builder.timeout(Duration::from_millis(ms));
    }
    if let Some(ua) = config.user_agent {
        builder = builder.user_agent(ua);
    }
    if let Some(proxy_uri) = config.proxy {
        let proxy = Proxy::all(&proxy_uri).map_err(|err| err.to_string())?;
        builder = builder.proxy(proxy);
    }
    if let Some(pem_b64) = config.ca_cert_pem {
        let data = BASE64_STD.decode(pem_b64).map_err(|err| err.to_string())?;
        let cert = Certificate::from_pem(&data).map_err(|err| err.to_string())?;
        builder = builder.add_root_certificate(cert);
    }
    if config.danger_accept_invalid_certs.unwrap_or(false) {
        builder = builder.danger_accept_invalid_certs(true);
    }
    if config.http1_only.unwrap_or(false) {
        builder = builder.http1_only();
    }
    let client = builder.build().map_err(|err| err.to_string())?;
    Ok(REGISTRY.insert(client))
}

fn execute_request(handle: u64, ptr: *const u8, len: usize) -> Result<ResponsePayload, String> {
    let spec: RequestSpec = read_json(ptr, len)?;
    let client = REGISTRY
        .get(handle)
        .ok_or_else(|| "invalid client handle".to_string())?;
    let method = spec
        .method
        .parse::<reqwest::Method>()
        .map_err(|err| err.to_string())?;
    let mut builder = client.request(method, &spec.url);
    if let Some(query) = spec.query {
        let pairs: Vec<(String, String)> =
            serde_urlencoded::from_str(&query).map_err(|err| err.to_string())?;
        builder = builder.query(&pairs);
    }
    if !spec.headers.is_empty() {
        let mut headers = reqwest::header::HeaderMap::new();
        for (key, value) in spec.headers {
            let name = reqwest::header::HeaderName::from_bytes(key.as_bytes())
                .map_err(|err| err.to_string())?;
            let val =
                reqwest::header::HeaderValue::from_str(&value).map_err(|err| err.to_string())?;
            headers.append(name, val);
        }
        builder = builder.headers(headers);
    }
    if let Some(ms) = spec.timeout_ms {
        builder = builder.timeout(Duration::from_millis(ms));
    }
    if let Some(json) = spec.json_body {
        builder = builder.json(&json);
    } else if let Some(body_b64) = spec.body_b64 {
        let bytes = BASE64_STD.decode(body_b64).map_err(|err| err.to_string())?;
        builder = builder.body(bytes);
    }
    let response = builder.send().map_err(|err| err.to_string())?;
    let status = response.status().as_u16();
    let url = response.url().to_string();
    let mut headers = HashMap::new();
    for (key, value) in response.headers().iter() {
        if let Ok(text) = value.to_str() {
            headers.insert(key.as_str().to_string(), text.to_string());
        }
    }
    let body = response.bytes().map_err(|err| err.to_string())?;
    let body_b64 = if body.is_empty() {
        None
    } else {
        Some(BASE64_STD.encode(body))
    };
    Ok(ResponsePayload {
        status,
        url,
        headers,
        body_b64,
    })
}

fn read_json<T: for<'de> Deserialize<'de>>(ptr: *const u8, len: usize) -> Result<T, String> {
    if ptr.is_null() {
        return Err("null pointer".to_string());
    }
    let slice = unsafe { std::slice::from_raw_parts(ptr, len) };
    serde_json::from_slice(slice).map_err(|err| err.to_string())
}

fn core_dispatch(
    op_ptr: *const u8,
    op_len: usize,
    payload_ptr: *const u8,
    payload_len: usize,
) -> Result<Value, String> {
    let op = read_utf8(op_ptr, op_len)?;
    let payload = read_bytes(payload_ptr, payload_len)?;
    api::handle_call(&op, &payload)
}

fn read_utf8(ptr: *const u8, len: usize) -> Result<String, String> {
    if ptr.is_null() {
        return Err("null pointer".to_string());
    }
    let slice = unsafe { std::slice::from_raw_parts(ptr, len) };
    std::str::from_utf8(slice)
        .map(|s| s.to_string())
        .map_err(|err| err.to_string())
}

fn read_bytes(ptr: *const u8, len: usize) -> Result<Vec<u8>, String> {
    if ptr.is_null() {
        return Err("null pointer".to_string());
    }
    let slice = unsafe { std::slice::from_raw_parts(ptr, len) };
    Ok(slice.to_vec())
}
