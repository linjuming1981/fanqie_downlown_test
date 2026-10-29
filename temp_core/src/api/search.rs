use std::time::Duration;

use reqwest::blocking::Client;
use reqwest::header::{ACCEPT, CONTENT_TYPE, COOKIE, HeaderMap, HeaderValue, USER_AGENT};
use serde::Deserialize;
use serde_json::Value;

const AID_DEFAULT: &str = "1967";

#[derive(Deserialize)]
struct SearchRequest {
    url: String,
    query: String,
    #[serde(default = "default_aid")]
    aid: String,
    install_id: String,
}

fn default_aid() -> String {
    AID_DEFAULT.to_string()
}

pub fn handle_search_books(payload: &[u8]) -> Result<Value, String> {
    let req: SearchRequest = serde_json::from_slice(payload).map_err(|e| e.to_string())?;
    if req.query.trim().is_empty() {
        return Ok(Value::Null);
    }
    if req.url.trim().is_empty() {
        return Err("search url missing".to_string());
    }

    let client = build_client().map_err(|e| e.to_string())?;
    let response = client
        .get(&req.url)
        .query(&[
            ("offset", "0"),
            ("aid", req.aid.as_str()),
            ("q", req.query.as_str()),
        ])
        .header(COOKIE, format!("install_id={}", req.install_id))
        .send()
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json::<Value>()
        .map_err(|e| e.to_string())?;

    Ok(response)
}

fn build_client() -> Result<Client, reqwest::Error> {
    let mut headers = HeaderMap::new();
    headers.insert(
        USER_AGENT,
        HeaderValue::from_static(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
             (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        ),
    );
    headers.insert(ACCEPT, HeaderValue::from_static("application/json"));
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

    Client::builder()
        .default_headers(headers)
        .timeout(Duration::from_secs(12))
        .build()
}
