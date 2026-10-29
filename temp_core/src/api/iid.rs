use std::time::Duration;

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64_STD;
use reqwest::blocking::Client;
use reqwest::header::{ACCEPT, CONNECTION, CONTENT_TYPE, USER_AGENT};
use serde::Deserialize;
use serde_json::Value;

const CONTENT_TYPE_VALUE: &str = "application/octet-stream;tt-data=a";
const ACCEPT_VALUE: &str = "application/json, */*";
const CONNECTION_CLOSE: &str = "close";
const DEFAULT_AID: &str = "1967";
const DEFAULT_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

#[derive(Deserialize)]
struct RegisterRequest {
    url: String,
    body_b64: String,
    #[serde(default)]
    user_agent: Option<String>,
}

#[derive(Deserialize)]
struct ActivateRequest {
    url: String,
    tt_info: String,
    #[serde(default = "default_aid")]
    aid: String,
    #[serde(default)]
    user_agent: Option<String>,
}

fn default_aid() -> String {
    DEFAULT_AID.to_string()
}

pub fn handle_register(payload: &[u8]) -> Result<Value, String> {
    let request: RegisterRequest =
        serde_json::from_slice(payload).map_err(|err| err.to_string())?;
    if request.url.is_empty() {
        return Err("device register url missing".to_string());
    }
    let body = BASE64_STD
        .decode(request.body_b64)
        .map_err(|err| err.to_string())?;
    let client = build_client().map_err(|err| err.to_string())?;
    let response = client
        .post(&request.url)
        .header(
            USER_AGENT,
            request.user_agent.as_deref().unwrap_or(DEFAULT_USER_AGENT),
        )
        .header(CONTENT_TYPE, CONTENT_TYPE_VALUE)
        .header(ACCEPT, ACCEPT_VALUE)
        .header(CONNECTION, CONNECTION_CLOSE)
        .body(body)
        .send()
        .map_err(|err| err.to_string())?
        .error_for_status()
        .map_err(|err| err.to_string())?
        .json::<Value>()
        .map_err(|err| err.to_string())?;
    Ok(response)
}

pub fn handle_activate(payload: &[u8]) -> Result<Value, String> {
    let request: ActivateRequest =
        serde_json::from_slice(payload).map_err(|err| err.to_string())?;
    if request.tt_info.is_empty() {
        return Ok(Value::Null);
    }
    if request.url.is_empty() {
        return Err("activate url missing".to_string());
    }
    let client = build_client().map_err(|err| err.to_string())?;
    let response = client
        .get(&request.url)
        .header(
            USER_AGENT,
            request.user_agent.as_deref().unwrap_or(DEFAULT_USER_AGENT),
        )
        .query(&[
            ("aid", request.aid.as_str()),
            ("tt_info", request.tt_info.as_str()),
        ])
        .send()
        .map_err(|err| err.to_string())?;
    let bytes = response.bytes().map_err(|err| err.to_string())?;
    if bytes.is_empty() {
        return Ok(Value::Null);
    }
    match serde_json::from_slice(&bytes) {
        Ok(value) => Ok(value),
        Err(_) => Ok(Value::Null),
    }
}

fn build_client() -> Result<Client, reqwest::Error> {
    Client::builder().timeout(Duration::from_secs(10)).build()
}
