use std::time::Duration;

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64_STD;
use reqwest::blocking::Client;
use serde::Deserialize;
use serde_json::json;

#[derive(Deserialize)]
struct MediaFetchRequest {
    url: String,
    #[serde(default = "default_timeout")]
    timeout_ms: u64,
}

fn default_timeout() -> u64 {
    10_000
}

pub fn handle_media_fetch(payload: &[u8]) -> Result<serde_json::Value, String> {
    let request: MediaFetchRequest =
        serde_json::from_slice(payload).map_err(|err| err.to_string())?;
    if request.url.is_empty() {
        return Err("media fetch url missing".to_string());
    }
    let client = Client::builder()
        .timeout(Duration::from_millis(request.timeout_ms.max(1)))
        .build()
        .map_err(|err| err.to_string())?;
    let response = client
        .get(&request.url)
        .send()
        .map_err(|err| err.to_string())?
        .error_for_status()
        .map_err(|err| err.to_string())?;
    let bytes = response.bytes().map_err(|err| err.to_string())?;
    Ok(json!({ "body_b64": BASE64_STD.encode(bytes) }))
}
